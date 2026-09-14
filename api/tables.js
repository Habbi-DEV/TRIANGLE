import supabase from './_lib/db-client.js';
import { setCors, requireManager } from './_lib/auth.js';
import { internalError, toId, audit } from './_lib/validate.js';

const TABLE_STATUSES = ['available', 'occupied', 'reserved', 'cleaning'];
const ACTIVE_ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'];

async function openOrderForTable(tableNumber) {
  const { data } = await supabase.from('orders').select('id')
    .eq('table_number', tableNumber).eq('order_type', 'dine_in')
    .in('status', ACTIVE_ORDER_STATUSES).limit(1);
  return data && data.length > 0 ? data[0].id : null;
}

export default async function handler(req, res) {
  setCors(req, res, 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      // Public e-menu table picker: numbers + seats + live status only.
      // No ids, no timestamps — enough for the customer to choose a table,
      // not enough to enumerate or manipulate anything.
      if (req.query.public === '1') {
        const { data, error } = await supabase.from('tables').select('table_number, seats, status').order('table_number');
        if (error) return internalError(res, error, 'tables public GET');
        return res.status(200).json(data || []);
      }
      const staff = await requireManager(req, res);
      if (!staff) return;
      const { data, error } = await supabase.from('tables').select('*').order('table_number', { ascending: true });
      if (error) return internalError(res, error, 'tables GET');
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const staff = await requireManager(req, res);
      if (!staff) return;
      const tn = Number(req.body?.table_number);
      const seats = Number(req.body?.seats) || 2;
      if (!Number.isInteger(tn) || tn < 1 || tn > 500) return res.status(400).json({ error: 'table_number must be 1..500' });
      if (!Number.isInteger(seats) || seats < 1 || seats > 50) return res.status(400).json({ error: 'seats must be 1..50' });
      const { data, error } = await supabase.from('tables')
        .insert({ table_number: tn, seats, status: 'available' }).select().single();
      if (error) return internalError(res, error, 'tables POST');
      await audit(supabase, { actorId: staff.id, action: 'table.create', entity: 'tables', entityId: data.id });
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const staff = await requireManager(req, res);
      if (!staff) return;
      const { id, status, seats, table_number } = req.body || {};
      const rowId = toId(id);
      if (!rowId) return res.status(400).json({ error: 'Invalid id' });
      const fields = {};
      if (status != null) {
        if (!TABLE_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid table status' });
        const { data: tbl } = await supabase.from('tables').select('table_number').eq('id', rowId).single();
        if (tbl) {
          const openId = await openOrderForTable(tbl.table_number);
          if (openId != null) return res.status(409).json({ error: 'Table has an open order — complete or cancel it first' });
        }
        fields.status = status;
      }
      if (seats != null) {
        if (!Number.isInteger(Number(seats)) || Number(seats) < 1 || Number(seats) > 50) {
          return res.status(400).json({ error: 'Invalid seats (1..50)' });
        }
        fields.seats = Number(seats);
      }
      if (table_number != null) {
        if (!Number.isInteger(Number(table_number)) || Number(table_number) < 1 || Number(table_number) > 500) {
          return res.status(400).json({ error: 'Invalid table_number (1..500)' });
        }
        fields.table_number = Number(table_number);
      }
      if (!Object.keys(fields).length) return res.status(400).json({ error: 'No valid fields' });
      const { data, error } = await supabase.from('tables').update(fields).eq('id', rowId).select().single();
      if (error) return internalError(res, error, 'tables PUT');
      await audit(supabase, { actorId: staff.id, action: 'table.update', entity: 'tables', entityId: rowId });
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const staff = await requireManager(req, res);
      if (!staff) return;
      const rowId = toId(req.body?.id);
      if (!rowId) return res.status(400).json({ error: 'Invalid id' });
      const { data: tbl } = await supabase.from('tables').select('table_number').eq('id', rowId).single();
      if (tbl) {
        const openId = await openOrderForTable(tbl.table_number);
        if (openId != null) return res.status(409).json({ error: 'Table has an open order — complete or cancel it first' });
      }
      const { error } = await supabase.from('tables').delete().eq('id', rowId);
      if (error) return internalError(res, error, 'tables DELETE');
      await audit(supabase, { actorId: staff.id, action: 'table.delete', entity: 'tables', entityId: rowId });
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return internalError(res, err, 'tables API error');
  }
}
