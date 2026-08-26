import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Bike, ChevronRight, Minus, Plus, ShoppingBag, Trash2, UtensilsCrossed } from 'lucide-react';
import { useCartStore, selectSubtotal } from '../../stores/cartStore';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { useSettings } from '../../lib/settings';
import { useLang } from '../../lib/i18n';
import type { Order, OrderType, RestaurantTable } from '../../lib/types';

const TYPE_OPTIONS: { value: OrderType; labelKey: string; hintKey: string; Icon: typeof Bike }[] = [
  { value: 'dine_in', labelKey: 'orderType.dine_in', hintKey: 'orderType.dine_in.hint', Icon: UtensilsCrossed },
  { value: 'takeaway', labelKey: 'orderType.takeaway', hintKey: 'orderType.takeaway.hint', Icon: ShoppingBag },
  { value: 'delivery', labelKey: 'orderType.delivery', hintKey: 'orderType.delivery.hint', Icon: Bike },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onPlaced: (order: Order) => void;
}

export default function CartSheet({ open, onClose, onPlaced }: Props) {
  const { t } = useLang();
  const { lines, inc, dec, remove, clear } = useCartStore();
  const subtotal = useCartStore(selectSubtotal);
  const settings = useSettings();

  const [step, setStep] = useState<'cart' | 'checkout'>('cart');
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Delivery fee only applies once the customer has picked "Delivery" —
  // dine-in/takeaway totals are unaffected by settings.delivery_fee.
  const deliveryFee = orderType === 'delivery' ? Number(settings?.delivery_fee ?? 0) : 0;
  const total = Math.round((subtotal + deliveryFee) * 100) / 100;
  const [placing, setPlacing] = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    if (open) {
      fetch('/api/tables')
        .then((r) => r.json())
        .then((d: RestaurantTable[]) => setTables(Array.isArray(d) ? d : []))
        .catch(() => setTables([]));
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setStep('cart');
      setErrors({});
      setServerError('');
    }
  }, [open]);

  const availableTables = useMemo(
    () => tables.filter((t) => t.status === 'available' || t.table_number === tableNumber),
    [tables, tableNumber],
  );

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (orderType === 'dine_in' && !tableNumber) e.table = t('cart.error_table');
    if (orderType === 'delivery') {
      if (!name.trim()) e.name = t('cart.error_name');
      if (phone.trim().replace(/\D/g, '').length < 6) e.phone = t('cart.error_phone');
      if (!address.trim()) e.address = t('cart.error_address');
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const placeOrder = async () => {
    if (!validate()) return;
    // Asked here (not on page load) so it's tied to a real click and to a
    // moment that actually explains why: they're placing an order we could
    // notify them about. Fire-and-forget — doesn't block submission, and a
    // "default" (undecided) check means we never re-prompt after a Block.
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    setPlacing(true);
    setServerError('');
    try {
      const order = await api<Order>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          order_type: orderType,
          table_number: orderType === 'dine_in' ? tableNumber : undefined,
          customer_name: orderType === 'delivery' ? name : undefined,
          customer_phone: orderType === 'delivery' ? phone : undefined,
          delivery_address: orderType === 'delivery' ? address : undefined,
          notes: notes || undefined,
          // Algeria: cash only — the API forces this server-side too.
          payment_method: 'cash',
          items: lines.map((l) => ({
            product_id: l.product.id,
            quantity: l.qty,
            sauce_ids: l.sauces.map((s) => s.id),
            supplement_ids: l.supplements.map((s) => s.id),
          })),
        }),
      });
      clear();
      onClose();
      onPlaced(order);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t('cart.error_generic'));
    } finally {
      setPlacing(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-end justify-center bg-zinc-950/50 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 350 }}
          >
            {/* header */}
            <div className="flex items-center gap-3 border-b border-zinc-100 px-5 py-4">
              {step === 'checkout' && (
                <button onClick={() => setStep('cart')} className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100" aria-label={t('common.back')}>
                  <ArrowLeft size={18} className="rtl:rotate-180" />
                </button>
              )}
              <h2 className="font-display text-lg font-bold text-zinc-900">
                {step === 'cart' ? t('cart.title') : t('cart.checkout')}
              </h2>
              <span className="ms-auto text-sm font-semibold text-zinc-400">{lines.length} {lines.length === 1 ? t('cart.items') : t('cart.items_plural')}</span>
            </div>

            <div className="flex-1 overflow-y-auto thin-scroll px-5 py-4">
              {lines.length === 0 ? (
                <p className="py-10 text-center text-sm text-zinc-400">{t('cart.empty')}</p>
              ) : step === 'cart' ? (
                <ul className="space-y-3">
                  {lines.map((l) => {
                    const unitPrice = l.product.price
                      + l.sauces.reduce((n, s) => n + s.price, 0)
                      + l.supplements.reduce((n, s) => n + s.price, 0);
                    const addOnNames = [...l.sauces, ...l.supplements].map((s) => s.name);
                    return (
                      <li key={l.key} className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-2.5">
                        <img src={l.product.image_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-zinc-900">{l.product.name}</p>
                          {addOnNames.length > 0 && (
                            <p className="truncate text-[11px] text-zinc-400">+ {addOnNames.join(', ')}</p>
                          )}
                          <p className="text-sm font-bold text-burnt">{money(unitPrice * l.qty)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => dec(l.key)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm" aria-label={t('cart.decrease')}><Minus size={13} /></button>
                          <span className="w-5 text-center text-sm font-bold">{l.qty}</span>
                          <button onClick={() => inc(l.key)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm" aria-label={t('cart.increase')}><Plus size={13} /></button>
                          <button onClick={() => remove(l.key)} className="ms-1 text-zinc-300 hover:text-red-500" aria-label={t('cart.remove')}><Trash2 size={16} /></button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="space-y-5">
                  {/* order type */}
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">{t('cart.how_order')}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {TYPE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setOrderType(opt.value)}
                          className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 text-center transition ${
                            orderType === opt.value
                              ? 'border-brand-500 bg-brand-50 text-brand-700'
                              : 'border-zinc-100 bg-white text-zinc-500 hover:border-zinc-200'
                          }`}
                        >
                          <opt.Icon size={20} />
                          <span className="text-xs font-bold">{t(opt.labelKey)}</span>
                          <span className="text-[10px] leading-tight opacity-70">{t(opt.hintKey)}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* dine-in: table picker */}
                  {orderType === 'dine_in' && (
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">{t('cart.table_number')}</p>
                      <div className="grid grid-cols-6 gap-2">
                        {availableTables.map((tbl) => (
                          <button
                            key={tbl.id}
                            onClick={() => setTableNumber(tbl.table_number)}
                            className={`rounded-xl py-2.5 text-sm font-bold transition ${
                              tableNumber === tbl.table_number
                                ? 'bg-brand-500 text-white shadow-md shadow-orange-500/30'
                                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                            }`}
                          >
                            {tbl.table_number}
                          </button>
                        ))}
                      </div>
                      {errors.table && <p className="mt-1.5 text-xs font-medium text-red-500">{errors.table}</p>}
                    </div>
                  )}

                  {/* delivery: customer details */}
                  {orderType === 'delivery' && (
                    <div className="space-y-3">
                      <div>
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('cart.full_name')} className={`w-full rounded-xl border px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-200 ${errors.name ? 'border-red-300' : 'border-zinc-200'}`} />
                        {errors.name && <p className="mt-1 text-xs font-medium text-red-500">{errors.name}</p>}
                      </div>
                      <div>
                        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('cart.phone')} type="tel" className={`w-full rounded-xl border px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-200 ${errors.phone ? 'border-red-300' : 'border-zinc-200'}`} />
                        {errors.phone && <p className="mt-1 text-xs font-medium text-red-500">{errors.phone}</p>}
                      </div>
                      <div>
                        <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('cart.delivery_address')} rows={2} className={`w-full resize-none rounded-xl border px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-200 ${errors.address ? 'border-red-300' : 'border-zinc-200'}`} />
                        {errors.address && <p className="mt-1 text-xs font-medium text-red-500">{errors.address}</p>}
                      </div>
                    </div>
                  )}

                  {/* notes */}
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">{t('cart.kitchen_notes')}</p>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t('cart.kitchen_notes.placeholder')} className="w-full resize-none rounded-xl border border-zinc-200 px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-200" />
                  </div>

                  {/* payment — Algeria: cash only, shown as a fixed, non-interactive
                      indicator rather than a choice since there's nothing to pick. */}
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">{t('cart.payment')}</p>
                    <div className="flex items-center gap-2 rounded-xl border-2 border-brand-500 bg-brand-50 px-3.5 py-2.5 text-sm font-bold text-brand-700">
                      💶 {t('payment.cash')}
                    </div>
                  </div>

                  {/* totals */}
                  <div className="space-y-1.5 rounded-2xl bg-zinc-50 p-4 text-sm">
                    <div className="flex justify-between text-zinc-500"><span>{t('common.subtotal')}</span><span>{money(subtotal)}</span></div>
                    {deliveryFee > 0 && (
                      <div className="flex justify-between text-zinc-500"><span>{t('common.delivery_fee')}</span><span>{money(deliveryFee)}</span></div>
                    )}
                    <div className="flex justify-between border-t border-zinc-200 pt-2 font-display text-base font-bold text-zinc-900"><span>{t('common.total')}</span><span className="text-burnt">{money(total)}</span></div>
                  </div>

                  {serverError && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{serverError}</p>}
                </div>
              )}
            </div>

            {/* footer */}
            {lines.length > 0 && (
              <div className="border-t border-zinc-100 p-4 pb-6">
                {step === 'cart' ? (
                  <button
                    onClick={() => setStep('checkout')}
                    className="flex w-full items-center justify-center gap-1 rounded-full bg-brand-500 py-3.5 font-display text-[15px] font-bold text-white shadow-lg shadow-orange-500/30 transition hover:bg-brand-600 active:scale-[0.98]"
                  >
                    {t('cart.checkout_cta')} · {money(total)} <ChevronRight size={18} className="rtl:rotate-180" />
                  </button>
                ) : (
                  <button
                    onClick={placeOrder}
                    disabled={placing}
                    className="w-full rounded-full bg-brand-500 py-3.5 font-display text-[15px] font-bold text-white shadow-lg shadow-orange-500/30 transition hover:bg-brand-600 active:scale-[0.98] disabled:opacity-60"
                  >
                    {placing ? t('cart.placing_order') : `${t('cart.place_order')} · ${money(total)}`}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
