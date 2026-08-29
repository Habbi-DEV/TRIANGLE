import supabase from './_lib/db-client.js';
import { setCors, requireAdmin } from './_lib/auth.js';

const ASSIGNABLE_ROLES = new Set(['admin', 'cashier', 'kitchen', 'delivery_driver', 'pending']);

export default async function handler(req, res) {
  setCors(req, res, 'GET, PUT, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // Both methods are admin-only: this lists every teammate's email and
    // lets you grant/revoke access, so it's more sensitive than most
    // staff-only routes.
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    // ------------------------------------------------------------- GET
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }

    // ------------------------------------------------------------- PUT
    if (req.method === 'PUT') {
      const { id, role } = req.body || {};
      if (!id || !ASSIGNABLE_ROLES.has(role)) {
        return res.status(400).json({ error: 'id and a valid role are required' });
      }
      // Safety rail: don't let an admin change their own role from this
      // screen — a stray click could lock them out with no one left to
      // undo it. Another admin can still change it if that's really needed.
      if (id === admin.id) {
        return res.status(400).json({ error: 'You cannot change your own role here' });
      }

      // NOTE: this UPDATE is run with the service_role key, which the DB's
      // trg_profiles_prevent_role_escalation trigger must explicitly allow
      // (see public/migration_v12_staff_roles.sql) — otherwise it silently
      // reverts the role and this call would appear to succeed while doing
      // nothing.
      const { data, error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', id)
        .select('id, email, full_name, role, created_at')
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('staff API error:', err);
    res.status(500).json({ error: err.message });
  }
}
