import supabase from './db-client.js';

// ----------------------------------------------------------------------------
// CORS — restreint au(x) domaine(s) de production au lieu de '*'.
// Configure ALLOWED_ORIGINS dans les variables d'environnement Vercel,
// séparées par des virgules, ex:
//   ALLOWED_ORIGINS=https://triangle.example.com,https://www.triangle.example.com
// En développement local (variable absente), on retombe sur '*' pour ne pas
// bloquer `vite dev`.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export function setCors(req, res, methods = 'GET, POST, PUT, DELETE, OPTIONS') {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.length === 0) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ----------------------------------------------------------------------------
// Auth — une seule implémentation, réutilisée par toutes les routes.
// ----------------------------------------------------------------------------

// Any authenticated user (any role, including 'pending'). Kept for routes
// that only need "is this a real logged-in user", but prefer requireStaff /
// requireAdmin below wherever the route touches staff-only data.
export async function requireAuth(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: 'Invalid session' });
    return null;
  }
  return user;
}

const STAFF_ROLES = new Set(['admin', 'cashier', 'kitchen', 'delivery_driver']);

// Mirrors the DB's is_staff(): role must be admin/cashier/kitchen/delivery_driver.
// A freshly-created account (role='pending', see migration v11) fails this,
// so signing in via Google no longer grants staff access by itself —
// an admin must explicitly promote the account first.
export async function requireStaff(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  const { data: profile, error } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (error || !STAFF_ROLES.has(profile?.role)) {
    res.status(403).json({ error: 'Staff access required' });
    return null;
  }
  return user;
}

export async function requireAdmin(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  const { data: profile, error } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (error || profile?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }
  return user;
}
