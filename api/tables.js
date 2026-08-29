import supabase from './_lib/db-client.js';
import { setCors, requireStaff } from './_lib/auth.js';

const TABLE_STATUSES = ['available', 'occupied', 'reserved', 'cleaning'];

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
