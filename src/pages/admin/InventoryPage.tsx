import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Package } from 'lucide-react';
import type { InventoryLog, Product } from '../../lib/types';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';

const REASONS = [
  { value: 'restock', labelKey: 'inventory.reason.restock' },
  { value: 'waste', labelKey: 'inventory.reason.waste' },
  { value: 'correction', labelKey: 'inventory.reason.correction' },
] as const;

/** Summary tile. `min-w-0` + `truncate` on the text column is what stops a
 *  long translated label (Arabic labels run noticeably longer than the
 *  French ones) from pushing the tile wider than its grid track and
 *  spilling over the neighbouring card on a phone. */
function SummaryTile({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-100 sm:gap-3 sm:p-4 dark:bg-zinc-900 dark:ring-zinc-800">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">{icon}</div>
      <div className="min-w-0">
        <p className="font-display text-lg font-bold leading-none tabular-nums">{value}</p>
        <p className="mt-1 truncate text-[11px] text-zinc-400 dark:text-zinc-500" title={label}>{label}</p>
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const { t } = useLang();
  const [products, setProducts] = useState<Product[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [target, setTarget] = useState<Product | null>(null);
  const [reason, setReason] = useState<'restock' | 'waste' | 'correction'>('restock');
  const [qty, setQty] = useState('10');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    // /api/inventory is staff-only; products hides stock from anonymous calls.
    // Use api() (Bearer) for both so the staff sees real stock levels.
    Promise.all([
      api<Product[]>('/api/products'),
      api<InventoryLog[]>('/api/inventory'),
    ])
      .then(([p, l]) => {
        setProducts(Array.isArray(p) ? p : []);
        setLogs(Array.isArray(l) ? l : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const productName = useMemo(() => {
    const m = new Map(products.map((p) => [p.id, p.name]));
    return (id: number) => m.get(id) ?? t('inventory.product_fallback', { id });
  }, [products, t]);

  const lowStock = products.filter((p) => p.stock <= 8);
  const maxStock = Math.max(1, ...products.map((p) => p.stock));

  const openModal = (p: Product) => {
    setTarget(p);
    setReason('restock');
    setQty('10');
    setNotes('');
    setError('');
  };

  const submit = async () => {
    if (!target) return;
    const n = parseInt(qty, 10);
    if (!n || n <= 0) {
      setError(t('inventory.error_qty'));
      return;
    }
    const signed = reason === 'waste' ? -n : reason === 'correction' ? -n : n;
    setSaving(true);
    setError('');
    try {
      await api('/api/inventory', {
        method: 'POST',
        body: JSON.stringify({ product_id: target.id, change: signed, reason, notes: notes || undefined }),
      });
      setTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('inventory.error_generic'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner label={t('inventory.loading')} />;

  return (
    // overflow-x-hidden is a safety net: even if a product name or a
    // translated label ends up wider than expected, the admin shell never
    // gets a horizontal scrollbar on mobile.
    <div className="w-full max-w-full overflow-x-hidden p-3 sm:p-4 md:p-6">
      <div className="mb-4 sm:mb-5">
        <h1 className="font-display text-xl font-bold text-zinc-900 sm:text-2xl dark:text-zinc-100">{t('inventory.title')}</h1>
        <p className="text-[13px] text-zinc-500 sm:text-sm dark:text-zinc-400">{t('inventory.subtitle')}</p>
      </div>

      {/* summary */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:mb-5">
        <SummaryTile
          icon={<span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"><Package size={17} /></span>}
          value={products.length}
          label={t('inventory.products_tracked')}
        />
        <SummaryTile
          icon={<span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"><AlertTriangle size={17} /></span>}
          value={lowStock.length}
          label={t('inventory.low_stock')}
        />
        <div className="col-span-2 md:col-span-1">
          <SummaryTile
            icon={<span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"><ArrowUpRight size={17} /></span>}
            value={logs.filter((l) => l.reason === 'restock' && l.change > 0).length}
            label={t('inventory.restocks_logged')}
          />
        </div>
      </div>

      <div className="grid min-w-0 gap-3 sm:gap-4 xl:grid-cols-5">
        {/* stock levels */}
        <div className="min-w-0 rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 xl:col-span-3 dark:bg-zinc-900 dark:ring-zinc-800">
          <h2 className="border-b border-zinc-100 px-4 py-3.5 font-display text-sm font-bold text-zinc-900 sm:px-5 sm:py-4 dark:border-zinc-800 dark:text-zinc-100">{t('inventory.stock_levels')}</h2>
          <ul className="thin-scroll max-h-[60vh] divide-y divide-zinc-100 overflow-y-auto sm:max-h-[560px] dark:divide-zinc-800">
            {products.length === 0 && (
              <li className="px-5 py-8 text-center text-xs text-zinc-400 dark:text-zinc-500">—</li>
            )}
            {products.map((p) => (
              // Two-row layout on phones (name + count on top, progress bar
              // and the Adjust button underneath), collapsing back to the
              // original single row from `sm` up. The old single-row flex
              // had four rigid children — thumbnail, name+bar, count, button
              // — with no wrapping, so below ~400px the count and the button
              // were squeezed on top of each other and over the name.
              <li key={p.id} className="px-3 py-3 sm:px-5">
                <div className="flex items-center gap-3">
                  <img src={p.image_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{p.name}</p>
                    {p.stock <= 8 && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                        {t('inventory.low')}
                      </span>
                    )}
                  </div>

                  {/* desktop: bar sits inline, between name and count */}
                  <div className="hidden h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-zinc-100 sm:block lg:w-44 dark:bg-zinc-800">
                    <div
                      className={`h-full rounded-full ${p.stock <= 8 ? 'bg-amber-400' : 'bg-brand-500'}`}
                      style={{ width: `${Math.max(4, (p.stock / maxStock) * 100)}%` }}
                    />
                  </div>

                  <span className="shrink-0 text-end font-display text-sm font-bold tabular-nums text-zinc-900 sm:w-12 dark:text-zinc-100">{p.stock}</span>

                  <button
                    onClick={() => openModal(p)}
                    className="hidden shrink-0 whitespace-nowrap rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-600 transition hover:bg-brand-50 hover:text-brand-700 sm:block dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-brand-500/15 dark:hover:text-brand-400"
                  >
                    {t('inventory.adjust')}
                  </button>
                </div>

                {/* mobile: bar + full-height tap target on their own row */}
                <div className="mt-2.5 flex items-center gap-3 sm:hidden">
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className={`h-full rounded-full ${p.stock <= 8 ? 'bg-amber-400' : 'bg-brand-500'}`}
                      style={{ width: `${Math.max(4, (p.stock / maxStock) * 100)}%` }}
                    />
                  </div>
                  <button
                    onClick={() => openModal(p)}
                    className="shrink-0 whitespace-nowrap rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-600 transition active:scale-95 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {t('inventory.adjust')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* movement history */}
        <div className="min-w-0 rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 xl:col-span-2 dark:bg-zinc-900 dark:ring-zinc-800">
          <h2 className="border-b border-zinc-100 px-4 py-3.5 font-display text-sm font-bold text-zinc-900 sm:px-5 sm:py-4 dark:border-zinc-800 dark:text-zinc-100">{t('inventory.movement_history')}</h2>
          <ul className="thin-scroll max-h-[60vh] divide-y divide-zinc-100 overflow-y-auto sm:max-h-[560px] dark:divide-zinc-800">
            {logs.length === 0 && <li className="px-5 py-8 text-center text-xs text-zinc-400 dark:text-zinc-500">{t('inventory.no_movements')}</li>}
            {logs.map((l) => (
              <li key={l.id} className="flex items-center gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-5">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${l.change >= 0 ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400' : 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400'}`}>
                  {l.change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-200">{productName(l.product_id)}</p>
                  <p className="truncate text-[10px] text-zinc-400 dark:text-zinc-500">{l.reason}{l.notes ? ` · ${l.notes}` : ''}</p>
                </div>
                {/* Delta and timestamp travel together in one shrink-0
                    column and stack vertically on phones, instead of
                    competing for the same sliver of width as the name. */}
                <div className="flex shrink-0 flex-col items-end leading-tight sm:flex-row sm:items-center sm:gap-3">
                  <span className={`text-xs font-bold tabular-nums ${l.change >= 0 ? 'text-brand-600 dark:text-brand-400' : 'text-red-500 dark:text-red-400'}`}>
                    {l.change >= 0 ? '+' : ''}{l.change}
                  </span>
                  <span className="whitespace-nowrap text-[10px] text-zinc-400 sm:w-14 sm:text-end dark:text-zinc-600">{timeAgo(l.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* adjust modal */}
      <Modal open={!!target} onClose={() => setTarget(null)} title={`${t('inventory.adjust_stock')} ${target?.name ?? ''}`}>
        <div className="space-y-3">
          {/* Reason labels wrap instead of overflowing their pill on a
              narrow phone; the three stay on one row, just taller. */}
          <div className="grid grid-cols-3 gap-2">
            {REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setReason(r.value)}
                className={`rounded-xl border-2 px-1.5 py-2 text-[11px] font-bold leading-tight break-words transition sm:text-xs ${reason === r.value ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400' : 'border-zinc-100 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400'}`}
              >
                {t(r.labelKey)}
              </button>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400 dark:text-zinc-500">{t('inventory.quantity')}</label>
            <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min="1" inputMode="numeric" className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-base outline-none focus:border-brand-400 sm:text-sm dark:border-zinc-700" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400 dark:text-zinc-500">{t('inventory.notes')}</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('inventory.notes.placeholder')} className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-base outline-none focus:border-brand-400 sm:text-sm dark:border-zinc-700" />
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}
          <button onClick={submit} disabled={saving} className="w-full rounded-xl bg-brand-500 py-3 font-display text-sm font-bold text-white shadow-lg shadow-orange-500/30 transition hover:bg-brand-600 active:scale-[0.99] disabled:opacity-60">
            {saving ? t('inventory.logging') : t('inventory.log_movement')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
