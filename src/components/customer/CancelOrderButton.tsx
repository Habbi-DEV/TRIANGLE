import { useEffect, useState } from 'react';
import { Ban } from 'lucide-react';
import type { Order } from '../../lib/types';
import { useLang } from '../../lib/i18n';
import { useToast } from '../ui/ToastProvider';
import { cancelCustomerOrder } from '../../lib/api';
import {
  canCancelOrder,
  msUntilCancelDeadline,
  formatCountdown,
  type CustomerCancelReason,
} from '../../lib/orderCancellation';
import CancelOrderConfirmModal from './CancelOrderConfirmModal';

interface Props {
  order: Order;
  /** Called with the server's updated order once cancellation succeeds, so
   *  the parent (OrderTracker) can swap straight to the cancelled view. */
  onCancelled: (order: Order) => void;
}

export default function CancelOrderButton({ order, onCancelled }: Props) {
  const { t } = useLang();
  const { toast } = useToast();
  const [now, setNow] = useState(() => Date.now());
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Ticks once a second purely so the button re-evaluates canCancelOrder()
  // and disappears the instant the 5-minute window lapses — independent of
  // OrderTracker's own 3s status poll, which only catches *status* changes
  // (confirmed/preparing/…), not the passage of time on an order that's
  // still sitting in 'pending'.
  useEffect(() => {
    if (order.status !== 'pending') return; // nothing to count down once it's left pending
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [order.status]);

  if (!canCancelOrder(order, now)) return null;

  const remainingMs = msUntilCancelDeadline(order, now);

  const handleConfirm = async (reason: CustomerCancelReason, note: string) => {
    setBusy(true);
    try {
      const updated = await cancelCustomerOrder<Order>(order.id, reason, note);
      setModalOpen(false);
      toast(t('shop.cancel_order.success'), 'success');
      onCancelled(updated);
    } catch (err) {
      // Most likely a 409 (status changed / window expired between the
      // button rendering and the confirm tap) — surface the server's own
      // message since it's already user-facing text (see api/orders/cancel.js).
      toast(err instanceof Error ? err.message : t('shop.cancel_order.expired'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border-2 border-red-100 py-3 text-sm font-bold text-red-600 transition hover:bg-red-50 active:scale-[0.98]"
      >
        <Ban size={16} />
        {t('shop.cancel_order.button')}
        <span className="font-normal text-red-400">
          · {t('shop.cancel_order.time_left', { time: formatCountdown(remainingMs) })}
        </span>
      </button>

      <CancelOrderConfirmModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirm}
        busy={busy}
      />
    </>
  );
}
