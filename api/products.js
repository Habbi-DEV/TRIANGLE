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

async function handleProductVariants(req, res) {
  if (req.method === 'GET') {
    const pid = toId(req.query.product_id);
    if (!pid) return res.status(400).json({ error: 'product_id is required' });
    const { data, error } = await supabase.from('product_variants').select('*')
      .eq('product_id', pid).order('sort_order').order('id');
    if (error) return internalError(res, error, 'product-variants GET');
    return res.status(200).json(data);
  }
  if (req.method === 'POST') {
    const staff = await requireManager(req, res);
    if (!staff) return;
    const { product_id, name, price, is_available, image_url, stock } = req.body || {};
    const pid = toId(product_id);
    const cleanName = cleanText(name, 80);
    if (!pid || !cleanName || !isValidPrice(price)) {
      return res.status(400).json({ error: 'product_id, a name and a valid non-negative price are required' });
    }
    if (image_url && !isSafeImageUrl(image_url)) return res.status(400).json({ error: 'Invalid image_url' });
    const stockN = stock == null || stock === '' ? 0 : Number(stock);
    if (!Number.isInteger(stockN) || stockN < 0 || stockN > 1000000) return res.status(400).json({ error: 'Invalid stock' });
    const { data: existing } = await supabase.from('product_variants').select('sort_order')
      .eq('product_id', pid).order('sort_order', { ascending: false }).limit(1);
    const nextOrder = existing?.[0] ? existing[0].sort_order + 1 : 0;
    const { data, error } = await supabase.from('product_variants')
      .insert({ product_id: pid, name: cleanName, price: Number(price), is_available: is_available !== false, sort_order: nextOrder, stock: stockN, image_url: image_url ? String(image_url).trim().slice(0, 2000) : null })
      .select().single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'A size with this name already exists on this product' });
      return internalError(res, error, 'product-variants POST');
    }
    await audit(supabase, { actorId: staff.id, action: 'product_variant.create', entity: 'product_variants', entityId: data.id });
    if (stockN > 0) {
      await supabase.from('inventory_logs').insert({
        product_id: pid, variant_id: data.id, change: stockN, reason: 'initial', notes: `Initial stock — ${cleanName}`,
      }).then(({ error: logErr }) => { if (logErr) console.error('[variant initial stock log]', logErr); });
    }
    return res.status(201).json(data);
  }
  if (req.method === 'PUT') {
    const staff = await requireManager(req, res);
    if (!staff) return;
    const vid = toId(req.body?.id);
    if (!vid) return res.status(400).json({ error: 'id is required' });
    const fields = {};
    if (req.body?.name != null) {
      const n = cleanText(req.body.name, 80);
      if (!n) return res.status(400).json({ error: 'Invalid name' });
      fields.name = n;
    }
    if (req.body?.price != null) {
      if (!isValidPrice(req.body.price)) return res.status(400).json({ error: 'price must be 0..100000' });
      fields.price = Number(req.body.price);
    }
    if (req.body?.is_available != null) fields.is_available = Boolean(req.body.is_available);
    let stockDelta = 0;
    let stockProductId = null;
    if (req.body?.stock != null && req.body.stock !== '') {
      const sn = Number(req.body.stock);
      if (!Number.isInteger(sn) || sn < 0 || sn > 1000000) return res.status(400).json({ error: 'Invalid stock' });
      const { data: cur } = await supabase.from('product_variants').select('product_id, stock').eq('id', vid).single();
      if (!cur) return res.status(404).json({ error: 'Size not found' });
      stockDelta = sn - (cur.stock ?? 0);
      stockProductId = cur.product_id;
      fields.stock = sn;
    }
    if (req.body?.image_url !== undefined) {
      const img = req.body.image_url;
      if (img && !isSafeImageUrl(img)) return res.status(400).json({ error: 'Invalid image_url' });
      fields.image_url = img ? String(img).trim().slice(0, 2000) : null;
    }
    if (req.body?.sort_order != null) {
      const so = Number(req.body.sort_order);
      if (!Number.isInteger(so)) return res.status(400).json({ error: 'Invalid sort_order' });
      fields.sort_order = so;
    }
    if (!Object.keys(fields).length) return res.status(400).json({ error: 'Nothing to update' });
    const { data, error } = await supabase.from('product_variants').update(fields).eq('id', vid).select().single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'A size with this name already exists on this product' });
      return internalError(res, error, 'product-variants PUT');
    }
    await audit(supabase, { actorId: staff.id, action: 'product_variant.update', entity: 'product_variants', entityId: vid, meta: { fields: Object.keys(fields) } });
    if (stockDelta !== 0 && stockProductId) {
      await supabase.from('inventory_logs').insert({
        product_id: stockProductId, variant_id: vid, change: stockDelta, reason: 'correction', notes: 'Stock edited from the product form',
      }).then(({ error: logErr }) => { if (logErr) console.error('[variant stock log]', logErr); });
    }
    return res.status(200).json(data);
  }
  if (req.method === 'DELETE') {
    const staff = await requireManager(req, res);
    if (!staff) return;
    const vid = toId(req.body?.id);
    if (!vid) return res.status(400).json({ error: 'id is required' });
    const { error } = await supabase.from('product_variants').delete().eq('id', vid);
    if (error) return internalError(res, error, 'product-variants DELETE');
    await audit(supabase, { actorId: staff.id, action: 'product_variant.delete', entity: 'product_variants', entityId: vid });
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed' });
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

const PRODUCT_UPDATE_ALLOW = new Set(['name', 'description', 'price', 'category_id', 'image_url', 'stock', 'is_available', 'badge']);

// Card badge shown on the customer menu. '' / null clears it.
const PRODUCT_BADGES = new Set(['popular', 'new', 'limited']);
const cleanBadge = (b) => (b == null || b === '' ? null : PRODUCT_BADGES.has(b) ? b : undefined);

export default async function handler(req, res) {
  setCors(req, res, 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.query.images) {
    try { return await handleProductImages(req, res); }
    catch (err) { return internalError(res, err, 'product-images API error'); }
  }

  if (req.query.variants) {
    try { return await handleProductVariants(req, res); }
    catch (err) { return internalError(res, err, 'product-variants API error'); }
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
      let images = [], supplementLinks = [], sauceLinks = [], variants = [];
      if (ids.length) {
        const [{ data: imgs }, { data: supLnk }, { data: sauceLnk }, { data: vars }] = await Promise.all([
          supabase.from('product_images').select('*').in('product_id', ids).order('sort_order'),
          supabase.from('product_supplements').select('product_id, supplements(*)').in('product_id', ids),
          supabase.from('product_sauces').select('product_id, sauces(*)').in('product_id', ids),
          supabase.from('product_variants').select('*').in('product_id', ids).order('sort_order').order('id'),
        ]);
        images = imgs || []; supplementLinks = supLnk || []; sauceLinks = sauceLnk || []; variants = vars || [];
      }
      const byProduct = {};
      for (const img of images) (byProduct[img.product_id] ||= []).push(img);
      const variantsByProduct = {};
      for (const v of variants) {
        if (!isStaffCall && !v.is_available) continue; // hide hidden sizes from the public menu, same as sauces/supplements
        // Same rule as products: the public never sees stock counts, only
        // whether the size can still be ordered.
        const { stock: vStock, ...vPublic } = v;
        (variantsByProduct[v.product_id] ||= []).push(isStaffCall ? v : { ...vPublic, in_stock: (vStock ?? 0) > 0 });
      }
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
        // Server-computed "can it still be ordered?" so the public menu can
        // grey out sold-out items without ever receiving the stock number.
        // A product with sizes is in stock as long as one size is.
        const pv = variantsByProduct[p.id] || [];
        const in_stock = pv.length
          ? pv.some((v) => (isStaffCall ? (v.is_available && v.stock > 0) : v.in_stock))
          : (stock ?? 0) > 0;
        return {
          ...(isStaffCall ? p : rest), // public never sees stock
          in_stock,
          images: byProduct[p.id] || [],
          sauces: (saucesByProduct[p.id] || []).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
          supplements: (supplementsByProduct[p.id] || []).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
          variants: variantsByProduct[p.id] || [],
        };
      }));
    }

    if (req.method === 'POST') {
      const staff = await requireManager(req, res); // FIX H1: driver excluded
      if (!staff) return;
      if (!rateLimit(req, res, { max: 30, windowMs: 60_000, key: 'product-write' })) return;
      const { name, description, price, category_id, image_url, stock, is_available, sauce_ids, supplement_ids, badge } = req.body || {};
      const badgeN = cleanBadge(badge);
      if (badgeN === undefined) return res.status(400).json({ error: 'Invalid badge' });
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
        // Only sent when set, so installs that haven't run migration_v21 keep working.
        ...(badgeN ? { badge: badgeN } : {}),
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
        // A product with sizes keeps its stock per size: products.stock is the
        // sum of those (maintained by the database), so a direct edit is
        // ignored instead of overwriting it with a possibly stale number.
        const { count: sizeCount } = await supabase.from('product_variants')
          .select('id', { count: 'exact', head: true }).eq('product_id', pid);
        if ((sizeCount ?? 0) > 0) delete fields.stock;
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
      if ('badge' in fields) {
        const b = cleanBadge(fields.badge);
        if (b === undefined) return res.status(400).json({ error: 'Invalid badge' });
        fields.badge = b;
      }

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
