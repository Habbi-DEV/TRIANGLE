import { useEffect } from 'react';
import { PackageSearch } from 'lucide-react';
import AvailableOrderCard from '../../components/driver/AvailableOrderCard';
import OrderListSkeleton from '../../components/driver/OrderListSkeleton';
import useMyPosition from '../../hooks/useMyPosition';
import { useLang } from '../../lib/i18n';
import { useDriverAvailable } from '../../contexts/DriverAvailableContext';

export default function DriverAvailablePage() {
  const { t } = useLang();
  const { orders, loading, refresh, dismissNew } = useDriverAvailable();
  // Rough distance-to-customer needs the driver's own position; only asked
  // for on this tab (not the whole app) since it's the only place it's used.
  const myPosition = useMyPosition(true);

  // Looking at the list right now counts as having seen whatever's in it —
  // clears the sticky "new orders" banner elsewhere in the shell.
  useEffect(() => {
    dismissNew();
  }, [dismissNew]);

  if (loading) {
    return <OrderListSkeleton />;
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white driver-dark:bg-zinc-900 py-16 text-center shadow-soft ring-1 ring-zinc-100 driver-dark:ring-zinc-800">
        <PackageSearch size={40} className="text-zinc-300" />
        <p className="font-display text-lg font-bold text-zinc-700 driver-dark:text-zinc-200">{t('driver.no_available')}</p>
        <p className="max-w-xs text-sm text-zinc-500 driver-dark:text-zinc-400">{t('driver.no_available_hint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <AvailableOrderCard key={order.id} order={order} onAccepted={refresh} myPosition={myPosition} />
      ))}
    </div>
  );
}
