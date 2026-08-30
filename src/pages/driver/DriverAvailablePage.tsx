import { PackageSearch } from 'lucide-react';
import useDriverOrders from '../../hooks/useDriverOrders';
import AvailableOrderCard from '../../components/driver/AvailableOrderCard';
import Spinner from '../../components/ui/Spinner';
import { useLang } from '../../lib/i18n';

export default function DriverAvailablePage() {
  const { t } = useLang();
  const { orders, loading, refresh } = useDriverOrders('available');

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white py-16 text-center shadow-soft ring-1 ring-zinc-100">
        <PackageSearch size={40} className="text-zinc-300" />
        <p className="font-display text-lg font-bold text-zinc-700">{t('driver.no_available')}</p>
        <p className="max-w-xs text-sm text-zinc-500">{t('driver.no_available_hint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <AvailableOrderCard key={order.id} order={order} onAccepted={refresh} />
      ))}
    </div>
  );
}
