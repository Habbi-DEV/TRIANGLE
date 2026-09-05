import { useMemo } from 'react';
import { Package, Banknote, Timer } from 'lucide-react';
import { money } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import type { Order } from '../../lib/types';

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/**
 * Small motivational strip above the active-orders list: today's delivery
 * count, cash collected, and average time per delivery. Computed entirely
 * client-side from the same `mine` feed the page already fetches (see
 * useDriverOrders) — no extra request, and it naturally only reflects the
 * last ~50 orders api/driver-orders.js returns, which for one driver in a
 * single day is effectively all of them.
 */
export default function DriverStatsBar({ orders }: { orders: Order[] }) {
  const { t } = useLang();

  const stats = useMemo(() => {
    const deliveredToday = orders.filter((o) => o.delivery_status === 'delivered' && o.delivered_at && isToday(o.delivered_at));
    const earnings = deliveredToday.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const durations = deliveredToday
      .filter((o) => o.delivered_at)
      .map((o) => (new Date(o.delivered_at as string).getTime() - new Date(o.created_at).getTime()) / 60000)
      .filter((m) => Number.isFinite(m) && m >= 0);
    const avgMin = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

    return { count: deliveredToday.length, earnings, avgMin };
  }, [orders]);

  if (stats.count === 0) return null;

  return (
    <div className="mb-4 grid grid-cols-3 gap-2">
      <div className="flex flex-col items-center gap-1 rounded-xl bg-white driver-dark:bg-zinc-900 py-3 ring-1 ring-zinc-100 driver-dark:ring-zinc-800">
        <Package size={16} className="text-brand-500" />
        <span className="font-display text-lg font-extrabold text-zinc-900 driver-dark:text-white">{stats.count}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{t('driver.stats.deliveries_today')}</span>
      </div>
      <div className="flex flex-col items-center gap-1 rounded-xl bg-white driver-dark:bg-zinc-900 py-3 ring-1 ring-zinc-100 driver-dark:ring-zinc-800">
        <Banknote size={16} className="text-emerald-600" />
        <span className="font-display text-lg font-extrabold text-zinc-900 driver-dark:text-white">{money(stats.earnings)}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{t('driver.stats.earnings_today')}</span>
      </div>
      <div className="flex flex-col items-center gap-1 rounded-xl bg-white driver-dark:bg-zinc-900 py-3 ring-1 ring-zinc-100 driver-dark:ring-zinc-800">
        <Timer size={16} className="text-blue-500" />
        <span className="font-display text-lg font-extrabold text-zinc-900 driver-dark:text-white">
          {stats.avgMin != null ? `${stats.avgMin}m` : '—'}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{t('driver.stats.avg_time')}</span>
      </div>
    </div>
  );
}
