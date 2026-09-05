import { Bike } from 'lucide-react';
import useDriverOrders from '../../hooks/useDriverOrders';
import ActiveOrderCard from '../../components/driver/ActiveOrderCard';
import DriverStatsBar from '../../components/driver/DriverStatsBar';
import OrderListSkeleton from '../../components/driver/OrderListSkeleton';
import { useLang } from '../../lib/i18n';

export default function DriverActivePage() {
  const { t } = useLang();
  const { orders, loading, refresh } = useDriverOrders('mine');

  const active = orders.filter((o) => o.delivery_status !== 'delivered' && o.status !== 'cancelled');
  const recent = orders
    .filter((o) => o.delivery_status === 'delivered' || o.status === 'cancelled')
    .slice(0, 5);

  if (loading) {
    return <OrderListSkeleton count={2} />;
  }

  if (active.length === 0) {
    return (
      <>
        <DriverStatsBar orders={orders} />
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white driver-dark:bg-zinc-900 py-16 text-center shadow-soft ring-1 ring-zinc-100 driver-dark:ring-zinc-800">
          <Bike size={40} className="text-zinc-300" />
          <p className="font-display text-lg font-bold text-zinc-700 driver-dark:text-zinc-200">{t('driver.no_active')}</p>
          <p className="max-w-xs text-sm text-zinc-500 driver-dark:text-zinc-400">{t('driver.no_active_hint')}</p>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <DriverStatsBar orders={orders} />

      {active.map((order) => (
        <ActiveOrderCard key={order.id} order={order} onUpdated={refresh} />
      ))}

      {recent.length > 0 && (
        <div className="pt-2">
          <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-zinc-400">
            {t('driver.recent')}
          </p>
          <div className="space-y-2">
            {recent.map((order) => (
              <div key={order.id} className="flex items-center justify-between rounded-xl bg-white driver-dark:bg-zinc-900 px-4 py-3 text-sm ring-1 ring-zinc-100 driver-dark:ring-zinc-800">
                <span className="font-semibold text-zinc-700 driver-dark:text-zinc-200">#{order.id + 1000}</span>
                <span className="text-zinc-400">{order.customer_name}</span>
                {order.status === 'cancelled' ? (
                  <span className="font-bold text-red-500">{t('driver.cancelled')}</span>
                ) : (
                  <span className="font-bold text-emerald-600">{t('driver.delivered')}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
