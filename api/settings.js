import supabase from './_lib/db-client.js';
import { setCors, requireAdmin } from './_lib/auth.js';
import { internalError, cleanText, isSafeImageUrl, audit } from './_lib/validate.js';

// Public fields only (FIX H5: SELECT * leaked future secret columns)
// NOTE: light_logo_url / dark_logo_url require migration_v17 — run it before
// deploying this file, or this SELECT fails on the missing columns.
const PUBLIC_FIELDS = 'id, restaurant_name, logo_url, light_logo_url, dark_logo_url, address, phone, contact_email, opening_hours, brand_color, delivery_fee, delivery_min_order, all_category_image_url';

// Image columns an admin can write. Each is length-capped at 2000 and must
// pass isSafeImageUrl() below; an empty string is allowed and means "cleared".
const IMAGE_FIELDS = ['logo_url', 'light_logo_url', 'dark_logo_url', 'all_category_image_url'];

export default async function handler(req, res) {
  setCors(req, res, 'GET, PUT, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('settings').select(PUBLIC_FIELDS).eq('id', 1).single();
      if (error) return internalError(res, error, 'settings GET');
      return res.status(200).json(data);
    }

    if (req.method === 'PUT') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const body = req.body || {};
      const fields = {};

      for (const key of ['restaurant_name', 'address', 'phone', 'contact_email', 'opening_hours', 'brand_color', ...IMAGE_FIELDS]) {
        if (body[key] != null) {
          const v = cleanText(String(body[key]), key.includes('logo') || key.includes('url') ? 2000 : 300);
          fields[key] = v || '';
        }
      }
      // Strong validation (FIX M6) — same rule for every image column, so a
      // new one can't be added to IMAGE_FIELDS while quietly skipping it.
      for (const key of IMAGE_FIELDS) {
        if (fields[key] && !isSafeImageUrl(fields[key])) {
          return res.status(400).json({ error: `Invalid ${key} (https only)` });
        }
      }
      if (fields.brand_color && !/^#[0-9a-fA-F]{6}$/.test(fields.brand_color)) {
        return res.status(400).json({ error: 'brand_color must be #rrggbb' });
      }
      if (fields.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fields.contact_email)) {
        return res.status(400).json({ error: 'Invalid contact_email' });
      }
      if (fields.phone && !/^\+?[\d\s-]{6,20}$/.test(fields.phone)) {
        return res.status(400).json({ error: 'Invalid phone' });
      }

      for (const key of ['delivery_fee', 'delivery_min_order']) {
        if (body[key] != null) {
          const n = Number(body[key]);
          if (!Number.isFinite(n) || n < 0 || n > 100000) return res.status(400).json({ error: `${key} must be 0..100000` });
          fields[key] = Math.round(n * 100) / 100;
        }
      }
      if (body.low_stock_threshold != null) {
        const n = parseInt(body.low_stock_threshold, 10);
        if (!Number.isInteger(n) || n < 0 || n > 100000) return res.status(400).json({ error: 'low_stock_threshold invalid' });
        fields.low_stock_threshold = n;
      }
      for (const key of ['new_order_sound_enabled']) {
        if (body[key] != null) fields[key] = Boolean(body[key]);
      }
      if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

      const { data, error } = await supabase.from('settings').update(fields).eq('id', 1).select().single();
      if (error) return internalError(res, error, 'settings PUT');
      await audit(supabase, { actorId: admin.id, action: 'settings.update', entity: 'settings', entityId: 1, meta: { fields: Object.keys(fields) } });
      return res.status(200).json(data);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return internalError(res, err, 'settings API error');
  }
}
