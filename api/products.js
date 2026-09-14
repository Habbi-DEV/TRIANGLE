import supabase from './_lib/db-client.js';
import { setCors, requireManager } from './_lib/auth.js';
import { internalError, toId, cleanText, isSafeImageUrl, isValidPrice, rateLimit, audit } from './_lib/validate.js';

async function syncProductSupplements(productId, supplementIds) {
  const { error: delErr } = await supabase.from('product_supplements').delete().eq('product_id', productId);
  if (delErr) throw delErr;
  const ids = [...new Set((supplementIds || []).map(Number))].filter((n) => Number.isInteger(n) && n > 0).slice(0, 50);
  if (!ids.length) return;
  const { error: insErr } = await supabase.from('product_supplements')
    .insert(ids.map((supplement_id) => ({ product_id: productId, supplement_id })));
  if (insErr) throw insErr;
}

async function syncProductSauces(productId, sauceIds) {
  const { error: delErr } = await supabase.from('product_sauces').delete().eq('product_id', productId);
  if (delErr) throw delErr;
  const ids = [...new Set((sauceIds || []).map(Number))].filter((n) => Number.isInteger(n) && n > 0).slice(0, 50);
  if (!ids.length) return;
  const { error: insErr } = await supabase.from('product_sauces')
    .insert(ids.map((sauce_id) => ({ product_id: productId, sauce_id })));
  if (insErr) throw insErr;
}

async function handleProductImages(req, res) {
  if (req.method === 'GET') {
    const pid = toId(req.query.product_id);
    if (!pid) return res.status(400).json({ error: 'product_id is required' });
    const { data, error } = await supabase.from('product_images').select('*')
      .eq('product_id', pid).order('sort_order').order('id');
    if (error) return internalError(res, error, 'product-images GET');
    return res.status(200).json(data);
  }
  if (req.method === 'POST') {
    const staff = await requireManager(req, res);
    if (!staff) return;
    const { product_id, url } = req.body || {};
    const pid = toId(product_id);
    if (!pid || typeof url !== 'string' || !isSafeImageUrl(url) || url.length > 2000) {
      return res.status(400).json({ error: 'product_id and a valid https image url are required' });
    }
    const { data: existing } = await supabase.from('product_images').select('sort_order')
      .eq('product_id', pid).order('sort_order', { ascending: false }).limit(1);
    const nextOrder = existing?.[0] ? existing[0].sort_order + 1 : 0;
    const { data, error } = await supabase.from('product_images')
      .insert({ product_id: pid, url: url.trim(), sort_order: nextOrder }).select().single();
    if (error) return internalError(res, error, 'product-images POST');
    return res.status(201).json(data);
  }
  if (req.method === 'DELETE') {
    const staff = await requireManager(req, res);
    if (!staff) return;
    const imgId = toId(req.body?.id);
    if (!imgId) return res.status(400).json({ error: 'id is required' });
    const { error } = await supabase.from('product_images').delete().eq('id', imgId);
    if (error) return internalError(res, error, 'product-images DELETE');
    await audit(supabase, { actorId: staff.id, action: 'product_image.delete', entity: 'product_images', entityId: imgId });
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

const PRODUCT_UPDATE_ALLOW = new Set(['name', 'description', 'price', 'category_id', 'image_url', 'stock', 'is_available']);

export default async function handler(req, res) {
  setCors(req, res, 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.query.images) {
    try { return await handleProductImages(req, res); }
    catch (err) { return internalError(res, err, 'product-images API error'); }
  }

  try {
    if (req.method === 'GET') {
      // Public menu: hide unavailable + hidden addons by default is done client-side,
      // but don't leak stock counts to public (FIX H5).
      const isStaffCall = !!req.headers.authorization;
      let q = supabase.from('products').select('*').order('category_id').order('name');
      if (req.query.category_id) {
        const c = toId(req.query.category_id);
        if (!c) return res.status(400).json({ error: 'Invalid category_id' });
        q = q.eq('category_id', c);
      }
      if (req.query.available === '1') q = q.eq('is_available', true);
      const { data, error } = await q;
      if (error) return internalError(res, error, 'products GET');

      const ids = (data || []).map((p) => p.id);
      let images = [], supplementLinks = [], sauceLinks = [];
      if (ids.length) {
        const [{ data: imgs }, { data: supLnk }, { data: sauceLnk }] = await Promise.all([
          supabase.from('product_images').select('*').in('product_id', ids).order('sort_order'),
          supabase.from('product_supplements').select('product_id, supplements(*)').in('product_id', ids),
          supabase.from('product_sauces').select('product_id, sauces(*)').in('product_id', ids),
        ]);
        images = imgs || []; supplementLinks = supLnk || []; sauceLinks = sauceLnk || [];
      }
      const byProduct = {};
      for (const img of images) (byProduct[img.product_id] ||= []).push(img);
      const supplementsByProduct = {};
      for (const l of supplementLinks) {
        if (!l.supplements) continue;
        if (!isStaffCall && !l.supplements.is_active) continue; // FIX: hide inactive from public
        (supplementsByProduct[l.product_id] ||= []).push(l.supplements);
      }
      const saucesByProduct = {};
      for (const l of sauceLinks) {
        if (!l.sauces) continue;
        if (!isStaffCall && !l.sauces.is_active) continue;
        (saucesByProduct[l.product_id] ||= []).push(l.sauces);
      }
      return res.status(200).json((data || []).map((p) => {
        const { stock, ...rest } = p;
        return {
          ...(isStaffCall ? p : rest), // public never sees stock
          images: byProduct[p.id] || [],
          sauces: (saucesByProduct[p.id] || []).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
          supplements: (supplementsByProduct[p.id] || []).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
        };
      }));
    }

    if (req.method === 'POST') {
      const staff = await requireManager(req, res); // FIX H1: driver excluded
      if (!staff) return;
      if (!rateLimit(req, res, { max: 30, windowMs: 60_000, key: 'product-write' })) return;
      const { name, description, price, category_id, image_url, stock, is_available, sauce_ids, supplement_ids } = req.body || {};
      const cleanName = cleanText(name, 150);
      if (!cleanName || !isValidPrice(price)) return res.status(400).json({ error: 'Product name and a valid non-negative price are required' });
      if (image_url && (!isSafeImageUrl(image_url) || image_url.length > 2000)) {
        return res.status(400).json({ error: 'Invalid image_url (https only)' });
      }
      const stockN = stock == null ? 0 : Number(stock);
      if (!Number.isInteger(stockN) || stockN < 0 || stockN > 1000000) return res.status(400).json({ error: 'Invalid stock' });
      let catId = null;
      if (category_id != null && category_id !== '') {
        catId = toId(category_id);
        if (!catId) return res.status(400).json({ error: 'Invalid category_id' });
      }
      const { data, error } = await supabase.from('products').insert({
        name: cleanName, description: cleanText(description, 1000) || '',
        price: Number(price), category_id: catId,
        image_url: image_url ? String(image_url).trim().slice(0, 2000) : '',
        stock: stockN, is_available: is_available !== false,
      }).select().single();
      if (error) return internalError(res, error, 'products POST');
      if (Array.isArray(sauce_ids) && sauce_ids.length) await syncProductSauces(data.id, sauce_ids);
      if (Array.isArray(supplement_ids) && supplement_ids.length) await syncProductSupplements(data.id, supplement_ids);
      await audit(supabase, { actorId: staff.id, action: 'product.create', entity: 'products', entityId: data.id });
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const staff = await requireManager(req, res);
      if (!staff) return;
      const { id, sauce_ids, supplement_ids, ...rest } = req.body || {};
      const pid = toId(id);
      if (!pid) return res.status(400).json({ error: 'id is required' });
      // FIX H2 mass-assignment: allowlist only
      const fields = {};
      for (const k of Object.keys(rest)) if (PRODUCT_UPDATE_ALLOW.has(k)) fields[k] = rest[k];
      if (fields.name != null) {
        const n = cleanText(fields.name, 150);
        if (!n) return res.status(400).json({ error: 'Invalid name' });
        fields.name = n;
      }
      if (fields.description != null) fields.description = cleanText(fields.description, 1000) || '';
      if (fields.price != null) {
        if (!isValidPrice(fields.price)) return res.status(400).json({ error: 'price must be 0..100000' });
        fields.price = Number(fields.price);
      }
      if (fields.stock != null) {
        const s = Number(fields.stock);
        if (!Number.isInteger(s) || s < 0 || s > 1000000) return res.status(400).json({ error: 'Invalid stock' });
        fields.stock = s;
      }
      if (fields.category_id != null && fields.category_id !== '') {
        const c = toId(fields.category_id);
        if (!c) return res.status(400).json({ error: 'Invalid category_id' });
        fields.category_id = c;
      }
      if (fields.image_url != null) {
        if (fields.image_url && (!isSafeImageUrl(fields.image_url) || fields.image_url.length > 2000)) {
          return res.status(400).json({ error: 'Invalid image_url' });
        }
        fields.image_url = String(fields.image_url || '').trim().slice(0, 2000);
      }
      if (fields.is_available != null) fields.is_available = Boolean(fields.is_available);

      let data = null;
      if (Object.keys(fields).length) {
        const { data: updated, error } = await supabase.from('products').update(fields).eq('id', pid).select().single();
        if (error) return internalError(res, error, 'products PUT');
        data = updated;
      }
      if (Array.isArray(sauce_ids)) await syncProductSauces(pid, sauce_ids);
      if (Array.isArray(supplement_ids)) await syncProductSupplements(pid, supplement_ids);
      await audit(supabase, { actorId: staff.id, action: 'product.update', entity: 'products', entityId: pid, meta: { fields: Object.keys(fields) } });
      if (!data) {
        const { data: current, error } = await supabase.from('products').select('*').eq('id', pid).single();
        if (error) return internalError(res, error, 'products PUT fetch');
        data = current;
      }
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const staff = await requireManager(req, res);
      if (!staff) return;
      const pid = toId(req.body?.id);
      if (!pid) return res.status(400).json({ error: 'Invalid id' });
      const { error } = await supabase.from('products').delete().eq('id', pid);
      if (error) return internalError(res, error, 'products DELETE');
      await audit(supabase, { actorId: staff.id, action: 'product.delete', entity: 'products', entityId: pid });
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return internalError(res, err, 'products API error');
  }
}
