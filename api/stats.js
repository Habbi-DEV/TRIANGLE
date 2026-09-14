import supabase from './_lib/db-client.js';
import { setCors, requireManager } from './_lib/auth.js';
import { internalError } from './_lib/validate.js';

const ACTIVE = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'];

export default async function handler(req, res) {
  setCors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!(await requireManager(req, res))) return;

  try {
    // FIX timezone: use Africa/Algiers day start (UTC+1, no DST) instead of UTC midnight.
    const now = new Date();
    const algiers = new Date(now.getTime() + (60 + new Date().getTimezoneOffset()) * 0); // computed below simply:
    // Simplest correct: start = today 00:00 in Algiers = UTC 23:00 previous day.
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    start.setUTCHours(start.getUTCHours() - 1); // Algiers = UTC+1

    const { data: orders, error } = await supabase.from('orders')
      .select('id, status, order_type, total, created_at')
      .gte('created_at', start.toISOString()).limit(2000);
    if (error) return internalError(res, error, 'stats');

    const rows = orders || [];
    const billable = rows.filter((o) => o.status !== 'cancelled');
    const revenue = billable.reduce((n, o) => n + Number(o.total || 0), 0);
    const by_type = { dine_in: 0, takeaway: 0, delivery: 0 };
    for (const o of billable) if (by_type[o.order_type] != null) by_type[o.order_type]++;

    res.setHeader('Cache-Control', 'private, max-age=30');
    return res.status(200).json({
      revenue_today: Math.round(revenue * 100) / 100,
      orders_today: billable.length,
      completed_today: rows.filter((o) => o.status === 'completed').length,
      active_orders: rows.filter((o) => ACTIVE.includes(o.status)).length,
      avg_order: billable.length ? Math.round((revenue / billable.length) * 100) / 100 : 0,
      by_type,
    });
  } catch (err) {
    return internalError(res, err, 'stats API error');
  }
}
