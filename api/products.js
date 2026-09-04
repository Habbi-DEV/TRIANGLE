import supabase from './_lib/db-client.js';
import { setCors, requireStaff } from './_lib/auth.js';

// Replaces a product's full set of supplement links with `supplementIds`
// (delete-all-then-insert is simplest and correct for the small counts a
// menu deals with — no diffing needed, and it's already scoped to a single
// product_id so it can't touch any other product's rows).
async function syncProductSupplements(productId, supplementIds) {
  const { error: delErr } = await supabase.from('product_supplements').delete().eq('product_id', productId);
  if (delErr) throw delErr;
  const ids = [...new Set(supplementIds.map(Number))].filter((n) => Number.isFinite(n));
  if (!ids.length) return;
  const { error: insErr } = await supabase
    .from('product_supplements')
    .insert(ids.map((supplement_id) => ({ product_id: productId, supplement_id })));
  if (insErr) throw insErr;
}

// Same delete-all-then-insert pattern as syncProductSupplements, but for
// product_sauces (migration v6) — sauces are now a per-product pick too,
// no longer gated by the product's category.
async function syncProductSauces(productId, sauceIds) {
  const { error: delErr } = await supabase.from('product_sauces').delete().eq('product_id', productId);
  if (delErr) throw delErr;
  const ids = [...new Set(sauceIds.map(Number))].filter((n) => Number.isFinite(n));
  if (!ids.length) return;
  const { error: insErr } = await supabase
    .from('product_sauces')
    .insert(ids.map((sauce_id) => ({ product_id: productId, sauce_id })));
  if (insErr) throw insErr;
}

// Product gallery images (was api/product-images.js, merged in here to stay
// under Vercel Hobby's 12-serverless-function-per-deployment limit). Routed
// via /api/products?images=1 so it doesn't collide with the main products
// GET/POST/PUT/DELETE routes above.
async function handleProductImages(req, res) {
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

  return res.status(405).json({ error: 'Method not allowed' });
}

export default async function handler(req, res) {
  setCors(req, res, 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.query.images) {
    try {
      return await handleProductImages(req, res);
    } catch (err) {
      console.error('product-images API error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    if (req.method === 'GET') {
      let q = supabase.from('products').select('*').order('category_id').order('name');
      if (req.query.category_id) q = q.eq('category_id', Number(req.query.category_id));
      if (req.query.available === '1') q = q.eq('is_available', true);
      const { data, error } = await q;
      if (error) throw error;

      // Attach each product's extra gallery photos in one round-trip so the
      // e-menu / register / admin never have to N+1 fetch product_images.
      const ids = (data || []).map((p) => p.id);
      let images = [];
      // Supplements available for each product: joined through
      // product_supplements (admin's per-product picks) -> supplements
      // (the actual name/price/photo/visibility), same one-round-trip
      // pattern as product_images so the customer sheet never has to make
      // a separate request per product.
      let supplementLinks = [];
      // Sauces: same per-product join, through product_sauces -> sauces
      // (migration v6) — no longer derived from the product's category.
      let sauceLinks = [];
      if (ids.length) {
        const [{ data: imgs }, { data: supLnk }, { data: sauceLnk }] = await Promise.all([
          supabase.from('product_images').select('*').in('product_id', ids).order('sort_order'),
          supabase.from('product_supplements').select('product_id, supplements(*)').in('product_id', ids),
          supabase.from('product_sauces').select('product_id, sauces(*)').in('product_id', ids),
        ]);
        images = imgs || [];
        supplementLinks = supLnk || [];
        sauceLinks = sauceLnk || [];
      }
      const byProduct = {};
      for (const img of images) (byProduct[img.product_id] ||= []).push(img);
      const supplementsByProduct = {};
      for (const l of supplementLinks) {
        if (!l.supplements) continue; // row deleted mid-query / RLS-hidden
        (supplementsByProduct[l.product_id] ||= []).push(l.supplements);
      }
      const saucesByProduct = {};
      for (const l of sauceLinks) {
        if (!l.sauces) continue; // row deleted mid-query / RLS-hidden
        (saucesByProduct[l.product_id] ||= []).push(l.sauces);
      }
      // Unfiltered (includes hidden sauces/supplements) so the admin edit
      // modal can show correct toggle state even for one that was later
      // hidden; the customer ProductSheet is responsible for filtering to
      // is_active when it renders `product.sauces` / `product.supplements`.
      return res.status(200).json((data || []).map((p) => ({
        ...p,
        images: byProduct[p.id] || [],
        sauces: (saucesByProduct[p.id] || [])
          .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
        supplements: (supplementsByProduct[p.id] || [])
          .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
      })));
    }

    if (req.method === 'POST') {
      if (!(await requireStaff(req, res))) return;
      const { name, description, price, category_id, image_url, stock, is_available, sauce_ids, supplement_ids } = req.body || {};
      if (!name || price == null || isNaN(Number(price))) {
        return res.status(400).json({ error: 'Product name and a valid price are required' });
      }
      const { data, error } = await supabase
        .from('products')
        .insert({
          name: String(name).trim(),
          description: description || '',
          price: Number(price),
          category_id: category_id ? Number(category_id) : null,
          image_url: image_url || '',
          stock: Number(stock) || 0,
          is_available: is_available !== false,
        })
        .select()
        .single();
      if (error) throw error;

      if (Array.isArray(sauce_ids) && sauce_ids.length) {
        await syncProductSauces(data.id, sauce_ids);
      }
      if (Array.isArray(supplement_ids) && supplement_ids.length) {
        await syncProductSupplements(data.id, supplement_ids);
      }
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      if (!(await requireStaff(req, res))) return;
      const { id, sauce_ids, supplement_ids, ...fields } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      if (fields.price != null) fields.price = Number(fields.price);
      if (fields.stock != null) fields.stock = Number(fields.stock);

      let data = null;
      if (Object.keys(fields).length) {
        const { data: updated, error } = await supabase
          .from('products')
          .update(fields)
          .eq('id', Number(id))
          .select()
          .single();
        if (error) throw error;
        data = updated;
      }

      // sauce_ids / supplement_ids are only synced when the field is
      // actually sent (an array, even empty = "clear all"), so calls that
      // just flip is_available/is_active etc (like toggleAvailable) never
      // touch the product's sauce/supplement picks.
      if (Array.isArray(sauce_ids)) {
        await syncProductSauces(Number(id), sauce_ids);
      }
      if (Array.isArray(supplement_ids)) {
        await syncProductSupplements(Number(id), supplement_ids);
      }

      if (!data) {
        const { data: current, error } = await supabase.from('products').select('*').eq('id', Number(id)).single();
        if (error) throw error;
        data = current;
      }
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      if (!(await requireStaff(req, res))) return;
      const { id } = req.body || {};
      const { error } = await supabase.from('products').delete().eq('id', Number(id));
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('products API error:', err);
    res.status(500).json({ error: err.message });
  }
}
