import { useEffect, useMemo, useState } from 'react';
import { History, Banknote, Package } from 'lucide-react';
import { api } from '../../lib/api';
import { money, orderNumber, clock } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import OrderListSkeleton from '../../components/driver/OrderListSkeleton';
import type { Order } from '../../lib/types';

type Range = 'today' | 'week' | 'month';
const RANGE_DAYS: Record<Range, number> = { today: 1, week: 7, month: 30 };

function isSameCalendarDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}

/**
 * Full delivery history for this driver, with a lightweight day/week/month
 * filter and running totals — the "sit down and see what I earned"
 * counterpart to the always-live Active/Available tabs. Backed by
 * api/driver-orders.js's ?scope=history, which is always reachable
 * (including while offline) so a driver can review past work any time.
 */
export default function DriverHistoryPage() {
  const { t } = useLang();
  const [range, setRange] = useState<Range>('today');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<Order[]>(`/api/driver-orders?scope=history&days=${RANGE_DAYS[range]}`)
      .then((data) => {
        if (!cancelled) setOrders(data);
      })
      .catch(() => {
        if (!cancelled) setOrders([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  // "Today" needs a calendar-day cut, not just "the last 24h" — the API's
  // ?days=1 window is a rolling 24h and can spill a little into yesterday.
  const filtered = useMemo(() => {
    if (range !== 'today') return orders;
    const now = new Date();
    return orders.filter((o) => isSameCalendarDay(o.created_at, now));
  }, [orders, range]);

  const delivered = filtered.filter((o) => o.status === 'completed');
  const totalEarnings = delivered.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 rounded-xl bg-white driver-dark:bg-zinc-900 p-1.5 ring-1 ring-zinc-100 driver-dark:ring-zinc-800">
        {(['today', 'week', 'month'] as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
              range === r ? 'bg-brand-500 text-white' : 'text-zinc-500 driver-dark:text-zinc-400'
            }`}
          >
            {t(`driver.history.range.${r}`)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col items-center gap-1 rounded-xl bg-white driver-dark:bg-zinc-900 py-4 ring-1 ring-zinc-100 driver-dark:ring-zinc-800">
          <Package size={18} className="text-brand-500" />
          <span className="font-display text-xl font-extrabold text-zinc-900 driver-dark:text-white">{delivered.length}</span>
          <span className="w-full truncate px-1 text-center text-[10px] font-semibold uppercase text-zinc-400">{t('driver.history.total_deliveries')}</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-xl bg-white driver-dark:bg-zinc-900 py-4 ring-1 ring-zinc-100 driver-dark:ring-zinc-800">
          <Banknote size={18} className="text-emerald-600" />
          <span className="w-full truncate px-1 text-center font-display text-lg font-extrabold tabular-nums text-zinc-900 sm:text-xl driver-dark:text-white" title={money(totalEarnings)}>{money(totalEarnings)}</span>
          <span className="w-full truncate px-1 text-center text-[10px] font-semibold uppercase text-zinc-400">{t('driver.history.total_earnings')}</span>
        </div>
      </div>

      {loading ? (
        <OrderListSkeleton count={4} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white driver-dark:bg-zinc-900 py-16 text-center shadow-soft ring-1 ring-zinc-100 driver-dark:ring-zinc-800">
          <History size={40} className="text-zinc-300" />
          <p className="max-w-xs text-sm text-zinc-500 driver-dark:text-zinc-400">{t('driver.history.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-white px-3.5 py-3 text-sm ring-1 ring-zinc-100 driver-dark:bg-zinc-900 driver-dark:ring-zinc-800"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-zinc-700 driver-dark:text-zinc-200">{orderNumber(order.id)}</p>
                <p className="truncate text-xs text-zinc-400">{clock(order.created_at)} · {order.customer_name || t('common.na')}</p>
              </div>
              <div className="shrink-0 text-end">
                <p className="font-bold tabular-nums text-zinc-800 driver-dark:text-zinc-100">{money(order.total)}</p>
                {order.status === 'cancelled' ? (
                  <span className="text-xs font-bold text-red-500">{t('driver.cancelled')}</span>
                ) : (
                  <span className="text-xs font-bold text-emerald-600">{t('driver.delivered')}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
