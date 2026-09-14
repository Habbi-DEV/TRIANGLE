import supabase from './_lib/db-client.js';
import { setCors, requireAdmin } from './_lib/auth.js';
import { internalError, audit } from './_lib/validate.js';

const ASSIGNABLE_ROLES = new Set(['admin', 'cashier', 'kitchen', 'delivery_driver', 'pending']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  setCors(req, res, 'GET, PUT, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('profiles')
        .select('id, email, full_name, role, created_at').order('created_at', { ascending: false });
      if (error) return internalError(res, error, 'staff GET');
      return res.status(200).json(data);
    }

    if (req.method === 'PUT') {
      const { id, role } = req.body || {};
      if (typeof id !== 'string' || !UUID_RE.test(id) || !ASSIGNABLE_ROLES.has(role)) {
        return res.status(400).json({ error: 'id and a valid role are required' });
      }
      if (id === admin.id) return res.status(400).json({ error: 'You cannot change your own role here' });

      // FIX: last-admin guard — never demote the final admin.
      if (role !== 'admin') {
        const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin');
        if ((count || 0) <= 1) {
          const { data: target } = await supabase.from('profiles').select('role').eq('id', id).single();
          if (target?.role === 'admin') {
            return res.status(409).json({ error: 'Cannot demote the last admin' });
          }
        }
      }

      const { data, error } = await supabase.from('profiles').update({ role })
        .eq('id', id).select('id, email, full_name, role, created_at').single();
      if (error) return internalError(res, error, 'staff PUT');
      // Verify trigger didn't silently revert
      if (data?.role !== role) return res.status(409).json({ error: 'Role change was blocked by database policy' });
      await audit(supabase, { actorId: admin.id, action: `staff.role.${role}`, entity: 'profiles', entityId: id });
      return res.status(200).json(data);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return internalError(res, err, 'staff API error');
  }
}
