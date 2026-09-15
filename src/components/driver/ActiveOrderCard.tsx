import { useState } from 'react';
import { Phone, MapPin, Banknote, Loader2, CheckCircle2, Ban } from 'lucide-react';
import { api } from '../../lib/api';
import { money, orderNumber, timeAgo } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import { useToast } from '../ui/ToastProvider';
import { useDriverOrderStore } from '../../stores/driverOrderStore';
import {
  DELIVERY_STATUS_LABEL, deliveryStepIndex, driverActionLabel, nextDriverAction,
} from '../../lib/driverStatus';
import type { DriverCancelReason } from '../../lib/driverStatus';
import type { DeliveryStatus } from '../../lib/types';
import RouteMap from './RouteMap';
import CancelOrderModal from './CancelOrderModal';
import type { Order } from '../../lib/types';

const STEPS = ['accepted', 'picked_up', 'on_the_way', 'delivered'] as const;
const STEP_LABEL_KEY: Record<(typeof STEPS)[number], string> = {
  accepted: 'driver.step.accepted',
  picked_up: 'driver.step.picked_up',
  on_the_way: 'driver.step.on_the_way',
  delivered: 'driver.step.delivered',
};

function Stepper({ stepIndex }: { stepIndex: number }) {
  const { t } = useLang();
  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => (
        <div key={step} className="flex flex-1 items-center last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition ${
                i <= stepIndex ? 'bg-brand-500 text-white' : 'bg-zinc-200 text-zinc-500'
              }`}
            >
              {i < stepIndex ? <CheckCircle2 size={16} /> : i + 1}
            </div>
            <span className={`hidden text-[10px] font-semibold sm:block ${i <= stepIndex ? 'text-brand-700' : 'text-zinc-400'}`}>
              {t(STEP_LABEL_KEY[step])}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`mx-1 h-1 flex-1 rounded-full ${i < stepIndex ? 'bg-brand-500' : 'bg-zinc-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function ActiveOrderCard({ order, onUpdated }: { order: Order; onUpdated: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [otp, setOtp] = useState('');
  // optimistic overlay: instant UI before server confirms
  const [optimisticStatus, setOptimisticStatus] = useState<DeliveryStatus | null>(null);
  const [optimisticCancelled, setOptimisticCancelled] = useState(false);
  const status = (optimisticCancelled ? 'cancelled' as unknown as DeliveryStatus : (optimisticStatus ?? order.delivery_status ?? 'unassigned')) as DeliveryStatus;
  // we keep original order.status for cancelled check via optimisticCancelled flag
  const effectiveOrder = optimisticCancelled ? { ...order, status: 'cancelled' as const } : optimisticStatus ? { ...order, delivery_status: optimisticStatus } : order;
  const stepIndex = deliveryStepIndex(status);
  const action = nextDriverAction(status);
  const phone = order.customer_phone?.trim();
  const canCancel = !optimisticCancelled && status !== 'delivered' && order.status !== 'cancelled';

  const advance = async () => {
    if (!action) return;
    if (action === 'delivered' && otp.trim().length !== 4) {
      toast(t('driver.otp_required'), 'error');
      return;
    }
    const prevStatus = order.delivery_status ?? 'unassigned';
    const nextMap: Record<string, DeliveryStatus> = { picked_up: 'picked_up', on_the_way: 'on_the_way', delivered: 'delivered' } as const;
    const nextStatus = nextMap[action] ?? null;
    // 0ms optimistic local + global
    if (nextStatus) {
      setOptimisticStatus(nextStatus);
      useDriverOrderStore.getState().patchMine(order.id, { delivery_status: nextStatus });
    }
    setBusy(true);
    try {
      await api('/api/driver-orders', {
        method: 'PUT',
        body: JSON.stringify({ id: order.id, action, ...(action === 'delivered' ? { otp: otp.trim() } : {}) }),
      });
      setOtp('');
      toast(driverActionLabel(action), 'success');
      onUpdated();
    } catch (err) {
      setOptimisticStatus(prevStatus as DeliveryStatus);
      if (nextStatus) useDriverOrderStore.getState().patchMine(order.id, { delivery_status: prevStatus as DeliveryStatus });
      if (action === 'delivered') {
        setOptimisticStatus('on_the_way');
        useDriverOrderStore.getState().patchMine(order.id, { delivery_status: 'on_the_way' });
      }
      const msg = err instanceof Error ? err.message : t('driver.update_failed');
      toast(msg, 'error');
    } finally {
      setBusy(false);
      setTimeout(() => setOptimisticStatus(null), 4000);
    }
  };

  const cancelOrder = async (reason: DriverCancelReason, note: string) => {
    setOptimisticCancelled(true);
    useDriverOrderStore.getState().patchMine(order.id, { status: 'cancelled' } as any);
    setCancelling(true);
    try {
      await api('/api/driver-orders', {
        method: 'PUT',
        body: JSON.stringify({ id: order.id, action: 'cancel', reason, note }),
      });
      setCancelOpen(false);
      toast(t('driver.cancel_order.success'), 'success');
      onUpdated();
    } catch (err) {
      setOptimisticCancelled(false);
      useDriverOrderStore.getState().patchMine(order.id, { status: order.status, delivery_status: order.delivery_status } as any);
      const msg = err instanceof Error ? err.message : t('driver.update_failed');
      toast(msg, 'error');
    } finally {
      setCancelling(false);
    }
  };

  if (optimisticCancelled) {
    return (
      <div className="overflow-hidden rounded-2xl bg-white driver-dark:bg-zinc-900 p-6 text-center shadow-soft ring-1 ring-zinc-100">
        <p className="font-display text-lg font-bold text-red-600">{t('driver.cancelled')}</p>
        <p className="mt-1 text-sm text-zinc-500">{t('driver.cancel_order.success')}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white driver-dark:bg-zinc-900 shadow-soft-lg ring-1 ring-zinc-100 driver-dark:ring-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between bg-zinc-950 px-4 py-3">
        <div>
          <p className="font-display text-lg font-extrabold text-white">{orderNumber(effectiveOrder.id)}</p>
          <p className="text-[11px] text-zinc-400">{timeAgo(effectiveOrder.created_at)}</p>
        </div>
        <span className="rounded-full bg-brand-500/15 px-3 py-1 text-xs font-bold text-brand-400 ring-1 ring-brand-500/30">
          {DELIVERY_STATUS_LABEL[status as DeliveryStatus] ?? status}
        </span>
      </div>

      <div className="px-4 pt-4">
        <Stepper stepIndex={stepIndex} />
      </div>

      {/* Customer + address */}
      <div className="space-y-3 px-4 py-4">
        <p className="font-display text-xl font-bold text-zinc-900 driver-dark:text-white">{order.customer_name || t('common.na')}</p>

        <div className="flex items-start gap-2.5 text-[15px] text-zinc-700 driver-dark:text-zinc-300">
          <MapPin size={18} className="mt-0.5 shrink-0 text-brand-500" />
          <span className="leading-snug">{order.delivery_address || t('common.na')}</span>
        </div>

        {order.notes && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">{order.notes}</p>
        )}

        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400">{t('driver.route')}</p>
          <RouteMap destLat={order.delivery_lat} destLng={order.delivery_lng} destAddress={order.delivery_address} />
        </div>

        <div className="flex items-center justify-between rounded-xl bg-zinc-50 driver-dark:bg-zinc-800 px-3.5 py-3 ring-1 ring-zinc-200 driver-dark:ring-zinc-700">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-600 driver-dark:text-zinc-300">
            <Banknote size={18} className="text-emerald-600" />
            {t('driver.cod_amount')}
          </div>
          <span className="font-display text-xl font-extrabold text-zinc-900 driver-dark:text-white">{money(order.total)}</span>
        </div>
      </div>

      {/* Actions — large, high-contrast, thumb-reachable */}
      <div className="grid grid-cols-1 gap-2 px-4 pb-4 sm:grid-cols-[auto_1fr]">
        {phone && (
          <a
            href={`tel:${phone}`}
            className="flex items-center justify-center gap-2 rounded-xl bg-zinc-100 driver-dark:bg-zinc-800 px-5 py-4 text-[15px] font-bold text-zinc-800 driver-dark:text-zinc-200 transition active:scale-[0.98]"
          >
            <Phone size={20} /> {t('driver.call')}
          </a>
        )}
        {action === 'delivered' && (
          <div className="rounded-xl bg-amber-50 driver-dark:bg-amber-900/20 px-4 py-3 ring-1 ring-amber-200 driver-dark:ring-amber-800">
            <p className="text-xs font-bold text-amber-800 driver-dark:text-amber-300">{t('driver.otp_hint')}</p>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••"
              className="mt-1.5 w-full rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-center font-display text-xl font-extrabold tracking-[0.5em] text-zinc-900 outline-none focus:border-brand-500"
            />
          </div>
        )}
        {action && (
          <button
            type="button"
            onClick={advance}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-4 text-[15px] font-bold text-white shadow-md shadow-orange-500/30 transition active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
            {driverActionLabel(action)}
          </button>
        )}
      </div>

      {canCancel && (
        <div className="flex justify-center pb-4">
          <button
            type="button"
            onClick={() => setCancelOpen(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-600"
          >
            <Ban size={13} />
            {t('driver.cancel_order')}
          </button>
        </div>
      )}

      <CancelOrderModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={cancelOrder}
        busy={cancelling}
      />
    </div>
  );
}
