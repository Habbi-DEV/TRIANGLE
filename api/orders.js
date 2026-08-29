import supabase from './_lib/db-client.js';
import { setCors, requireStaff, requireAdmin } from './_lib/auth.js';

const ORDER_TYPES = ['dine_in', 'takeaway', 'delivery'];
const ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];

// No VAT/tax in this build (Algeria: not applicable). delivery_fee lives in
// `settings` (single source of truth, editable from /admin/settings) and is
// snapshotted onto the order at creation time, same reasoning tax_rate used
// to get snapshotted for: settings can change between orders, and the order
// row needs to keep the fee that was actually charged.
async function getDeliveryFee() {
  const { data, error } = await supabase.from('settings').select('delivery_fee').eq('id', 1).single();
  if (error || data == null) return 0;
  return Number(data.delivery_fee) || 0;
}

export default async function handler(req, res) {
  setCors(req, res, 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // ------------------------------------------------------------- GET
    if (req.method === 'GET') {
      const { id, status, order_type, limit, counts } = req.query;

      // Real per-status totals via SQL COUNT — independent of the row
      // limit used for the list view, so badges/tabs stay correct no
      // matter how many orders exist (previously they were computed by
      // counting a capped, truncated list of fetched rows: 60 in the
      // sidebar, 120 in the Orders page, so both under-reported once
      // order volume passed those caps).
      if (counts) {
        const STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];
        const { count: all, error: allErr } = await supabase
          .from('orders').select('*', { count: 'exact', head: true });
        if (allErr) throw allErr;
        const perStatus = await Promise.all(STATUSES.map(async (s) => {
          const { count, error } = await supabase
            .from('orders').select('*', { count: 'exact', head: true }).eq('status', s);
          if (error) throw error;
          return [s, count || 0];
        }));
        return res.status(200).json({ all: all || 0, ...Object.fromEntries(perStatus) });
      }

      if (id) {
        const { data: order, error } = await supabase
          .from('orders').select('*').eq('id', Number(id)).single();
        if (error || !order) return res.status(404).json({ error: 'Order not found' });
        const { data: items } = await supabase
          .from('order_items').select('*').eq('order_id', order.id).order('id');
        return res.status(200).json({ ...order, items });
      }

      let q = supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Math.min(Number(limit) || 50, 200));
      if (status && status !== 'all') q = q.eq('status', status);
      if (order_type && order_type !== 'all') q = q.eq('order_type', order_type);
      const { data, error } = await q;
      if (error) throw error;

      // Attach line items to every order in one round-trip
      const ids = (data || []).map((o) => o.id);
      let items = [];
      if (ids.length) {
        const { data: it } = await supabase
          .from('order_items').select('*').in('order_id', ids).order('id');
        items = it || [];
      }
      const byOrder = {};
      for (const it of items) (byOrder[it.order_id] ||= []).push(it);
      return res.status(200).json((data || []).map((o) => ({ ...o, items: byOrder[o.id] || [] })));
    }

    // ------------------------------------------------------------ POST
    // Public: both the customer e-menu and the cashier register place orders.
    if (req.method === 'POST') {
      const body = req.body || {};
      const {
        order_type, table_number,
        customer_name, customer_phone, delivery_address,
        notes, items,
      } = body;

      if (!ORDER_TYPES.includes(order_type)) {
        return res.status(400).json({ error: 'Invalid order type' });
      }
      if (order_type === 'dine_in' && !table_number) {
        return res.status(400).json({ error: 'A table number is required for dine-in orders' });
      }
      if (order_type === 'delivery' && (!customer_name || !customer_phone || !delivery_address)) {
        return res.status(400).json({ error: 'Delivery orders require customer name, phone and address' });
      }
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'The order must contain at least one item' });
      }

      const ids = [...new Set(items.map((i) => Number(i.product_id)))];
      const { data: products, error: pErr } = await supabase
        .from('products').select('*').in('id', ids);
      if (pErr) throw pErr;
      const byId = Object.fromEntries((products || []).map((p) => [p.id, p]));

      // Sauces are optional add-ons on a line item. Only ACTIVE sauces count
      // toward the price/snapshot — if one was hidden between the customer
      // adding it to their cart and checking out, it's silently dropped
      // rather than failing the whole order.
      const sauceIds = [...new Set(items.flatMap((i) => (Array.isArray(i.sauce_ids) ? i.sauce_ids : []).map(Number)))];
      let sauceById = {};
      if (sauceIds.length) {
        const { data: sauces, error: sErr } = await supabase
          .from('sauces').select('*').in('id', sauceIds).eq('is_active', true);
        if (sErr) throw sErr;
        sauceById = Object.fromEntries((sauces || []).map((s) => [s.id, s]));
      }

      // Supplements: same optional-add-on treatment as sauces (only ACTIVE
      // ones count; a hidden one is silently dropped rather than failing
      // the order). Unlike sauces, which supplements are even offered was
      // chosen per-product by the admin, but that's a display-time concern
      // for the e-menu — at checkout we trust whatever supplement_ids the
      // client sent, same as sauce_ids.
      const supplementIds = [...new Set(items.flatMap((i) => (Array.isArray(i.supplement_ids) ? i.supplement_ids : []).map(Number)))];
      let supplementById = {};
      if (supplementIds.length) {
        const { data: supplements, error: supErr } = await supabase
          .from('supplements').select('*').in('id', supplementIds).eq('is_active', true);
        if (supErr) throw supErr;
        supplementById = Object.fromEntries((supplements || []).map((s) => [s.id, s]));
      }

      const rows = [];
      let subtotal = 0;
      for (const it of items) {
        const p = byId[Number(it.product_id)];
        if (!p) return res.status(400).json({ error: 'Unknown product in cart' });
        if (!p.is_available) return res.status(400).json({ error: `"${p.name}" is currently unavailable` });
        const quantity = Math.max(1, Math.min(99, parseInt(it.quantity, 10) || 1));
        // STOCK CHECK (new): previously only is_available was checked, never
        // the actual stock count, so orders kept being accepted after a
        // product's stock hit 0 (overselling).
        if ((p.stock ?? 0) < quantity) {
          return res.status(400).json({ error: `Not enough stock for "${p.name}" (${p.stock ?? 0} left)` });
        }

        const chosenSauces = (Array.isArray(it.sauce_ids) ? it.sauce_ids : [])
          .map((id) => sauceById[Number(id)])
          .filter(Boolean)
          .map((s) => ({ name: s.name, price: Number(s.price) }));
        const chosenSupplements = (Array.isArray(it.supplement_ids) ? it.supplement_ids : [])
          .map((id) => supplementById[Number(id)])
          .filter(Boolean)
          .map((s) => ({ name: s.name, price: Number(s.price) }));
        const sauceTotal = chosenSauces.reduce((n, s) => n + s.price, 0);
        const supplementTotal = chosenSupplements.reduce((n, s) => n + s.price, 0);
        const unit_price = Math.round((p.price + sauceTotal + supplementTotal) * 100) / 100;

        const line_total = Math.round(unit_price * quantity * 100) / 100;
        subtotal += line_total;
        // line_total is a GENERATED ALWAYS column in the DB (unit_price * quantity),
        // so it must NOT be included in the insert — Postgres computes it itself.
        // unit_price already folds in the chosen sauces'/supplements' price so
        // the generated line_total (and every downstream total) stays correct
        // without any extra math elsewhere.
        rows.push({ product_id: p.id, product_name: p.name, unit_price, quantity, sauces: chosenSauces, supplements: chosenSupplements });
      }
      subtotal = Math.round(subtotal * 100) / 100;
      const delivery_fee = order_type === 'delivery' ? await getDeliveryFee() : 0;
      const total = Math.round((subtotal + delivery_fee) * 100) / 100;

      const { data: order, error: oErr } = await supabase
        .from('orders')
        .insert({
          order_type,
          status: 'pending',
          table_number: order_type === 'dine_in' ? Number(table_number) : null,
          customer_name: order_type === 'delivery' ? String(customer_name).trim() : null,
          customer_phone: order_type === 'delivery' ? String(customer_phone).trim() : null,
          delivery_address: order_type === 'delivery' ? String(delivery_address).trim() : null,
          notes: notes ? String(notes).trim() : null,
          // Algeria: cash only, no other payment method is offered.
          payment_method: 'cash',
          // delivery_fee is snapshotted onto the order row itself (not just
          // used to compute total here) because schema.sql's
          // recalc_order_totals() trigger re-derives subtotal/total from
          // `orders.delivery_fee` every time order_items change. Without
          // this, that trigger would keep using its column default (0)
          // regardless of what's configured in Settings.
          subtotal, delivery_fee, total,
        })
        .select()
        .single();
      if (oErr) throw oErr;

      const { data: savedItems, error: iErr } = await supabase
        .from('order_items')
        .insert(rows.map((r) => ({ ...r, order_id: order.id })))
        .select();
      if (iErr) throw iErr;

      // NOTE: stock decrement + inventory_logs audit trail are NOT done here
      // anymore. schema.sql already defines a DB trigger
      // (trg_order_items_stock -> decrement_product_stock()) that fires
      // automatically on every order_items INSERT and does both the stock
      // update AND the inventory_logs insert, atomically, inside the same
      // transaction as the insert above.
      //
      // ROOT-CAUSE FIX: this file used to ALSO do the same decrement/log
      // manually (previously as a sequential loop, then "fixed" to run in
      // parallel) — but that was solving the wrong problem. Since the
      // trigger already runs, every order was silently decrementing stock
      // TWICE (once via the trigger, once via this manual code), causing:
      //   1. Products running out of stock roughly twice as fast as they
      //      should ("stock ends and it still lets me order" — the actual
      //      report that surfaced this).
      //   2. A race condition: the manual code computed newStock from a
      //      `byId` snapshot fetched BEFORE the insert, so under concurrent
      //      load it could overwrite the trigger's correct decrement with a
      //      stale value (lost updates).
      //   3. Duplicate rows in inventory_logs for every single sale.
      //   4. Extra network round-trips on every request (removed here),
      //      which also reduces hot-row lock contention on `products` under
      //      concurrent load — a likely contributor to the P95 creep seen
      //      near the end of the load test.
      // Removing this block lets the trigger be the single source of truth
      // for stock changes.

      // Dine-in seats the table
      if (order_type === 'dine_in') {
        await supabase.from('tables').update({ status: 'occupied' }).eq('table_number', Number(table_number));
      }

      return res.status(201).json({ ...order, items: savedItems });
    }

    // ------------------------------------------------------------- PUT
    // Staff only: advance / cancel an order.
    if (req.method === 'PUT') {
      if (!(await requireStaff(req, res))) return;
      const { id, status } = req.body || {};
      if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

      const { data: existing } = await supabase
        .from('orders').select('*').eq('id', Number(id)).single();
      if (!existing) return res.status(404).json({ error: 'Order not found' });

      const { data, error } = await supabase
        .from('orders').update({ status }).eq('id', Number(id)).select().single();
      if (error) throw error;

      // STOCK RESTORE (new): cancelling an order used to leave stock exactly
      // where it was after the sale — the customer's items came back but the
      // stock count never did. Only runs once (guarded by existing.status
      // !== 'cancelled') so re-saving an already-cancelled order can't
      // restore stock twice.
      if (status === 'cancelled' && existing.status !== 'cancelled') {
        const { data: cancelledItems } = await supabase
          .from('order_items').select('product_id, quantity').eq('order_id', existing.id);

        if (cancelledItems?.length) {
          const { data: currentProducts } = await supabase
            .from('products').select('id, stock').in('id', cancelledItems.map((i) => i.product_id));
          const stockById = Object.fromEntries((currentProducts || []).map((p) => [p.id, p.stock ?? 0]));

          await Promise.all(
            cancelledItems.flatMap((it) => [
              supabase.from('products')
                .update({ stock: (stockById[it.product_id] ?? 0) + it.quantity })
                .eq('id', it.product_id),
              supabase.from('inventory_logs').insert({
                product_id: it.product_id,
                change: it.quantity,
                reason: 'correction',
                notes: `Order #${existing.id + 1000} cancelled — stock restored`,
              }),
            ])
          ).catch((err) => console.error(`Stock restore failed for cancelled order #${existing.id}:`, err));
        }
      }

      if (['completed', 'cancelled'].includes(status) && existing.table_number) {
        await supabase.from('tables').update({ status: 'available' }).eq('table_number', existing.table_number);
      }
      return res.status(200).json(data);
    }

    // ---------------------------------------------------------- DELETE
    if (req.method === 'DELETE') {
      if (!(await requireAdmin(req, res))) return;
      const { id } = req.body || {};
      await supabase.from('order_items').delete().eq('order_id', Number(id));
      const { error } = await supabase.from('orders').delete().eq('id', Number(id));
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('orders API error:', err);
    res.status(500).json({ error: err.message });
  }
}