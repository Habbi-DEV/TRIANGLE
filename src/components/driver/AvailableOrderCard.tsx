import { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Banknote, Loader2, CheckCircle2, Clock } from 'lucide-react';
import { api } from '../../lib/api';
import { notifyOrderAccepted } from '../../lib/driverBus';
import { money, orderNumber, timeAgo } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import { useToast } from '../ui/ToastProvider';
import { useDriverOrderStore } from '../../stores/driverOrderStore';
import { distanceKm } from '../../lib/geo';
import OrderMiniMap from './OrderMiniMap';
import type { Order } from '../../lib/types';

// An unclaimed order sitting this long starts to look stale — flagged with
// a warning tint so it doesn't get buried under fresher ones.
const STALE_MINUTES = 10;
// How far the card must be dragged before a swipe counts as "accept".
const SWIPE_THRESHOLD = 90;

export default function AvailableOrderCard({
  order,
  onAccepted,
  myPosition,
}: {
  order: Order;
  onAccepted: () => void;
  /** Driver's own live [lat, lng], if geolocation permission was granted —
   *  see hooks/useMyPosition. Undefined/null just hides the distance line. */
  myPosition?: [number, number] | null;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState(false);
  const [dragX, setDragX] = useState(0);

  const accept = async () => {
    if (busy || taken) return;
    // 0ms optimistic: disappear instantly + global store
    setTaken(true);
    setBusy(true);
    useDriverOrderStore.getState().removeAvailable(order.id);
    try {
      await api('/api/driver-orders', { method: 'PUT', body: JSON.stringify({ id: order.id, action: 'accept' }) });
      notifyOrderAccepted();
      onAccepted();
      toast(t('driver.accept'), 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('already moved on')) {
        onAccepted();
        toast(message, 'info');
      } else {
        // rollback global + local
        useDriverOrderStore.setState((s) => ({ available: [order, ...s.available] }));
        setTaken(false);
        setBusy(false);
        setDragX(0);
        toast(message || t('driver.update_failed'), 'error');
      }
    }
  };

  if (taken) return null;

  const minutesOld = (Date.now() - new Date(order.created_at).getTime()) / 60000;
  const isStale = minutesOld >= STALE_MINUTES;

  const distance = myPosition && order.delivery_lat != null && order.delivery_lng != null
    ? distanceKm(myPosition[0], myPosition[1], order.delivery_lat, order.delivery_lng)
    : null;

  const swipeProgress = Math.min(1, Math.abs(dragX) / SWIPE_THRESHOLD);

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Revealed behind the card as it's dragged — a visual promise of
          what letting go will do, on both drag directions so it works the
          same regardless of LTR/RTL layout. */}
      <div
        className="absolute inset-0 flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 font-bold text-white"
        style={{ opacity: swipeProgress }}
        aria-hidden
      >
        <CheckCircle2 size={20} />
        {t('driver.accept')}
      </div>

      <motion.div
        drag={busy ? false : 'x'}
        dragElastic={0.35}
        dragConstraints={{ left: 0, right: 0 }}
        dragMomentum={false}
        onDrag={(_e, info) => setDragX(info.offset.x)}
        onDragEnd={(_e, info) => {
          if (Math.abs(info.offset.x) >= SWIPE_THRESHOLD) {
            accept();
          } else {
            setDragX(0);
          }
        }}
        animate={busy ? { x: 0 } : undefined}
        className={`relative flex items-center gap-3 rounded-2xl bg-white driver-dark:bg-zinc-900 p-4 shadow-soft ring-1 ${
          isStale ? 'ring-amber-300 driver-dark:ring-amber-700' : 'ring-zinc-100 driver-dark:ring-zinc-800'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-base font-bold text-zinc-900 driver-dark:text-white">{orderNumber(order.id)}</p>
            <span className="text-[11px] text-zinc-400">{timeAgo(order.created_at)}</span>
            {isStale && (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 driver-dark:bg-amber-900/40 px-2 py-0.5 text-[10px] font-bold text-amber-700 driver-dark:text-amber-400">
                <Clock size={10} /> {t('driver.waiting_long')}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-start gap-1.5 text-sm text-zinc-600 driver-dark:text-zinc-400">
            <MapPin size={15} className="mt-0.5 shrink-0 text-brand-500" />
            <span className="truncate">{order.delivery_address}</span>
          </div>
          {order.delivery_lat != null && order.delivery_lng != null && (
            <OrderMiniMap lat={order.delivery_lat} lng={order.delivery_lng} />
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800 driver-dark:text-zinc-200">
              <Banknote size={15} className="text-emerald-600" />
              {money(order.total)}
            </div>
            {distance != null && (
              <span className="text-xs font-semibold text-zinc-400">
                {t('driver.distance_away', { km: distance < 1 ? distance.toFixed(1) : Math.round(distance) })}
              </span>
            )}
          </div>
          <p className="mt-1.5 hidden text-[10px] font-medium text-zinc-300 sm:block">{t('driver.swipe_to_accept')}</p>
        </div>

        <button
          type="button"
          onClick={accept}
          disabled={busy}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-4 py-3.5 text-sm font-bold text-white shadow-md shadow-orange-500/30 transition active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          {t('driver.accept')}
        </button>
      </motion.div>
    </div>
  );
}
