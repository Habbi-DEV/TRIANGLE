import { useState } from 'react';
import { MapPin, Banknote, Loader2, CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';
import { money, orderNumber, timeAgo } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import type { Order } from '../../lib/types';

export default function AvailableOrderCard({ order, onAccepted }: { order: Order; onAccepted: () => void }) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState(false);

  const accept = async () => {
    setBusy(true);
    try {
      await api('/api/driver-orders', { method: 'PUT', body: JSON.stringify({ id: order.id, action: 'accept' }) });
      onAccepted();
    } catch (err) {
      // 409 = someone else already accepted it — just refresh the list
      // instead of showing a scary error for what's a normal race.
      setTaken(true);
      onAccepted();
      console.warn(err instanceof Error ? err.message : err);
    } finally {
      setBusy(false);
    }
  };

  if (taken) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-zinc-100">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-display text-base font-bold text-zinc-900">{orderNumber(order.id)}</p>
          <span className="text-[11px] text-zinc-400">{timeAgo(order.created_at)}</span>
        </div>
        <div className="mt-1 flex items-start gap-1.5 text-sm text-zinc-600">
          <MapPin size={15} className="mt-0.5 shrink-0 text-brand-500" />
          <span className="truncate">{order.delivery_address}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-zinc-800">
          <Banknote size={15} className="text-emerald-600" />
          {money(order.total)}
        </div>
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
    </div>
  );
}
