import { useEffect, useMemo, useState } from 'react';
import { MapPin, Phone, Printer, Trash2, Users } from 'lucide-react';
import useLiveOrders from '../../hooks/useLiveOrders';
import StatusBadge from '../../components/StatusBadge';
import { OrderTypeTag } from '../../components/OrderTypeTag';
import Spinner from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { money, orderNumber, timeAgo } from '../../lib/format';
import { printInvoice } from '../../lib/invoice';
import { useLang } from '../../lib/i18n';
import { DELIVERY_STATUS_LABEL } from '../../lib/driverStatus';
import type { Order, OrderStatus, OrderType } from '../../lib/types';

const STATUS_FILTERS: { value: OrderStatus | 'all'; labelKey: string }[] = [
  { value: 'all', labelKey: 'orders.all' },
  { value: 'pending', labelKey: 'status.pending' },
  { value: 'confirmed', labelKey: 'status.confirmed' },
  { value: 'preparing', labelKey: 'status.preparing' },
  { value: 'ready', labelKey: 'status.ready' },
  { value: 'out_for_delivery', labelKey: 'orderType.delivery' },
  { value: 'completed', labelKey: 'status.completed' },
  { value: 'cancelled', labelKey: 'status.cancelled' },
];

const TYPE_FILTERS: { value: OrderType | 'all'; labelKey: string; emoji: string }[] = [
  { value: 'all', labelKey: 'orders.all_types', emoji: '' },
  { value: 'dine_in', labelKey: 'orderType.dine_in', emoji: '🍽️' },
  { value: 'takeaway', labelKey: 'orderType.takeaway', emoji: '🥡' },
  { value: 'delivery', labelKey: 'orderType.delivery', emoji: '🛵' },
];

function nextAction(o: Order): { to: OrderStatus; labelKey: string } | null {
  switch (o.status) {
    case 'pending': return { to: 'confirmed', labelKey: 'orders.action.confirm' };
    case 'confirmed': return { to: 'preparing', labelKey: 'orders.action.start_prep' };
    case 'preparing': return { to: 'ready', labelKey: 'orders.action.mark_ready' };
    case 'ready':
      // Delivery orders are handed off to the Driver Dashboard the moment
      // they're marked "ready" — a driver self-assigns via /driver, then
      // drives the rest of the lifecycle (picked_up -> out_for_delivery,
      // delivered -> completed; see api/driver-orders.js). There is
      // deliberately NO manual "send to driver" action here anymore: it
      // used to flip status straight to out_for_delivery, which skipped
      // driver assignment entirely and made the order invisible to the
      // Driver Dashboard's "available" list (that list only shows
      // status === 'ready') — orders dispatched that way never got a
      // driver_id and silently got stuck. Kitchen/cashier just mark it
      // ready; the driver flow takes it from there.
      return o.order_type === 'delivery' ? null : { to: 'completed', labelKey: 'orders.action.complete' };
    case 'out_for_delivery': return { to: 'completed', labelKey: 'orders.action.delivered' };
    default: return null;
  }
}

export default function OrdersPage() {
  const { t } = useLang();
  const { orders, loading, refresh } = useLiveOrders(120, 4000);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<OrderType | 'all'>('all');
  const [busyId, setBusyId] = useState<number | null>(null);

  const filtered = useMemo(
    () => orders.filter((o) =>
      (statusFilter === 'all' || o.status === statusFilter) &&
      (typeFilter === 'all' || o.order_type === typeFilter),
    ),
    [orders, statusFilter, typeFilter],
  );

  // Real per-status totals from the DB, not a count over the capped
  // 120-row fetch above — otherwise "All" / "Pending" etc. silently
  // plateau at whatever the fetch limit is once order volume passes it.
  const [counts, setCounts] = useState<Record<string, number>>({ all: 0 });
  useEffect(() => {
    const loadCounts = () => fetch('/api/orders?counts=1').then((r) => r.json()).then(setCounts).catch(console.error);
    loadCounts();
    const iv = setInterval(loadCounts, 4000);
    return () => clearInterval(iv);
  }, []);

  const setStatus = async (id: number, status: OrderStatus) => {
    setBusyId(id);
    try {
      await api(`/api/orders`, { method: 'PUT', body: JSON.stringify({ id, status }) });
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('orders.update_failed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-zinc-900">{t('orders.title')}</h1>
          <p className="text-sm text-zinc-500">{t('orders.subtitle')}</p>
        </div>
        <div className="flex gap-1.5">
          {TYPE_FILTERS.map((tf) => (
            <button key={tf.value} onClick={() => setTypeFilter(tf.value)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${typeFilter === tf.value ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-500 ring-1 ring-zinc-200'}`}>
              {tf.emoji ? `${tf.emoji} ` : ''}{t(tf.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.value} onClick={() => setStatusFilter(s.value)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${statusFilter === s.value ? 'bg-brand-500 text-white shadow-md shadow-orange-500/30' : 'bg-white text-zinc-500 ring-1 ring-zinc-200 hover:bg-zinc-50'}`}
          >
            {t(s.labelKey)}{counts[s.value] ? ` · ${counts[s.value]}` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner label={t('orders.connecting')} />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-white py-16 text-center text-sm text-zinc-400 ring-1 ring-zinc-100">{t('orders.no_match')}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((o) => {
            const action = nextAction(o);
            const cancellable = ['pending', 'confirmed'].includes(o.status);
            return (
              <div key={o.id} className="flex flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
                <div className="flex items-center gap-2">
                  <span className="font-display text-base font-bold text-zinc-900">{orderNumber(o.id)}</span>
                  <OrderTypeTag type={o.order_type} />
                  <span className="ms-auto text-[11px] text-zinc-400">{timeAgo(o.created_at)}</span>
                </div>

                <div className="mt-2 space-y-1 text-xs text-zinc-500">
                  {o.order_type === 'dine_in' && (
                    <p className="flex items-center gap-1.5 font-semibold text-zinc-700"><Users size={12} /> {t('orders.table')} {o.table_number}</p>
                  )}
                  {o.order_type === 'delivery' && (
                    <>
                      <p className="font-semibold text-zinc-700">{o.customer_name}</p>
                      <p className="flex items-center gap-1.5"><Phone size={11} /> {o.customer_phone}</p>
                      <p className="flex items-center gap-1.5"><MapPin size={11} /> {o.delivery_address}</p>
                    </>
                  )}
                  {o.order_type === 'takeaway' && <p className="font-semibold text-zinc-700">{t('orders.pickup_counter')}</p>}
                </div>

                <div className="mt-3 flex-1 rounded-xl bg-zinc-50 p-2.5 text-xs">
                  {(o.items && o.items.length > 0 ? o.items : []).slice(0, 4).map((it) => (
                    <div key={it.id} className="py-0.5">
                      <p className="flex justify-between text-zinc-600">
                        <span className="truncate">{it.quantity}× {it.product_name}</span>
                        <span className="ms-2 shrink-0 text-zinc-400">{money(it.line_total)}</span>
                      </p>
                      {((it.sauces?.length ?? 0) > 0 || (it.supplements?.length ?? 0) > 0) && (
                        <p className="truncate ps-3 text-[10px] text-zinc-400">
                          + {[...(it.sauces ?? []), ...(it.supplements ?? [])].map((s) => s.name).join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                  {(!o.items || o.items.length === 0) && <p className="text-zinc-400">{t('orders.no_items')}</p>}
                  {(o.items?.length ?? 0) > 4 && <p className="pt-0.5 text-[10px] text-zinc-400">{t('orders.more', { n: o.items!.length - 4 })}</p>}
                </div>

                {o.notes && <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-700">📝 {o.notes}</p>}
                {o.status === 'cancelled' && o.cancel_reason && (
                  <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-[11px] text-red-700">
                    🚫 {t('orders.cancel_reason')} : {o.cancel_reason}
                  </p>
                )}

                <div className="mt-3 flex items-center justify-between border-t border-zinc-50 pt-3">
                  <span className="font-display text-base font-bold text-zinc-900">{money(o.total)}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => printInvoice(o)}
                      title={t('register.print_invoice')}
                      aria-label={t('register.print_invoice')}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-50 hover:text-brand-600"
                    >
                      <Printer size={15} />
                    </button>
                    <StatusBadge status={o.status} />
                  </div>
                </div>

                {/* Driver Dashboard visibility: kitchen/cashier can see at a
                   glance whether a delivery is still waiting for a driver
                   to accept it, or where the assigned driver is in the
                   pickup workflow — without needing the /driver screen. */}
                {o.order_type === 'delivery' && o.status !== 'cancelled' && o.status !== 'completed' && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold">
                    {(!o.delivery_status || o.delivery_status === 'unassigned') ? (
                      o.status === 'ready' ? (
                        <span className="flex items-center gap-1.5 text-amber-600">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                          {t('orders.waiting_for_driver')}
                        </span>
                      ) : null
                    ) : (
                      <span className="text-indigo-600">🛵 {DELIVERY_STATUS_LABEL[o.delivery_status]}</span>
                    )}
                  </p>
                )}

                {(action || cancellable) && (
                  <div className="mt-3 flex gap-2">
                    {action && (
                      <button
                        onClick={() => setStatus(o.id, action.to)}
                        disabled={busyId === o.id}
                        className="flex-1 rounded-xl bg-brand-500 py-2 text-xs font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
                      >
                        {busyId === o.id ? '…' : t(action.labelKey)}
                      </button>
                    )}
                    {cancellable && (
                      <button
                        onClick={() => setStatus(o.id, 'cancelled')}
                        disabled={busyId === o.id}
                        className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-500 transition hover:bg-red-50 disabled:opacity-60"
                      >
                        {t('orders.action.cancel')}
                      </button>
                    )}
                    {o.status === 'cancelled' && (
                      <button
                        onClick={async () => {
                          if (!confirm(t('orders.delete_confirm', { id: orderNumber(o.id) }))) return;
                          await api('/api/orders', { method: 'DELETE', body: JSON.stringify({ id: o.id }) });
                          refresh();
                        }}
                        className="rounded-xl border border-zinc-200 p-2 text-zinc-400 hover:text-red-500"
                        aria-label={t('orders.delete_order')}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
