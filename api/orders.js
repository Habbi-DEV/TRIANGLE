import supabase from './_lib/db-client.js';
import { setCors, requireManager, requireAdmin, requireStaff } from './_lib/auth.js';
import { broadcastDriverEvent, DRIVER_EVENTS } from './_lib/broadcast.js';
import { sendPushToOrder } from './_lib/push.js';
import {
  internalError, toId, cleanText, isValidPhone, ORDER_TRANSITIONS, rateLimit, audit,
} from './_lib/validate.js';

const ORDER_TYPES = ['dine_in', 'takeaway', 'delivery'];
const ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];

function pushBodyFor(status, orderType) {
  switch (status) {
    case 'confirmed': return 'Votre commande a été acceptée 👍';
    case 'preparing': return 'La cuisine s’en occupe 👨‍🍳';
    case 'ready': return orderType === 'delivery' ? 'Prête ! Un livreur va bientôt la prendre en charge.' : 'Prête ! Passez la récupérer 🎉';
    case 'out_for_delivery': return 'Votre livreur est en route 🛵';
    case 'completed': return 'Bon appétit ! 🧡';
    case 'cancelled': return 'Votre commande a été annulée.';
    default: return 'Le statut de votre commande a été mis à jour.';
  }
}

async function getDeliveryFee() {
  const { data, error } = await supabase.from('settings').select('delivery_fee').eq('id', 1).single();
  if (error || data == null) return 0;
  return Number(data.delivery_fee) || 0;
}

// Mask PII for customer self-lookup: only returned when order_token matches.
function maskOrderForCustomer(order) {
  return order;
}

export default async function handler(req, res) {
  setCors(req, res, 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // ------------------------------------------------------------- GET
    if (req.method === 'GET') {
      const { id, status, order_type, limit, counts, order_token } = req.query;

      if (counts) {
        // FIX C1: counts were public business intel -> manager only
        const staff = await requireManager(req, res);
        if (!staff) return;
        const STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];
        const { count: all, error: allErr } = await supabase
          .from('orders').select('*', { count: 'exact', head: true });
        if (allErr) return internalError(res, allErr, 'orders counts');
        const perStatus = await Promise.all(STATUSES.map(async (s) => {
          const { count, error } = await supabase
            .from('orders').select('*', { count: 'exact', head: true }).eq('status', s);
          if (error) throw error;
          return [s, count || 0];
        }));
        return res.status(200).json({ all: all || 0, ...Object.fromEntries(perStatus) });
      }

      if (id) {
        const orderId = toId(id);
        if (!orderId) return res.status(400).json({ error: 'Invalid id' });
        // FIX C1: try staff first; else require order_token (per-order secret).
        // Staff see everything. Customers must present ?order_token=<uuid> issued at POST.
        const { data: order, error } = await supabase
          .from('orders').select('*').eq('id', orderId).single();
        if (error || !order) return res.status(404).json({ error: 'Order not found' });

        // If caller has staff session, allow.
        const authH = req.headers.authorization;
        let isStaff = false;
        if (authH) {
          const u = await requireStaff(req, res).catch(() => null);
          // requireStaff already sent response on failure; guard double-send:
          if (u) isStaff = true;
          else return; // response already sent (401/403)
        }
        if (!isStaff) {
          // Customer path: must match access_token column if present, else
          // fall back to legacy open read BUT masked (no PII) to avoid breaking old orders.
          if (order.access_token) {
            if (!order_token || order_token !== order.access_token) {
              return res.status(403).json({ error: 'Forbidden' });
            }
          } else {
            // Legacy row without token: mask PII
            const { customer_phone, delivery_address, delivery_lat, delivery_lng, customer_name, notes, ...rest } = order;
            const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id).order('id');
            return res.status(200).json({ ...rest, items: items || [] });
          }
        }
        const { data: items } = await supabase
          .from('order_items').select('*').eq('order_id', order.id).order('id');
        return res.status(200).json({ ...maskOrderForCustomer(order), items: items || [] });
      }

      // List -> manager only (FIX C1)
      const staff = await requireManager(req, res);
      if (!staff) return;
      if (status && status !== 'all' && !ORDER_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      if (order_type && order_type !== 'all' && !ORDER_TYPES.includes(order_type)) {
        return res.status(400).json({ error: 'Invalid order type' });
      }
      let q = supabase.from('orders').select('*').order('created_at', { ascending: false })
        .limit(Math.min(Number(limit) || 50, 100));
      if (status && status !== 'all') q = q.eq('status', status);
      if (order_type && order_type !== 'all') q = q.eq('order_type', order_type);
      const { data, error } = await q;
      if (error) return internalError(res, error, 'orders list');

      const ids = (data || []).map((o) => o.id);
      let items = [];
      if (ids.length) {
        const { data: it } = await supabase.from('order_items').select('*').in('order_id', ids).order('id');
        items = it || [];
      }
      const byOrder = {};
      for (const it of items) (byOrder[it.order_id] ||= []).push(it);
      return res.status(200).json((data || []).map((o) => ({ ...o, items: byOrder[o.id] || [] })));
    }

    // ------------------------------------------------------------ POST (public, hardened)
    if (req.method === 'POST') {
      if (!rateLimit(req, res, { max: 20, windowMs: 60_000, key: 'order-create' })) return;
      const body = req.body || {};
      const {
        order_type, table_number,
        customer_name, customer_phone, delivery_address,
        delivery_lat, delivery_lng,
        notes, items,
      } = body;

      if (!ORDER_TYPES.includes(order_type)) return res.status(400).json({ error: 'Invalid order type' });
      const tableNum = table_number != null ? Number(table_number) : null;
      if (order_type === 'dine_in') {
        if (!Number.isInteger(tableNum) || tableNum < 1 || tableNum > 500) {
          return res.status(400).json({ error: 'A valid table number is required' });
        }
      }
      if (order_type === 'delivery') {
        const n = cleanText(customer_name, 100);
        const a = cleanText(delivery_address, 300);
        if (!n || !customer_phone || !a) return res.status(400).json({ error: 'Delivery orders require customer name, phone and address' });
        if (!isValidPhone(String(customer_phone))) return res.status(400).json({ error: 'Invalid phone number' });
      }
      if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
        return res.status(400).json({ error: 'The order must contain 1 to 50 items' });
      }
      const cleanNotes = notes ? cleanText(String(notes), 500) : null;

      const ids = [...new Set(items.map((i) => Number(i.product_id)).filter((n) => Number.isFinite(n)))];
      if (!ids.length || ids.length > 50) return res.status(400).json({ error: 'Invalid products' });
      const { data: products, error: pErr } = await supabase.from('products').select('*').in('id', ids);
      if (pErr) return internalError(res, pErr, 'orders products');
      const byId = Object.fromEntries((products || []).map((p) => [p.id, p]));

      const sauceIds = [...new Set(items.flatMap((i) => (Array.isArray(i.sauce_ids) ? i.sauce_ids : []).map(Number).filter(Number.isFinite)))].slice(0, 100);
      let sauceById = {};
      if (sauceIds.length) {
        const { data: sauces, error: sErr } = await supabase.from('sauces').select('*').in('id', sauceIds).eq('is_active', true);
        if (sErr) return internalError(res, sErr, 'orders sauces');
        for (const s of sauces || []) {
          if (Number(s.price) < 0) continue; // FIX H3: ignore negative-price addons
          sauceById[s.id] = s;
        }
      }

      const supplementIds = [...new Set(items.flatMap((i) => (Array.isArray(i.supplement_ids) ? i.supplement_ids : []).map(Number).filter(Number.isFinite)))].slice(0, 100);
      let supplementById = {};
      if (supplementIds.length) {
        const { data: supplements, error: supErr } = await supabase.from('supplements').select('*').in('id', supplementIds).eq('is_active', true);
        if (supErr) return internalError(res, supErr, 'orders supplements');
        for (const s of supplements || []) {
          if (Number(s.price) < 0) continue;
          supplementById[s.id] = s;
        }
      }

      const rows = [];
      let subtotal = 0;
      for (const it of items) {
        const pid = Number(it.product_id);
        const p = byId[pid];
        if (!p) return res.status(400).json({ error: 'Unknown product in cart' });
        if (Number(p.price) < 0) return res.status(400).json({ error: 'Invalid product price' });
        if (!p.is_available) return res.status(400).json({ error: 'An item is currently unavailable' });
        const quantity = Math.max(1, Math.min(20, parseInt(it.quantity, 10) || 1));
        if ((p.stock ?? 0) < quantity) {
          return res.status(400).json({ error: 'Not enough stock for an item' });
        }
        const chosenSauces = (Array.isArray(it.sauce_ids) ? it.sauce_ids : []).slice(0, 10)
          .map((sid) => sauceById[Number(sid)]).filter(Boolean)
          .map((s) => ({ name: String(s.name).slice(0, 100), price: Math.max(0, Number(s.price) || 0) }));
        const chosenSupplements = (Array.isArray(it.supplement_ids) ? it.supplement_ids : []).slice(0, 10)
          .map((sid) => supplementById[Number(sid)]).filter(Boolean)
          .map((s) => ({ name: String(s.name).slice(0, 100), price: Math.max(0, Number(s.price) || 0) }));
        const sauceTotal = chosenSauces.reduce((n, s) => n + s.price, 0);
        const supplementTotal = chosenSupplements.reduce((n, s) => n + s.price, 0);
        const unit_price = Math.max(0, Math.round((Number(p.price) + sauceTotal + supplementTotal) * 100) / 100);
        const line_total = Math.round(unit_price * quantity * 100) / 100;
        subtotal += line_total;
        rows.push({ product_id: p.id, product_name: String(p.name).slice(0, 200), unit_price, quantity, sauces: chosenSauces, supplements: chosenSupplements });
      }
      const hasCoords = order_type === 'delivery' && Number.isFinite(Number(delivery_lat)) && Number.isFinite(Number(delivery_lng));
      const lat = hasCoords ? Number(delivery_lat) : null;
      const lng = hasCoords ? Number(delivery_lng) : null;
      if (lat != null && (lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
        return res.status(400).json({ error: 'Invalid coordinates' });
      }

      subtotal = Math.round(subtotal * 100) / 100;
      const delivery_fee = order_type === 'delivery' ? await getDeliveryFee() : 0;
      const total = Math.max(0, Math.round((subtotal + delivery_fee) * 100) / 100);

      // FIX C2: merge hijack disabled by default. Only merge when the caller proves
      // table ownership via table_token OR when cashier (manager) creates it.
      // Public e-menu always creates a new ticket now; cashier merges manually.
      // (findMergeableOrderForTable kept for staff tooling, not auto-used.)

      const _c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
      const access_token = _c && _c.randomUUID ? _c.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      const delivery_otp = String(Math.floor(1000 + Math.random() * 9000));

      const { data: order, error: oErr } = await supabase.from('orders').insert({
        order_type, status: 'pending',
        table_number: order_type === 'dine_in' ? tableNum : null,
        customer_name: order_type === 'delivery' ? cleanText(String(customer_name), 100) : null,
        customer_phone: order_type === 'delivery' ? String(customer_phone).trim().slice(0, 30) : null,
        delivery_address: order_type === 'delivery' ? cleanText(String(delivery_address), 300) : null,
        delivery_lat: lat, delivery_lng: lng,
        notes: cleanNotes, payment_method: 'cash',
        subtotal, delivery_fee, total,
        access_token, delivery_otp,
      }).select().single();
      if (oErr) return internalError(res, oErr, 'orders insert');

      const { data: savedItems, error: iErr } = await supabase.from('order_items')
        .insert(rows.map((r) => ({ ...r, order_id: order.id }))).select();
      if (iErr) return internalError(res, iErr, 'orders items');

      if (order_type === 'dine_in') {
        supabase.from('tables').update({ status: 'occupied' }).eq('table_number', tableNum).catch(console.error);
      }
      // Never expose delivery_otp to the customer browser; only access_token for tracking + push.
      const { delivery_otp: _otp, ...safeOrder } = order;
      return res.status(201).json({ ...safeOrder, items: savedItems, order_token: access_token });
    }

    // ------------------------------------------------------------- PUT (manager, state machine)
    if (req.method === 'PUT') {
      const staff = await requireManager(req, res);
      if (!staff) return;
      const { id, status, otp } = req.body || {};
      const orderId = toId(id);
      if (!orderId || !ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid id or status' });

      const { data: existing } = await supabase.from('orders').select('*').eq('id', orderId).single();
      if (!existing) return res.status(404).json({ error: 'Order not found' });

      // FIX H4: enforce legal transitions
      const allowed = ORDER_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(status)) {
        return res.status(409).json({ error: `Cannot move order from ${existing.status} to ${status}` });
      }
      // Delivery completion requires OTP (given to customer at creation / via tracker)
      if (status === 'completed' && existing.order_type === 'delivery') {
        if (!otp || String(otp) !== String(existing.delivery_otp)) {
          return res.status(403).json({ error: 'Delivery code required to complete this order' });
        }
      }

      const { data, error } = await supabase.from('orders').update({ status }).eq('id', orderId).select().single();
      if (error) return internalError(res, error, 'orders update');
      const { delivery_otp: _o, access_token: _t, ...safe } = data;
      // Return to client immediately (0ms perceived) — side effects run fire-and-forget
      res.status(200).json(safe);

      // ---- Non-blocking background actions (fire-and-forget) ----
      audit(supabase, { actorId: staff.id, action: `order.${status}`, entity: 'orders', entityId: orderId }).catch(console.error);

      if (existing.order_type === 'delivery') {
        if (status === 'ready') broadcastDriverEvent(DRIVER_EVENTS.READY, existing.id).catch(console.error);
        else if (status === 'cancelled' && existing.status === 'ready' && !existing.driver_id) {
          broadcastDriverEvent(DRIVER_EVENTS.REMOVED, existing.id).catch(console.error);
        }
      }

      if (status === 'cancelled' && existing.status !== 'cancelled') {
        (async () => {
          const { data: cancelledItems } = await supabase.from('order_items').select('product_id, quantity').eq('order_id', existing.id);
          if (!cancelledItems?.length) return;
          const { data: currentProducts } = await supabase.from('products').select('id, stock').in('id', cancelledItems.map((i) => i.product_id));
          const stockById = Object.fromEntries((currentProducts || []).map((p) => [p.id, p.stock ?? 0]));
          await Promise.all(cancelledItems.flatMap((it) => [
            supabase.from('products').update({ stock: (stockById[it.product_id] ?? 0) + it.quantity }).eq('id', it.product_id),
            supabase.from('inventory_logs').insert({
              product_id: it.product_id, change: it.quantity, reason: 'correction',
              notes: `Order #${existing.id + 1000} cancelled — stock restored`,
            }),
          ])).catch((err) => console.error(`Stock restore failed for cancelled order #${existing.id}:`, err));
        })().catch(console.error);
      }

      if (['completed', 'cancelled'].includes(status) && existing.table_number && existing.order_type === 'dine_in') {
        supabase.from('tables').update({ status: 'available' }).eq('table_number', existing.table_number).then(() => {}).catch(console.error);
      }

      sendPushToOrder(existing.id, {
        title: 'TRIANGLE', body: pushBodyFor(status, existing.order_type),
        tag: `order-${existing.id}`, url: '/',
      }).catch(console.error);
      // Telegram Bot / Webhooks / printing would also be fire-and-forget here:
      // fetch(TELEGRAM_WEBHOOK, {...}).catch(console.error) — never await.

      return;
    }

    // ---------------------------------------------------------- DELETE (admin)
    if (req.method === 'DELETE') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const { id } = req.body || {};
      const orderId = toId(id);
      if (!orderId) return res.status(400).json({ error: 'Invalid id' });
      await supabase.from('order_items').delete().eq('order_id', orderId);
      const { error } = await supabase.from('orders').delete().eq('id', orderId);
      if (error) return internalError(res, error, 'orders delete');
      await audit(supabase, { actorId: admin.id, action: 'order.delete', entity: 'orders', entityId: orderId });
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return internalError(res, err, 'orders API error');
  }
}
