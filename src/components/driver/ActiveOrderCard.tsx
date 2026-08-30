import { useState } from 'react';
import { Phone, MapPin, Banknote, Loader2, CheckCircle2, Ban } from 'lucide-react';
import { api } from '../../lib/api';
import { money, orderNumber, timeAgo } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import {
  DELIVERY_STATUS_LABEL, deliveryStepIndex, driverActionLabel, nextDriverAction,
} from '../../lib/driverStatus';
import type { DriverCancelReason } from '../../lib/driverStatus';
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
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const status = order.delivery_status ?? 'unassigned';
  const stepIndex = deliveryStepIndex(status);
  const action = nextDriverAction(status);
  const phone = order.customer_phone?.trim();
  // Cancellable any time after acceptance, up until it's actually delivered
  // — e.g. the driver reached the address but the customer isn't
  // reachable or refuses the order.
  const canCancel = status !== 'delivered';

  const advance = async () => {
    if (!action) return;
    setBusy(true);
    try {
      await api('/api/driver-orders', { method: 'PUT', body: JSON.stringify({ id: order.id, action }) });
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('driver.update_failed'));
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async (reason: DriverCancelReason, note: string) => {
    setCancelling(true);
    try {
      await api('/api/driver-orders', {
        method: 'PUT',
        body: JSON.stringify({ id: order.id, action: 'cancel', reason, note }),
      });
      setCancelOpen(false);
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('driver.update_failed'));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-soft-lg ring-1 ring-zinc-100">
      {/* Header */}
      <div className="flex items-center justify-between bg-zinc-950 px-4 py-3">
        <div>
          <p className="font-display text-lg font-extrabold text-white">{orderNumber(order.id)}</p>
          <p className="text-[11px] text-zinc-400">{timeAgo(order.created_at)}</p>
        </div>
        <span className="rounded-full bg-brand-500/15 px-3 py-1 text-xs font-bold text-brand-400 ring-1 ring-brand-500/30">
          {DELIVERY_STATUS_LABEL[status]}
        </span>
      </div>

      <div className="px-4 pt-4">
        <Stepper stepIndex={stepIndex} />
      </div>

      {/* Customer + address */}
      <div className="space-y-3 px-4 py-4">
        <p className="font-display text-xl font-bold text-zinc-900">{order.customer_name || t('common.na')}</p>

        <div className="flex items-start gap-2.5 text-[15px] text-zinc-700">
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

        <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-3.5 py-3 ring-1 ring-zinc-200">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-600">
            <Banknote size={18} className="text-emerald-600" />
            {t('driver.cod_amount')}
          </div>
          <span className="font-display text-xl font-extrabold text-zinc-900">{money(order.total)}</span>
        </div>
      </div>

      {/* Actions — large, high-contrast, thumb-reachable */}
      <div className="grid grid-cols-1 gap-2 px-4 pb-4 sm:grid-cols-[auto_1fr]">
        {phone && (
          <a
            href={`tel:${phone}`}
            className="flex items-center justify-center gap-2 rounded-xl bg-zinc-100 px-5 py-4 text-[15px] font-bold text-zinc-800 transition active:scale-[0.98]"
          >
            <Phone size={20} /> {t('driver.call')}
          </a>
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
