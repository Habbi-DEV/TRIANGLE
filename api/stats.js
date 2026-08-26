import supabase from './db-client.js';

const ACTIVE = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);

    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, status, order_type, total, created_at')
      .gte('created_at', start.toISOString());
    if (error) throw error;

    const rows = orders || [];
    const billable = rows.filter((o) => o.status !== 'cancelled');
    const revenue = billable.reduce((n, o) => n + Number(o.total || 0), 0);
    const by_type = { dine_in: 0, takeaway: 0, delivery: 0 };
    for (const o of billable) if (by_type[o.order_type] != null) by_type[o.order_type]++;

    return res.status(200).json({
      revenue_today: Math.round(revenue * 100) / 100,
      orders_today: billable.length,
      completed_today: rows.filter((o) => o.status === 'completed').length,
      active_orders: rows.filter((o) => ACTIVE.includes(o.status)).length,
      avg_order: billable.length ? Math.round((revenue / billable.length) * 100) / 100 : 0,
      by_type,
    });
  } catch (err) {
    console.error('stats API error:', err);
    res.status(500).json({ error: err.message });
  }
}
