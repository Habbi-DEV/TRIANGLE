import supabase from './_lib/db-client.js';
import { setCors } from './_lib/auth.js';

// Public, deliberately: there's no customer login anywhere in this app (see
// MenuPage's LAST_ORDER_KEY comment), so a subscription can only ever be
// tied to the order_id the customer's own browser already knows about —
// same trust model as GET /api/orders?id=. Nothing here lets one order's
// customer read or affect another order.
export default async function handler(req, res) {
  setCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { order_id, subscription } = req.body || {};
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const auth = subscription?.keys?.auth;

    if (!order_id || !endpoint || !p256dh || !auth) {
      return res.status(400).json({ error: 'order_id and a valid push subscription are required' });
    }

    // A given browser subscription (endpoint) is unique per browser+origin
    // — upsert on it so re-subscribing the same browser to the same order
    // (e.g. the customer reopens the tracker after a reload) updates the
    // existing row instead of erroring on the unique constraint, while
    // still allowing one browser to hold separate rows for different
    // orders placed later.
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({ order_id: Number(order_id), endpoint, p256dh, auth }, { onConflict: 'endpoint' });
    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('push-subscribe API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
