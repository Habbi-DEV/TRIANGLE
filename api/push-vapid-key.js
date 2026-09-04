import { setCors } from './_lib/auth.js';

// Public — the VAPID public key is meant to be visible to any browser that
// wants to subscribe (it's the whole point of the "public" half of the
// keypair). The private key it's paired with never leaves the server (see
// api/_lib/push.js) and is never exposed here.
export default function handler(req, res) {
  setCors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'Push notifications are not configured' });
  return res.status(200).json({ publicKey: key });
}
