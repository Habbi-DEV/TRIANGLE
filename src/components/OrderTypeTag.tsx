import { UtensilsCrossed, ShoppingBag, Bike } from 'lucide-react';
import type { Order, OrderType } from '../lib/types';
import { useLang, getCurrentLang } from '../lib/i18n';

const META: Record<OrderType, { key: string; cls: string; Icon: typeof Bike }> = {
  dine_in: { key: 'orderType.dine_in', cls: 'bg-brand-500 text-white', Icon: UtensilsCrossed },
  takeaway: { key: 'orderType.takeaway', cls: 'bg-amber-400 text-amber-950', Icon: ShoppingBag },
  delivery: { key: 'orderType.delivery', cls: 'bg-sky-500 text-white', Icon: Bike },
};

export function OrderTypeTag({ type }: { type: OrderType }) {
  const { t } = useLang();
  const m = META[type];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${m.cls}`}>
      <m.Icon size={11} strokeWidth={2.5} />
      {t(m.key)}
    </span>
  );
}

const CONTEXT_STRINGS = {
  fr: { table: 'Table', delivery_customer: 'Client livraison', counter_pickup: 'Retrait au comptoir' },
  ar: { table: 'طاولة', delivery_customer: 'زبون التوصيل', counter_pickup: 'استلام من الكاونتر' },
} as const;

/** One-line context under the type tag: table, or customer + address. Not a
 *  hook (called from plain render helpers/loops), so it reads the current
 *  language directly rather than via useLang(). */
export function orderContext(o: Order): string {
  const L = CONTEXT_STRINGS[getCurrentLang()];
  if (o.order_type === 'dine_in') return `${L.table} ${o.table_number}`;
  if (o.order_type === 'delivery') return o.customer_name || L.delivery_customer;
  return L.counter_pickup;
}
