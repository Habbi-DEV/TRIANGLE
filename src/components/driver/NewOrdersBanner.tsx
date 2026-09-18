import { useNavigate } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { useLang } from '../../lib/i18n';
import { useDriverAvailable } from '../../contexts/DriverAvailableContext';

/**
 * Sticky top banner that appears anywhere in the driver shell the moment a
 * new order shows up on the Available feed — so a driver reading the
 * Active tab doesn't only find out once they happen to switch tabs. Backs
 * onto DriverAvailableContext's own new-order tracking (which also fires
 * the vibration/chime); this component just renders the resulting count
 * and lets the driver jump straight to it.
 */
export default function NewOrdersBanner() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { newOrders, dismissNew } = useDriverAvailable();

  if (newOrders.length === 0) return null;

  const label = newOrders.length === 1
    ? t('driver.new_orders_banner.one')
    : t('driver.new_orders_banner.many', { n: newOrders.length });

  return (
    // Sticks right under the driver header, whose real height is published
    // as --driver-header-h by DriverLayout (it varies with the safe-area
    // inset and the two-row layout), with the old hardcoded value as a
    // fallback if this ever renders outside that shell.
    <div
      className="sticky z-20 flex items-center justify-between gap-2 bg-brand-500 px-3 py-2.5 text-white shadow-md sm:px-4"
      style={{ top: 'var(--driver-header-h, 57px)' }}
    >
      <div className="flex min-w-0 items-center gap-2 text-[13px] font-bold sm:text-sm">
        <Bell size={16} className="shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => {
            dismissNew();
            navigate('/driver/available');
          }}
          className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold transition hover:bg-white/30"
        >
          {t('driver.new_orders_banner.view')}
        </button>
        <button
          type="button"
          onClick={dismissNew}
          aria-label={t('common.close')}
          className="flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition hover:bg-white/20 hover:text-white"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
