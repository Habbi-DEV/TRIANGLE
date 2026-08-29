import supabase from './_lib/db-client.js';
import { setCors, requireStaff } from './_lib/auth.js';

const REASONS = ['initial', 'restock', 'sale', 'waste', 'correction'];

export default async function handler(req, res) {
  setCors(req, res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Stock movements are internal ops data — staff only, never public.
  if (req.method === 'GET' && !(await requireStaff(req, res))) return;

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('inventory_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      if (!(await requireStaff(req, res))) return;
      const { product_id, change, reason, notes } = req.body || {};
      const delta = parseInt(change, 10);
      if (!product_id || isNaN(delta) || delta === 0) {
        return res.status(400).json({ error: 'A product and a non-zero quantity change are required' });
      }
      if (reason && !REASONS.includes(reason)) {
        return res.status(400).json({ error: 'Invalid movement reason' });
      }

      const { data: product } = await supabase
        .from('products').select('*').eq('id', Number(product_id)).single();
      if (!product) return res.status(404).json({ error: 'Product not found' });

      const newStock = Math.max(0, (product.stock ?? 0) + delta);
      await supabase.from('products').update({ stock: newStock }).eq('id', product.id);

      const { data: log, error } = await supabase
        .from('inventory_logs')
        .insert({
          product_id: product.id,
          change: delta,
          reason: reason || 'correction',
          notes: notes || null,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ log, stock: newStock });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('inventory API error:', err);
    res.status(500).json({ error: err.message });
  }
}
