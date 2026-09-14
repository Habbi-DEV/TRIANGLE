import supabase from './_lib/db-client.js';
import { setCors } from './_lib/auth.js';
import { internalError, toId, rateLimit } from './_lib/validate.js';

// GET public (VAPID key only). POST hardened (FIX C3).
export default async function handler(req, res) {
  setCors(req, res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) return res.status(503).json({ error: 'Push notifications are not configured' });
    return res.status(200).json({ publicKey: key });
  }

  if (req.method === 'POST') {
    try {
      if (!rateLimit(req, res, { max: 10, windowMs: 60_000, key: 'push-sub' })) return;
      const { order_id, order_token, subscription } = req.body || {};
      const orderId = toId(order_id);
      const endpoint = subscription?.endpoint;
      const p256dh = subscription?.keys?.p256dh;
      const auth = subscription?.keys?.auth;

      if (!orderId || typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') {
        return res.status(400).json({ error: 'order_id and a valid push subscription are required' });
      }
      // Strict format/length (FIX: flood + junk)
      if (!/^https:\/\/.{5,500}$/.test(endpoint) || endpoint.length > 500) {
        return res.status(400).json({ error: 'Invalid subscription endpoint' });
      }
      if (!/^[A-Za-z0-9\-_]{20,200}$/.test(p256dh) || p256dh.length > 200) {
        return res.status(400).json({ error: 'Invalid subscription key' });
      }
      if (!/^[A-Za-z0-9+/=_-]{10,200}$/.test(auth) || auth.length > 200) {
        return res.status(400).json({ error: 'Invalid subscription auth' });
      }
      // Ownership proof: order must exist; if it has access_token, token must match.
      const { data: order } = await supabase.from('orders').select('id, access_token').eq('id', orderId).single();
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (order.access_token && order_token !== order.access_token) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { error } = await supabase.from('push_subscriptions')
        .upsert({ order_id: orderId, endpoint, p256dh, auth }, { onConflict: 'endpoint' });
      if (error) return internalError(res, error, 'push-subscribe');

      return res.status(200).json({ ok: true });
    } catch (err) {
      return internalError(res, err, 'push-subscribe API error');
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
