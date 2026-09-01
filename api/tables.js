import supabase from './_lib/db-client.js';
import { setCors, requireStaff } from './_lib/auth.js';

const TABLE_STATUSES = ['available', 'occupied', 'reserved', 'cleaning'];
// Mirrors the order lifecycle in api/orders.js: a dine-in order seats its
// table on creation and frees it on completion/cancellation.
const ACTIVE_ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'];

/** Returns the id of the open dine-in order seated at this table, else null. */
async function openOrderForTable(tableNumber) {
  const { data } = await supabase
    .from('orders')
    .select('id')
    .eq('table_number', tableNumber)
    .eq('order_type', 'dine_in')
    .in('status', ACTIVE_ORDER_STATUSES)
    .limit(1);
  return data && data.length > 0 ? data[0].id : null;
}

export default async function handler(req, res) {
  setCors(req, res, 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .order('table_number', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      if (!(await requireStaff(req, res))) return;
      const { table_number, seats } = req.body || {};
      if (!table_number || isNaN(Number(table_number))) {
        return res.status(400).json({ error: 'A valid table number is required' });
      }
      const { data, error } = await supabase
        .from('tables')
        .insert({ table_number: Number(table_number), seats: Number(seats) || 2, status: 'available' })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      if (!(await requireStaff(req, res))) return;
      const { id, status, seats, table_number } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      const fields = {};
      if (status != null) {
        if (!TABLE_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid table status' });
        // Single source of truth: a table with an open order IS occupied —
        // manual status flips are rejected until the order is closed
        // (closing it frees the table automatically in api/orders.js).
        const { data: tbl } = await supabase.from('tables').select('table_number').eq('id', Number(id)).single();
        if (tbl) {
          const openId = await openOrderForTable(tbl.table_number);
          if (openId != null) {
            return res.status(409).json({ error: `Table has an open order (#${Number(openId) + 1000}) — complete or cancel it first` });
          }
        }
        fields.status = status;
      }
      if (seats != null) fields.seats = Number(seats);
      if (table_number != null) fields.table_number = Number(table_number);
      const { data, error } = await supabase
        .from('tables')
        .update(fields)
        .eq('id', Number(id))
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      if (!(await requireStaff(req, res))) return;
      const { id } = req.body || {};
      // Deleting a seated table would leave its open order pointing at a
      // table that no longer exists (and a recreated table would wrongly
      // show "available") — refuse while an order is open.
      const { data: tbl } = await supabase.from('tables').select('table_number').eq('id', Number(id)).single();
      if (tbl) {
        const openId = await openOrderForTable(tbl.table_number);
        if (openId != null) {
          return res.status(409).json({ error: `Table has an open order (#${Number(openId) + 1000}) — complete or cancel it first` });
        }
      }
      const { error } = await supabase.from('tables').delete().eq('id', Number(id));
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('tables API error:', err);
    res.status(500).json({ error: err.message });
  }
}
