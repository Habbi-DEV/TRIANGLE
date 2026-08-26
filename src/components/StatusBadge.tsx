import type { OrderStatus } from '../lib/types';
import { useLang } from '../lib/i18n';

const MAP: Record<OrderStatus, { key: string; cls: string; dot: string }> = {
  pending: { key: 'status.pending', cls: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  confirmed: { key: 'status.confirmed', cls: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
  preparing: { key: 'status.preparing', cls: 'bg-brand-50 text-brand-700 ring-brand-200', dot: 'bg-brand-500 animate-pulse' },
  ready: { key: 'status.ready', cls: 'bg-brand-100 text-burnt ring-brand-300', dot: 'bg-burnt' },
  out_for_delivery: { key: 'status.out_for_delivery', cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200', dot: 'bg-indigo-500' },
  completed: { key: 'status.completed', cls: 'bg-zinc-100 text-zinc-600 ring-zinc-200', dot: 'bg-zinc-400' },
  cancelled: { key: 'status.cancelled', cls: 'bg-red-50 text-red-600 ring-red-200', dot: 'bg-red-500' },
};

export default function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useLang();
  const s = MAP[status] ?? MAP.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {t(s.key)}
    </span>
  );
}
