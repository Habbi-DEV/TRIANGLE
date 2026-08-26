import supabase from './db-client.js';

async function requireAdmin(req, res) {
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
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }
  return user;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // ------------------------------------------------------------- GET
    // Public: the customer e-menu reads name/logo/hours/currency, and the
    // admin Settings page reads the full row to populate its form.
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('settings').select('*').eq('id', 1).single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    // ------------------------------------------------------------- PUT
    // Admin only: settings are app-wide config, not a per-staff-role action.
    if (req.method === 'PUT') {
      if (!(await requireAdmin(req, res))) return;

      const body = req.body || {};
      const fields = {};

      // Strings — trimmed, empty string allowed (e.g. clearing the logo).
      for (const key of ['restaurant_name', 'address', 'phone', 'contact_email', 'opening_hours', 'logo_url', 'brand_color', 'all_category_image_url']) {
        if (body[key] != null) fields[key] = String(body[key]).trim();
      }

      for (const key of ['delivery_fee', 'delivery_min_order']) {
        if (body[key] != null) {
          const n = Number(body[key]);
          if (isNaN(n) || n < 0) return res.status(400).json({ error: `${key} must be a non-negative number` });
          fields[key] = Math.round(n * 100) / 100;
        }
      }

      if (body.low_stock_threshold != null) {
        const n = parseInt(body.low_stock_threshold, 10);
        if (isNaN(n) || n < 0) return res.status(400).json({ error: 'low_stock_threshold must be a non-negative integer' });
        fields.low_stock_threshold = n;
      }

      for (const key of ['new_order_sound_enabled']) {
        if (body[key] != null) fields[key] = Boolean(body[key]);
      }

      if (Object.keys(fields).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const { data, error } = await supabase
        .from('settings').update(fields).eq('id', 1).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('settings API error:', err);
    res.status(500).json({ error: err.message });
  }
}
