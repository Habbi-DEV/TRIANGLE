// Shared security helpers: validation, sanitization, audit, in-function rate limit.
// Used by all /api handlers (defense-in-depth alongside middleware.ts).

export function internalError(res, err, label = 'API error') {
  console.error(label, err?.stack || err);
  // Return actual message for debugging (client shows it as toast); still log full stack server-side
  const msg = err?.message ? String(err.message).slice(0, 300) : 'Internal error';
  return res.status(500).json({ error: msg });
}

export function isValidId(n) {
  return Number.isInteger(n) && n > 0 && n < 2147483647;
}

export function toId(v) {
  const n = Number(v);
  return isValidId(n) ? n : null;
}

export function clampStr(v, max = 300, min = 0) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.length < min) return null;
  return s.slice(0, max);
}

// Sanitize free-text for storage: strip control chars, cap length.
// Rendering must still escape (React does by default; invoice.ts uses escapeHtml).
export function cleanText(v, max = 300) {
  if (typeof v !== 'string') return null;
  return v.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max) || null;
}

const URL_RE = /^https:\/\/[^\s<>"']{4,2000}$/;
export function isSafeHttpUrl(u) {
  if (typeof u !== 'string') return false;
  if (u.length > 2000) return false;
  if (/^\s*(javascript|data|vbscript|blob|file):/i.test(u.trim())) return false;
  return URL_RE.test(u.trim());
}

export function isSafeImageUrl(u) {
  // Allow https URLs + relative /images/... paths (uploaded via /api/upload)
  if (typeof u !== 'string' || !u.trim()) return true; // empty = allowed (cleared)
  const t = u.trim();
  if (t.startsWith('/')) return t.length <= 500 && !t.includes('..') && !/[<>"']/.test(t);
  return isSafeHttpUrl(t);
}

export function isValidPhone(p) {
  if (typeof p !== 'string') return false;
  const digits = p.replace(/[^\d+]/g, '');
  return digits.length >= 6 && digits.length <= 20 && /^\+?[\d\s-]+$/.test(p.trim());
}

export function isValidPrice(n, max = 100000) {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 && v <= max;
}

// ---- In-function sliding-window rate limit (per serverless instance) ----
// middleware.ts already does this at the edge; this is a second layer so a
// direct function invocation is still throttled.
const hits = new Map();
export function rateLimit(req, res, { windowMs = 60_000, max = 60, key = null } = {}) {
  const ip =
    req.headers['x-real-ip'] ||
    (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() ||
    'unknown';
  const k = `${key || 'global'}:${ip}`;
  const now = Date.now();
  const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(k, arr);
  if (hits.size > 5000) {
    for (const [kk, vv] of hits) if (vv.every((t) => now - t > windowMs)) hits.delete(kk);
  }
  if (arr.length > max) {
    res.status(429).json({ error: 'Too many requests' });
    return false;
  }
  return true;
}

// ---- Audit log (best-effort, never blocks the request) ----
export async function audit(supabase, { actorId, action, entity, entityId, meta }) {
  try {
    await supabase.from('audit_logs').insert({
      actor_id: actorId || null,
      action: String(action).slice(0, 100),
      entity: String(entity || '').slice(0, 50),
      entity_id: entityId != null ? String(entityId).slice(0, 100) : null,
      meta: meta ? JSON.parse(JSON.stringify(meta).slice(0, 2000)) : null,
    });
  } catch (e) {
    console.error('[audit]', e?.message || e);
  }
}

// Allowed order status transitions (server-side state machine)
export const ORDER_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'completed', 'cancelled'],
  out_for_delivery: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};
