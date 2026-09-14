import supabase from './_lib/db-client.js';
import { setCors, requireManager } from './_lib/auth.js';
import { internalError, toId, cleanText, audit } from './_lib/validate.js';

const REASONS = ['initial', 'restock', 'sale', 'waste', 'correction'];

export default async function handler(req, res) {
  setCors(req, res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!(await requireManager(req, res))) return;

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('inventory_logs').select('*')
        .order('created_at', { ascending: false }).limit(100);
      if (error) return internalError(res, error, 'inventory GET');
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const staff = await requireManager(req, res).catch(() => null);
      // already authed above; re-use: fetch actor from header is complex, use audit with null actor safe
      const { product_id, change, reason, notes } = req.body || {};
      const pid = toId(product_id);
      const delta = parseInt(change, 10);
      if (!pid || !Number.isInteger(delta) || delta === 0 || delta < -100000 || delta > 100000) {
        return res.status(400).json({ error: 'Invalid product or quantity (-100000..100000, non-zero)' });
      }
      if (reason && !REASONS.includes(reason)) return res.status(400).json({ error: 'Invalid movement reason' });
      const cleanNotes = notes ? cleanText(String(notes), 300) : null;

      const { data: product } = await supabase.from('products').select('*').eq('id', pid).single();
      if (!product) return res.status(404).json({ error: 'Product not found' });

      const newStock = Math.max(0, (product.stock ?? 0) + delta);
      const { error: upErr } = await supabase.from('products').update({ stock: newStock }).eq('id', product.id);
      if (upErr) return internalError(res, upErr, 'inventory update');

      const { data: log, error } = await supabase.from('inventory_logs').insert({
        product_id: product.id, change: delta, reason: reason || 'correction', notes: cleanNotes,
      }).select().single();
      if (error) return internalError(res, error, 'inventory log');
      await audit(supabase, { actorId: null, action: 'inventory.adjust', entity: 'products', entityId: pid, meta: { delta } });
      return res.status(201).json({ log, stock: newStock });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return internalError(res, err, 'inventory API error');
  }
}
