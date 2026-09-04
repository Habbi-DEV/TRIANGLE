import { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, Printer, XCircle } from 'lucide-react';
import type { Order, OrderStatus } from '../../lib/types';
import { orderNumber } from '../../lib/format';
import { printInvoice } from '../../lib/invoice';
import { ORDER_STATUS_HINT, ORDER_STATUS_LABEL } from '../../lib/orderStatus';
import { useLang } from '../../lib/i18n';
import { isPushSupported, subscribeToPush } from '../../lib/push';

const STEPS: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed'];

// Remembers which orders this browser already has a push subscription for,
// so the "enable alerts" button doesn't reappear every time the customer
// reopens the tracker for the same order.
const pushKey = (id: number) => `restolink:pushSubscribed:${id}`;

interface Props {
  order: Order;
  onClose: () => void;
  /** Called with the freshly-polled order on every successful check, so a
   *  parent tracking its own copy of the order (for the notification bell,
   *  say) stays in sync even while this tracker is the one doing the
   *  polling. Optional so this component still works standalone. */
  onUpdate?: (order: Order) => void;
}

export default function OrderTracker({ order: initial, onClose, onUpdate }: Props) {
  const { t } = useLang();
  const [order, setOrder] = useState<Order>(initial);
  // 'idle' → show the "enable alerts" button; 'subscribed' → already done
  // (this session or a previous one); 'denied' → browser-level block, only
  // fixable from the browser's own site settings, so the button is
  // replaced with a short explanation instead of retrying forever.
  const [pushState, setPushState] = useState<'idle' | 'subscribed' | 'denied'>(() =>
    localStorage.getItem(pushKey(initial.id)) === '1' ? 'subscribed' : 'idle'
  );

  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders?id=${initial.id}`);
        if (res.ok) {
          const fresh = await res.json();
          setOrder(fresh);
          onUpdate?.(fresh);
        }
      } catch {
        /* keep last known state */
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [initial.id, onUpdate]);

  const cancelled = order.status === 'cancelled';
  const steps = STEPS.filter((s) => s !== 'out_for_delivery' || order.order_type === 'delivery');
  const currentIdx = steps.indexOf(order.status);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
      <div className="mx-auto flex min-h-full max-w-md flex-col px-6 py-10">
        <div className="flex flex-col items-center text-center">
          {cancelled ? (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-50">
              <XCircle size={44} className="text-red-500" />
            </div>
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50">
              <CheckCircle2 size={44} className="text-brand-500" />
            </div>
          )}
          <h2 className="mt-5 font-display text-2xl font-bold text-zinc-900">
            {cancelled ? t('shop.order_cancelled') : t('shop.order_placed')}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {cancelled
              ? t('shop.order_cancelled_desc')
              : t('shop.order_processing', { id: orderNumber(order.id) })}
          </p>
        </div>

        {!cancelled && (
          <>
            <div className="mt-8 rounded-2xl bg-brand-50 p-4 text-center text-sm font-medium text-brand-800">
              {ORDER_STATUS_HINT[order.status]}
            </div>

            {isPushSupported() && pushState === 'idle' && (
              <button
                onClick={async () => {
                  const ok = await subscribeToPush(order.id);
                  if (ok) {
                    localStorage.setItem(pushKey(order.id), '1');
                    setPushState('subscribed');
                  } else if (Notification.permission === 'denied') {
                    setPushState('denied');
                  }
                }}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-200 py-3 text-sm font-bold text-brand-700 transition hover:bg-brand-50 active:scale-[0.98]"
              >
                <BellRing size={16} /> {t('shop.enable_push')}
              </button>
            )}
            {isPushSupported() && pushState === 'denied' && (
              <p className="mt-3 rounded-2xl bg-zinc-50 px-4 py-3 text-center text-xs font-medium text-zinc-500">
                {t('shop.push_blocked')}
              </p>
            )}

            <div className="mt-8 flex-1">
              {steps.map((s, i) => {
                const done = i <= currentIdx;
                const isLast = i === steps.length - 1;
                return (
                  <div key={s} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                          done ? 'bg-brand-500 text-white' : 'bg-zinc-100 text-zinc-400'
                        } ${i === currentIdx ? 'ring-4 ring-brand-100' : ''}`}
                      >
                        {i + 1}
                      </div>
                      {!isLast && <div className={`w-0.5 flex-1 ${done && i < currentIdx ? 'bg-brand-400' : 'bg-zinc-100'}`} style={{ minHeight: 28 }} />}
                    </div>
                    <div className="pb-6 pt-1">
                      <p className={`text-sm font-semibold ${done ? 'text-zinc-900' : 'text-zinc-400'}`}>
                        {ORDER_STATUS_LABEL[s]}
                      </p>
                      {i === currentIdx && (
                        <p className="text-xs font-medium text-brand-600">{t('shop.current_step_live')}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <button
          onClick={() => printInvoice(order)}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-full border-2 border-zinc-200 py-3.5 font-display text-[15px] font-bold text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98]"
        >
          <Printer size={17} /> {t('shop.print_receipt')}
        </button>
        <button
          onClick={onClose}
          className="mt-3 w-full rounded-full bg-zinc-900 py-3.5 font-display text-[15px] font-bold text-white transition hover:bg-zinc-800 active:scale-[0.98]"
        >
          {t('shop.back_to_menu')}
        </button>
      </div>
    </div>
  );
}
