import supabase from '../_lib/db-client.js';
import { setCors } from '../_lib/auth.js';
import { sendPushToOrder } from '../_lib/push.js';
import { internalError, toId, cleanText, rateLimit, audit } from '../_lib/validate.js';

// ----------------------------------------------------------------------------
// Customer self-service cancellation.
//
//   POST /api/orders/cancel   { id, order_token, reason, note? }
//
// No staff auth — this is called from the public order tracker before the
// customer has any session. Identity/ownership is proven the same way the
// tracker's own GET is: the per-order `access_token` issued at checkout
// (POST /api/orders) and echoed back here as `order_token`.
//
// Business rule (enforced ONLY server-side — never trust the client's clock
// or its idea of the order's current status):
//   - order.status must be strictly 'pending'
//   - less than 5 minutes must have passed since order.created_at
// Both are re-checked against the DB row fetched in this request, and the
// final UPDATE is itself conditioned on status = 'pending' so a race (the
// kitchen confirms the order in the same instant the customer taps cancel)
// can't slip through between the check and the write.
// ----------------------------------------------------------------------------

const CANCEL_WINDOW_MS = 5 * 60 * 1000;

// Stored on orders.cancel_reason. Kept in English server-side (independent
// of the customer's UI language), same convention as
// api/driver-orders.js's CANCEL_REASON_LABEL for driver cancellations —
// never trust a client-supplied label string, only a fixed reason code.
const CANCEL_REASON_LABEL = {
  changed_mind: 'Customer changed their mind',
  ordered_by_mistake: 'Ordered by mistake',
  duplicate_order: 'Duplicate order',
  too_long_wait: 'Wait time too long',
  other: 'Other',
};

export default async function handler(req, res) {
  setCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Public, unauthenticated endpoint that mutates data -> tight rate limit.
    if (!rateLimit(req, res, { max: 10, windowMs: 60_000, key: 'order-cancel' })) return;

    const { id, order_token, reason, note } = req.body || {};

    const orderId = toId(id);
    if (!orderId) return res.status(400).json({ error: 'Invalid order id' });

    if (typeof order_token !== 'string' || !order_token) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!CANCEL_REASON_LABEL[reason]) {
      return res.status(400).json({ error: 'Invalid cancellation reason' });
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('orders').select('*').eq('id', orderId).single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Order not found' });

    // Ownership: must match the token issued at checkout. No legacy
    // fallback here (unlike the GET route) — a mutating endpoint should
    // never be reachable without proof of ownership.
    if (!existing.access_token || order_token !== existing.access_token) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // ---- Strict server-side validation (source of truth, not the client) ----
    if (existing.status !== 'pending') {
      const messages = {
        confirmed: 'This order has already been confirmed by the restaurant and can no longer be cancelled.',
        preparing: 'This order is already being prepared and can no longer be cancelled.',
        ready: 'This order is ready and can no longer be cancelled.',
        out_for_delivery: 'This order is already out for delivery and can no longer be cancelled.',
        completed: 'This order has already been completed.',
        cancelled: 'This order has already been cancelled.',
      };
      return res.status(409).json({
        error: messages[existing.status] || 'This order can no longer be cancelled.',
        status: existing.status,
      });
    }

    const createdAtMs = new Date(existing.created_at).getTime();
    if (!Number.isFinite(createdAtMs) || Date.now() - createdAtMs > CANCEL_WINDOW_MS) {
      return res.status(409).json({
        error: 'The 5-minute cancellation window for this order has expired.',
        status: existing.status,
        expired: true,
      });
    }

    const cleanNote = cleanText(note, 300) || '';
    const cancel_reason = cleanNote
      ? `${CANCEL_REASON_LABEL[reason]}: ${cleanNote}`
      : CANCEL_REASON_LABEL[reason];

    // Conditional update (status = 'pending' in the WHERE clause) closes the
    // race window: if the row changed between the read above and this write,
    // zero rows match and we report a conflict instead of silently
    // cancelling an order the kitchen just accepted.
    const { data: updated, error: updateErr } = await supabase
      .from('orders')
      .update({ status: 'cancelled', cancel_reason, cancelled_by: 'customer' })
      .eq('id', orderId)
      .eq('status', 'pending')
      .select()
      .single();

    if (updateErr || !updated) {
      return res.status(409).json({ error: 'This order can no longer be cancelled — please refresh.' });
    }

    const { delivery_otp: _otp, access_token: _tok, ...safeOrder } = updated;
    res.status(200).json(safeOrder);

    // ---- Non-blocking side effects (never delay the customer's response) ----
    audit(supabase, {
      actorId: null,
      action: 'order.customer_cancel',
      entity: 'orders',
      entityId: orderId,
      meta: { reason, note: cleanNote || undefined },
    }).catch(console.error);

    (async () => {
      const { data: items } = await supabase
        .from('order_items').select('product_id, quantity').eq('order_id', existing.id);
      if (!items?.length) return;
      const { data: products } = await supabase
        .from('products').select('id, stock').in('id', items.map((i) => i.product_id));
      const stockById = Object.fromEntries((products || []).map((p) => [p.id, p.stock ?? 0]));
      await Promise.all(items.flatMap((it) => [
        supabase.from('products').update({ stock: (stockById[it.product_id] ?? 0) + it.quantity }).eq('id', it.product_id),
        supabase.from('inventory_logs').insert({
          product_id: it.product_id, change: it.quantity, reason: 'correction',
          notes: `Order #${existing.id + 1000} cancelled by customer — stock restored`,
        }),
      ])).catch((err) => console.error(`Stock restore failed for order #${existing.id}:`, err));
    })().catch(console.error);

    if (existing.order_type === 'dine_in' && existing.table_number) {
      supabase.from('tables').update({ status: 'available' }).eq('table_number', existing.table_number)
        .then(({ error }) => { if (error) console.error('[tables available]', error); });
    }

    sendPushToOrder(existing.id, {
      title: 'TRIANGLE',
      body: 'Votre commande a été annulée.',
      tag: `order-${existing.id}`,
      url: '/',
    }).catch(console.error);
  } catch (err) {
    return internalError(res, err, 'orders/cancel API error');
  }
}
