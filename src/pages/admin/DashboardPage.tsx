import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bike, Coins, Flame, ReceiptText, ShoppingBag, TrendingUp, UtensilsCrossed } from 'lucide-react';
import { api } from '../../lib/api';
import useLiveOrders from '../../hooks/useLiveOrders';
import StatusBadge from '../../components/StatusBadge';
import { OrderTypeTag, orderContext } from '../../components/OrderTypeTag';
import Spinner from '../../components/ui/Spinner';
import { money, orderNumber, timeAgo } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import type { Stats } from '../../lib/types';

export default function DashboardPage() {
  const { t } = useLang();
  const [stats, setStats] = useState<Stats | null>(null);
  const { orders, loading } = useLiveOrders(12, 5000);

  useEffect(() => {
    const load = () => api<Stats>('/api/stats').then(setStats).catch(console.error);
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, []);

  const cards = [
    { labelKey: 'dashboard.revenue_today', value: stats ? money(stats.revenue_today) : '—', Icon: TrendingUp, tint: 'bg-brand-50 text-brand-600' },
    { labelKey: 'dashboard.orders_today', value: stats ? String(stats.orders_today) : '—', Icon: ReceiptText, tint: 'bg-sky-50 text-sky-600' },
    { labelKey: 'dashboard.active_orders', value: stats ? String(stats.active_orders) : '—', Icon: Flame, tint: 'bg-amber-50 text-amber-600' },
    { labelKey: 'dashboard.avg_ticket', value: stats ? money(stats.avg_order) : '—', Icon: Coins, tint: 'bg-indigo-50 text-indigo-600' },
  ];

  const typeCards = [
    { labelKey: 'orderType.dine_in', count: stats?.by_type.dine_in ?? 0, Icon: UtensilsCrossed, cls: 'bg-brand-500' },
    { labelKey: 'orderType.takeaway', count: stats?.by_type.takeaway ?? 0, Icon: ShoppingBag, cls: 'bg-amber-400' },
    { labelKey: 'orderType.delivery', count: stats?.by_type.delivery ?? 0, Icon: Bike, cls: 'bg-sky-500' },
  ];

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-zinc-900">{t('dashboard.title')}</h1>
        <p className="text-sm text-zinc-500">{t('dashboard.subtitle')}</p>
      </div>

      {!stats ? (
        <Spinner label={t('dashboard.crunching')} />
      ) : (
        <>
          {/* stat cards */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {cards.map((c) => (
              <div key={c.labelKey} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
                <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl ${c.tint}`}>
                  <c.Icon size={17} />
                </div>
                <p className="font-display text-xl font-bold text-zinc-900">{c.value}</p>
                <p className="text-xs font-medium text-zinc-400">{t(c.labelKey)}</p>
              </div>
            ))}
          </div>

          {/* by type */}
          <div className="mt-3 grid grid-cols-3 gap-3">
            {typeCards.map((tc) => (
              <div key={tc.labelKey} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-white ${tc.cls}`}>
                  <tc.Icon size={16} />
                </div>
                <div>
                  <p className="font-display text-lg font-bold leading-none text-zinc-900">{tc.count}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-zinc-400">{t(tc.labelKey)} {t('dashboard.today_suffix')}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* live feed */}
      <div className="mt-6 rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-500" />
            </span>
            <h2 className="font-display text-[15px] font-bold text-zinc-900">{t('dashboard.live_feed')}</h2>
          </div>
          <Link to="/admin/orders" className="text-xs font-bold text-brand-600 hover:text-brand-700">{t('dashboard.manage_all')}</Link>
        </div>
        {loading ? (
          <Spinner />
        ) : orders.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-400">{t('dashboard.no_orders_yet')}</p>
        ) : (
          <ul className="divide-y divide-zinc-50">
            {orders.slice(0, 8).map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-5 py-3">
                <span className="w-14 shrink-0 font-display text-sm font-bold text-zinc-900">{orderNumber(o.id)}</span>
                <OrderTypeTag type={o.order_type} />
                <span className="hidden truncate text-xs text-zinc-400 sm:inline">{orderContext(o)}</span>
                <span className="ms-auto text-sm font-bold text-zinc-900">{money(o.total)}</span>
                <StatusBadge status={o.status} />
                <span className="hidden w-16 text-end text-[11px] text-zinc-400 md:inline">{timeAgo(o.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
