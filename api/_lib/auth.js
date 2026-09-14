import supabase from './db-client.js';

// ----------------------------------------------------------------------------
// CORS — secure by default. FIX (CORS fail-open):
// - In production ALLOWED_ORIGINS is REQUIRED, no '*' fallback.
// - In dev (NODE_ENV/Vercel env missing) we still restrict to localhost.
// ----------------------------------------------------------------------------
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'];

export function setCors(req, res, methods = 'GET, POST, PUT, DELETE, OPTIONS') {
  const origin = req.headers.origin;
  const isDev = !process.env.VERCEL && ALLOWED_ORIGINS.length === 0;
  const allowed = isDev ? DEV_ORIGINS : ALLOWED_ORIGINS;

  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!isDev && ALLOWED_ORIGINS.length === 0) {
    // Production misconfiguration: do NOT open to '*'. Just don't set the header.
  }
  // Always vary on Origin when we reflect it
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// ----------------------------------------------------------------------------
// Auth — FIX: robust Bearer parsing (case-insensitive, extra spaces)
// ----------------------------------------------------------------------------
function extractToken(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export async function requireAuth(req, res) {
  const token = extractToken(req);
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

async function getRole(userId) {
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', userId).single();
  return profile?.role || null;
}

// FIX (H1 least-privilege): split staff roles.
// - Managers: admin/cashier/kitchen -> menu, tables, inventory, stats, orders PUT
// - Drivers: delivery_driver/admin -> driver-orders only
// - Admin: admin only
const MANAGER_ROLES = new Set(['admin', 'cashier', 'kitchen']);
const DRIVER_ROLES = new Set(['delivery_driver', 'admin']);

export async function requireStaff(req, res) {
  // Backward-compatible: any manager OR driver. Prefer requireManager/requireDriver.
  const user = await requireAuth(req, res);
  if (!user) return null;
  const role = await getRole(user.id);
  if (!MANAGER_ROLES.has(role) && !DRIVER_ROLES.has(role)) {
    res.status(403).json({ error: 'Staff access required' });
    return null;
  }
  user.role = role;
  return user;
}

export async function requireManager(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  const role = await getRole(user.id);
  if (!MANAGER_ROLES.has(role)) {
    res.status(403).json({ error: 'Manager access required' });
    return null;
  }
  user.role = role;
  return user;
}

export async function requireDriver(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  const role = await getRole(user.id);
  if (!DRIVER_ROLES.has(role)) {
    res.status(403).json({ error: 'Driver access required' });
    return null;
  }
  user.role = role;
  return user;
}

export async function requireAdmin(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  const role = await getRole(user.id);
  if (role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }
  user.role = role;
  return user;
}
