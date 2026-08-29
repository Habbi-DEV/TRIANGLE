import supabase from './_lib/db-client.js';
import { setCors, requireStaff } from './_lib/auth.js';

export default async function handler(req, res) {
  setCors(req, res, 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { product_id } = req.query;
      if (!product_id) return res.status(400).json({ error: 'product_id is required' });
      const { data, error } = await supabase
        .from('product_images')
        .select('*')
        .eq('product_id', Number(product_id))
        .order('sort_order')
        .order('id');
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      if (!(await requireStaff(req, res))) return;
      const { product_id, url } = req.body || {};
      if (!product_id || !url) return res.status(400).json({ error: 'product_id and url are required' });

      const { data: existing } = await supabase
        .from('product_images')
        .select('sort_order')
        .eq('product_id', Number(product_id))
        .order('sort_order', { ascending: false })
        .limit(1);
      const nextOrder = existing?.[0] ? existing[0].sort_order + 1 : 0;

      const { data, error } = await supabase
        .from('product_images')
        .insert({ product_id: Number(product_id), url, sort_order: nextOrder })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'DELETE') {
      if (!(await requireStaff(req, res))) return;
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { error } = await supabase.from('product_images').delete().eq('id', Number(id));
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('product-images API error:', err);
    res.status(500).json({ error: err.message });
  }
}
