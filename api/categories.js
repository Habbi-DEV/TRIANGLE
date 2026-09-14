import supabase from './_lib/db-client.js';
import { setCors, requireManager } from './_lib/auth.js';
import { internalError, toId, cleanText, isSafeImageUrl, isValidPrice, audit } from './_lib/validate.js';

const TABLES = { category: 'categories', promotion: 'promotions' };
const tableFor = (type) => TABLES[type] || TABLES.category;
const CAT_ALLOW = new Set(['name', 'icon', 'image_url', 'sort_order', 'is_active']);
const PROMO_ALLOW = new Set(['image_url', 'sort_order', 'is_active']);

export default async function handler(req, res) {
  setCors(req, res, 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const table = tableFor(req.query.type);
      let q = supabase.from(table).select('*').order('sort_order', { ascending: true }).order('id', { ascending: true });
      if (req.query.active === '1') q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) return internalError(res, error, 'categories GET');
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const staff = await requireManager(req, res);
      if (!staff) return;
      const { type, sort_order } = req.body || {};
      const table = tableFor(type);
      const so = Number(sort_order) || 0;
      if (!Number.isInteger(so) || so < 0 || so > 100000) return res.status(400).json({ error: 'Invalid sort_order' });

      if (type === 'promotion') {
        const { image_url } = req.body || {};
        if (!image_url || !isSafeImageUrl(image_url)) return res.status(400).json({ error: 'A valid https banner image is required' });
        const { data, error } = await supabase.from(table)
          .insert({ image_url: String(image_url).trim().slice(0, 2000), sort_order: so })
          .select().single();
        if (error) return internalError(res, error, 'promo POST');
        await audit(supabase, { actorId: staff.id, action: 'promotion.create', entity: table, entityId: data.id });
        return res.status(201).json(data);
      }

      const { name, icon, image_url } = req.body || {};
      const cleanName = cleanText(name, 100);
      if (!cleanName) return res.status(400).json({ error: 'Category name is required' });
      if (image_url && !isSafeImageUrl(image_url)) return res.status(400).json({ error: 'Invalid image_url' });
      const { data, error } = await supabase.from(table).insert({
        name: cleanName, icon: cleanText(icon, 20) || '🍽️',
        image_url: image_url ? String(image_url).trim().slice(0, 2000) : null, sort_order: so,
      }).select().single();
      if (error) return internalError(res, error, 'category POST');
      await audit(supabase, { actorId: staff.id, action: 'category.create', entity: table, entityId: data.id });
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const staff = await requireManager(req, res);
      if (!staff) return;
      const { id, type, ...rest } = req.body || {};
      const rowId = toId(id);
      if (!rowId) return res.status(400).json({ error: 'Invalid id' });
      const table = tableFor(type);
      const allow = type === 'promotion' ? PROMO_ALLOW : CAT_ALLOW;
      const fields = {};
      for (const [k, v] of Object.entries(rest)) if (allow.has(k)) fields[k] = v;
      if (fields.name != null) {
        const n = cleanText(fields.name, 100);
        if (!n) return res.status(400).json({ error: 'Invalid name' });
        fields.name = n;
      }
      if (fields.image_url != null && fields.image_url && !isSafeImageUrl(fields.image_url)) {
        return res.status(400).json({ error: 'Invalid image_url' });
      }
      if (fields.sort_order != null) {
        const so = Number(fields.sort_order);
        if (!Number.isInteger(so) || so < 0 || so > 100000) return res.status(400).json({ error: 'Invalid sort_order' });
        fields.sort_order = so;
      }
      if (fields.is_active != null) fields.is_active = Boolean(fields.is_active);
      if (!Object.keys(fields).length) return res.status(400).json({ error: 'No valid fields' });
      const { data, error } = await supabase.from(table).update(fields).eq('id', rowId).select().single();
      if (error) return internalError(res, error, 'categories PUT');
      await audit(supabase, { actorId: staff.id, action: 'category.update', entity: table, entityId: rowId });
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const staff = await requireManager(req, res);
      if (!staff) return;
      const rowId = toId(req.body?.id);
      if (!rowId) return res.status(400).json({ error: 'Invalid id' });
      const table = tableFor(req.body?.type);
      const { error } = await supabase.from(table).delete().eq('id', rowId);
      if (error) return internalError(res, error, 'categories DELETE');
      await audit(supabase, { actorId: staff.id, action: 'category.delete', entity: table, entityId: rowId });
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return internalError(res, err, 'categories API error');
  }
}
