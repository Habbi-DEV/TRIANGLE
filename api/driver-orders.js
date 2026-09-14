import supabase from './_lib/db-client.js';
import { setCors, requireAuth } from './_lib/auth.js';
import { broadcastDriverEvent, DRIVER_EVENTS } from './_lib/broadcast.js';
import { internalError, cleanText } from './_lib/validate.js';

// Only these two roles may use the driver endpoints. Admins are included so
// staff can test/support the flow from an admin account without needing a
// second seeded driver login.
const DRIVER_ROLES = new Set(['delivery_driver', 'admin']);

// Labels stored on orders.cancel_reason when the driver picks a preset
// reason. Kept in English server-side (independent of the app's UI
// language) — the driver's optional free-text note (for 'other', or
// appended to any reason) is stored verbatim alongside it.
const CANCEL_REASON_LABEL = {
  no_answer: 'Customer did not answer the phone',
  refused: 'Customer refused the order',
  not_found: 'Could not find the customer / address',
  other: 'Other',
};

// Delivery statuses from which a driver may still cancel — any time after
// accepting, up until the order is actually marked delivered.
const CANCELLABLE_STATUSES = new Set(['accepted', 'picked_up', 'on_the_way']);

async function requireDriver(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  const { data: profile, error } = await supabase
    .from('profiles').select('role, is_online').eq('id', user.id).single();
  if (error || !DRIVER_ROLES.has(profile?.role)) {
    res.status(403).json({ error: 'Driver access required' });
    return null;
  }
  // Attach the profile onto the user object so callers (the GET handler
  // below) can check is_online without a second round-trip.
  user.profile = profile;
  return user;
}

// Each action maps to an exact required current delivery_status ("from")
// and the state it moves the order to. Enforced server-side (never trust
// a delivery_status sent by the client) so a driver can't skip a step by
// replaying/editing a request.
const TRANSITIONS = {
  accept:     { from: 'unassigned', to: 'accepted',   orderStatus: null },
  picked_up:  { from: 'accepted',   to: 'picked_up',  orderStatus: 'out_for_delivery' },
  on_the_way: { from: 'picked_up',  to: 'on_the_way', orderStatus: null },
  delivered:  { from: 'on_the_way', to: 'delivered',  orderStatus: 'completed' },
};

async function attachItems(orders) {
  const ids = (orders || []).map((o) => o.id);
  if (!ids.length) return stripSecrets(orders || []);
  const { data: items } = await supabase
    .from('order_items').select('*').in('order_id', ids).order('id');
  const byOrder = {};
  for (const it of items || []) (byOrder[it.order_id] ||= []).push(it);
  return stripSecrets(orders.map((o) => ({ ...o, items: byOrder[o.id] || [] })));
}

// SECURITY: the driver must get the delivery code FROM THE CUSTOMER (asked
// verbally at the door), never from the API — otherwise they could read it
// and self-approve a fake delivery. access_token is the customer's tracking
// secret for the same reason. Both are stripped from every response here;
// the server still checks them on write (delivered action + push subscribe).
function stripSecrets(orders) {
  return (orders || []).map((o) => {
    const { delivery_otp: _otp, access_token: _tok, ...safe } = o;
    return safe;
  });
}

// Same behaviour as api/orders.js's staff-cancel path — this cancel comes
// through a different endpoint entirely, so it needs its own copy rather
// than silently skipping the restock. Best-effort: logged, not thrown, so
// a restock hiccup never blocks the cancellation itself from going through.
async function restoreStockForCancelledOrder(order) {
  const { data: cancelledItems } = await supabase
    .from('order_items').select('product_id, quantity').eq('order_id', order.id);
  if (!cancelledItems?.length) return;

  const { data: currentProducts } = await supabase
    .from('products').select('id, stock').in('id', cancelledItems.map((i) => i.product_id));
  const stockById = Object.fromEntries((currentProducts || []).map((p) => [p.id, p.stock ?? 0]));

  await Promise.all(
    cancelledItems.flatMap((it) => [
      supabase.from('products')
        .update({ stock: (stockById[it.product_id] ?? 0) + it.quantity })
        .eq('id', it.product_id),
      supabase.from('inventory_logs').insert({
        product_id: it.product_id,
        change: it.quantity,
        reason: 'correction',
        notes: `Order #${order.id + 1000} cancelled by driver — stock restored`,
      }),
    ])
  ).catch((err) => console.error(`Stock restore failed for cancelled order #${order.id}:`, err));
}

export default async function handler(req, res) {
  setCors(req, res, 'GET, PUT, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await requireDriver(req, res);
    if (!user) return;

    // ------------------------------------------------------------- GET
    // ?scope=available -> unclaimed, kitchen-ready delivery orders (the
    //   "Pending Orders" tab — anyone can accept these, first come first
    //   served). Only returned while this driver is toggled online — see
    //   migration_v15_driver_online_status.sql.
    // ?scope=mine (default) -> this driver's current + very recent
    //   deliveries (their active order + short history), newest first.
    //   Always returned regardless of online status, so a driver who goes
    //   offline mid-delivery can still see and finish the order they hold.
    // ?scope=history -> this driver's finished (delivered/cancelled)
    //   deliveries, for the Earnings/History tab. Optional ?days=N narrows
    //   the window (default 30, max 90); always available offline or on.
    if (req.method === 'GET') {
      const scope = ['available', 'history'].includes(req.query.scope) ? req.query.scope : 'mine';

      if (scope === 'available') {
        // Driver hasn't opted in to receiving new orders right now — hand
        // back an empty list rather than the full unclaimed pool, so
        // "offline" actually means invisible, not just a UI filter the
        // client could bypass. Admins are exempt (see DRIVER_ROLES above)
        // so support staff can still see/test this feed from an admin
        // account without needing to flip an is_online switch that only
        // means something for real drivers.
        if (user.profile?.role === 'delivery_driver' && !user.profile?.is_online) {
          return res.status(200).json([]);
        }

        // FIX H5 privacy: mask PII until accept. Available list shows zone/total
        // only — exact address/phone/lat-lng revealed after claim (scope=mine).
        const { data, error } = await supabase
          .from('orders').select('id, order_type, status, subtotal, total, delivery_fee, created_at, delivery_status, driver_id')
          .eq('order_type', 'delivery')
          .eq('status', 'ready').is('driver_id', null).eq('delivery_status', 'unassigned')
          .order('created_at', { ascending: false }).limit(50);
        if (error) return internalError(res, error, '[api/driver-orders] available');
        return res.status(200).json(await attachItems(data || []));
      }

      if (scope === 'history') {
        const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
          .from('orders').select('*').eq('order_type', 'delivery').eq('driver_id', user.id)
          .in('status', ['completed', 'cancelled'])
          .gte('created_at', since)
          .order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        return res.status(200).json(await attachItems(data || []));
      }

      const { data, error } = await supabase
        .from('orders').select('*').eq('order_type', 'delivery').eq('driver_id', user.id)
        .order('created_at', { ascending: false }).limit(50);
      if (error) throw error;

      return res.status(200).json(await attachItems(data || []));
    }

    // ------------------------------------------------------------- PUT
    // Body: { id, action } where action is one of the TRANSITIONS keys, or
    // action: 'cancel' (see below) to abandon a delivery mid-route.
    if (req.method === 'PUT') {
      const { id, action } = req.body || {};

      // --- Driver-initiated cancellation --------------------------------
      // e.g. the driver reached the address but the customer isn't
      // answering or refuses the order. Unlike the normal step
      // transitions, this is allowed from any of several current states
      // (not just one fixed "from"), so it's handled separately rather
      // than forced into the TRANSITIONS table below.
      if (action === 'cancel') {
        const { reason, note } = req.body || {};
        if (!id || !CANCEL_REASON_LABEL[reason]) {
          return res.status(400).json({ error: 'Invalid id or cancellation reason' });
        }

        const { data: existing, error: exErr } = await supabase
          .from('orders').select('*').eq('id', Number(id)).eq('driver_id', user.id).single();
        if (exErr || !existing) return res.status(404).json({ error: 'Order not found' });
        if (!CANCELLABLE_STATUSES.has(existing.delivery_status)) {
          return res.status(409).json({ error: 'This order can no longer be cancelled — refresh your list.' });
        }

        const cleanNote = cleanText(note, 300) || '';
        const cancel_reason = cleanNote
          ? `${CANCEL_REASON_LABEL[reason]}: ${cleanNote}`
          : CANCEL_REASON_LABEL[reason];

        // The DB trigger (guard_delivery_transition, see
        // schema_driver_dashboard_v3.sql) automatically resets driver_id
        // to null and delivery_status to 'unassigned' whenever status
        // flips to 'cancelled' — so this update alone fully frees the
        // order, it doesn't need to be done here too.
        const { data, error } = await supabase
          .from('orders')
          .update({ status: 'cancelled', cancel_reason })
          .eq('id', Number(id)).eq('driver_id', user.id).select().single();
        if (error) throw error;

        const { delivery_otp: _c1, access_token: _c2, ...safeCancelled } = data || {};
        res.status(200).json(safeCancelled);
        // fire-and-forget stock restore (non-blocking)
        restoreStockForCancelledOrder(existing).catch(console.error);
        return;
      }

      const transition = TRANSITIONS[action];
      if (!id || !transition) {
        return res.status(400).json({ error: 'Invalid id or action' });
      }

      // NEW (20y exp): fake-delivery prevention — delivered requires customer OTP.
      if (action === 'delivered') {
        const { data: check } = await supabase.from('orders').select('id, delivery_otp, driver_id').eq('id', Number(id)).single();
        if (!check || check.driver_id !== user.id) return res.status(404).json({ error: 'Order not found' });
        if (check.delivery_otp && String(req.body?.otp) !== String(check.delivery_otp)) {
          return res.status(403).json({ error: 'Delivery code required — ask the customer for the 4-digit code' });
        }
      }

      const patch = {
        delivery_status: transition.to,
        ...(transition.orderStatus ? { status: transition.orderStatus } : {}),
        ...(transition.to === 'delivered' ? { delivered_at: new Date().toISOString() } : {}),
      };

      // Accepting is the only transition that also claims the order (sets
      // driver_id), and the only one where a race with another driver is
      // possible — so it's guarded by an atomic conditional update
      // (WHERE driver_id IS NULL AND delivery_status = 'unassigned').
      // Every later step is scoped to driver_id = this driver, so only the
      // driver who holds the order can advance it further.
      let query = supabase.from('orders').update(
        action === 'accept' ? { ...patch, driver_id: user.id } : patch
      ).eq('id', Number(id)).eq('order_type', 'delivery').eq('delivery_status', transition.from);

      query = action === 'accept'
        ? query.is('driver_id', null).eq('status', 'ready')
        : query.eq('driver_id', user.id);

      const { data, error } = await query.select().single();

      if (error || !data) {
        // Distinguish "someone else already took it" / "order moved on"
        // from a genuine server error, so the app can show a clean
        // "already accepted" toast instead of a generic failure.
        const { data: current } = await supabase
          .from('orders').select('driver_id, delivery_status').eq('id', Number(id)).single();
        if (current && current.delivery_status !== transition.from) {
          return res.status(409).json({ error: 'This order has already moved on — refresh your list.' });
        }
        if (error) throw error;
        return res.status(404).json({ error: 'Order not found' });
      }

      const { delivery_otp: _o1, access_token: _o2, ...safeOrder } = data || {};
      res.status(200).json(safeOrder);
      // fire-and-forget broadcast (non-blocking)
      if (action === 'accept') {
        broadcastDriverEvent(DRIVER_EVENTS.TAKEN, data.id).catch(console.error);
      }
      return;
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return internalError(res, err, '[api/driver-orders]');
  }
}
