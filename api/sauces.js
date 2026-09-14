import supabase from './_lib/db-client.js';
import { setCors, requireManager } from './_lib/auth.js';
import { internalError, toId, cleanText, isSafeImageUrl, isValidPrice, audit } from './_lib/validate.js';

const TABLES = { sauce: 'sauces', supplement: 'supplements' };
const tableFor = (type) => TABLES[type] || TABLES.sauce;
const ALLOW = new Set(['name', 'price', 'image_url', 'sort_order', 'is_active']);

export default async function handler(req, res) {
  setCors(req, res, 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const table = tableFor(req.query.type);
      let q = supabase.from(table).select('*').order('sort_order').order('name');
      if (req.query.active === '1') q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) return internalError(res, error, 'sauces GET');
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const staff = await requireManager(req, res);
      if (!staff) return;
      const { name, price, image_url, sort_order, type } = req.body || {};
      const table = tableFor(type);
      const label = type === 'supplement' ? 'Supplement' : 'Sauce';
      const cleanName = cleanText(name, 100);
      if (!cleanName) return res.status(400).json({ error: `${label} name is required` });
      if (price != null && !isValidPrice(price, 10000)) {
        return res.status(400).json({ error: 'price must be a non-negative number (max 10000)' });
      }
      if (image_url && !isSafeImageUrl(image_url)) return res.status(400).json({ error: 'Invalid image_url' });
      const { data, error } = await supabase.from(table).insert({
        name: cleanName, price: Number(price) || 0,
        image_url: image_url ? String(image_url).trim().slice(0, 2000) : null,
        sort_order: Number(sort_order) || 0,
      }).select().single();
      if (error) return internalError(res, error, 'sauce POST');
      await audit(supabase, { actorId: staff.id, action: 'addon.create', entity: table, entityId: data.id });
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const staff = await requireManager(req, res);
      if (!staff) return;
      const { id, type, ...rest } = req.body || {};
      const rowId = toId(id);
      if (!rowId) return res.status(400).json({ error: 'Invalid id' });
      const table = tableFor(type);
      const fields = {};
      for (const [k, v] of Object.entries(rest)) if (ALLOW.has(k)) fields[k] = v;
      if (fields.name != null) {
        const n = cleanText(fields.name, 100);
        if (!n) return res.status(400).json({ error: 'Invalid name' });
        fields.name = n;
      }
      if (fields.price != null) {
        if (!isValidPrice(fields.price, 10000)) return res.status(400).json({ error: 'price must be 0..10000' });
        fields.price = Number(fields.price);
      }
      if (fields.image_url != null && fields.image_url && !isSafeImageUrl(fields.image_url)) {
        return res.status(400).json({ error: 'Invalid image_url' });
      }
      if (!Object.keys(fields).length) return res.status(400).json({ error: 'No valid fields' });
      const { data, error } = await supabase.from(table).update(fields).eq('id', rowId).select().single();
      if (error) return internalError(res, error, 'sauce PUT');
      await audit(supabase, { actorId: staff.id, action: 'addon.update', entity: table, entityId: rowId });
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const staff = await requireManager(req, res);
      if (!staff) return;
      const rowId = toId(req.body?.id);
      if (!rowId) return res.status(400).json({ error: 'Invalid id' });
      const table = tableFor(req.body?.type);
      const { error } = await supabase.from(table).delete().eq('id', rowId);
      if (error) return internalError(res, error, 'sauce DELETE');
      await audit(supabase, { actorId: staff.id, action: 'addon.delete', entity: table, entityId: rowId });
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return internalError(res, err, 'sauces API error');
  }
}
