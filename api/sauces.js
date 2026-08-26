import supabase from './db-client.js';

async function requireStaff(req, res) {
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

// This endpoint serves two near-identical tables — `sauces` and
// `supplements` — behind one route, since the project is capped at 12
// /api files on the Vercel Hobby plan. `type` picks the table:
//   ?type=supplement (GET) / body.type === 'supplement' (POST/PUT/DELETE)
//     -> public.supplements
//   anything else, including omitted (default 'sauce')
//     -> public.sauces (unchanged behavior — existing callers that never
//        send `type` keep hitting the same table exactly as before).
const TABLES = { sauce: 'sauces', supplement: 'supplements' };
const tableFor = (type) => TABLES[type] || TABLES.sauce;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const table = tableFor(req.query.type);
      let q = supabase.from(table).select('*').order('sort_order').order('name');
      // The public e-menu only ever asks for active=1; staff screens fetch
      // everything (including hidden rows) so they can toggle them back on.
      if (req.query.active === '1') q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      if (!(await requireStaff(req, res))) return;
      const { name, price, image_url, sort_order, type } = req.body || {};
      const table = tableFor(type);
      const label = type === 'supplement' ? 'Supplement' : 'Sauce';
      if (!name || !String(name).trim()) return res.status(400).json({ error: `${label} name is required` });
      const { data, error } = await supabase
        .from(table)
        .insert({
          name: String(name).trim(),
          price: Number(price) || 0,
          image_url: image_url || null,
          sort_order: Number(sort_order) || 0,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      if (!(await requireStaff(req, res))) return;
      const { id, type, ...fields } = req.body || {};
      const table = tableFor(type);
      if (!id) return res.status(400).json({ error: 'id is required' });
      if (fields.price != null) fields.price = Number(fields.price);
      const { data, error } = await supabase
        .from(table)
        .update(fields)
        .eq('id', Number(id))
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      if (!(await requireStaff(req, res))) return;
      const { id, type } = req.body || {};
      const table = tableFor(type);
      const { error } = await supabase.from(table).delete().eq('id', Number(id));
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('sauces API error:', err);
    res.status(500).json({ error: err.message });
  }
}
