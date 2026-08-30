import supabase from './_lib/db-client.js';
import { setCors, requireAuth } from './_lib/auth.js';
import { broadcastDriverEvent, DRIVER_EVENTS } from './_lib/broadcast.js';

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
    .from('profiles').select('role').eq('id', user.id).single();
  if (error || !DRIVER_ROLES.has(profile?.role)) {
    res.status(403).json({ error: 'Driver access required' });
    return null;
  }
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
  if (!ids.length) return orders || [];
  const { data: items } = await supabase
    .from('order_items').select('*').in('order_id', ids).order('id');
  const byOrder = {};
  for (const it of items || []) (byOrder[it.order_id] ||= []).push(it);
  return orders.map((o) => ({ ...o, items: byOrder[o.id] || [] }));
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
    //   served).
    // ?scope=mine (default) -> this driver's current + very recent
    //   deliveries (their active order + short history), newest first.
    if (req.method === 'GET') {
      const scope = req.query.scope === 'available' ? 'available' : 'mine';

      let q = supabase.from('orders').select('*').eq('order_type', 'delivery');
      q = scope === 'available'
        ? q.eq('status', 'ready').is('driver_id', null).eq('delivery_status', 'unassigned')
        : q.eq('driver_id', user.id);

      const { data, error } = await q.order('created_at', { ascending: false }).limit(50);
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

        const cleanNote = typeof note === 'string' ? note.trim().slice(0, 300) : '';
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

        await restoreStockForCancelledOrder(existing);

        return res.status(200).json(data);
      }

      const transition = TRANSITIONS[action];
      if (!id || !transition) {
        return res.status(400).json({ error: 'Invalid id or action' });
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

      // Tell every other driver's "available" tab right away — see
      // api/_lib/broadcast.js for why this can't just rely on Realtime's
      // normal RLS-filtered postgres_changes feed.
      if (action === 'accept') {
        await broadcastDriverEvent(DRIVER_EVENTS.TAKEN, data.id);
      }

      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[api/driver-orders]', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
