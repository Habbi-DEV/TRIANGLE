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
    Promise.all([
      fetch('/api/products').then((r) => r.json()),
      fetch('/api/inventory').then((r) => r.json()),
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
    <div className="p-4 md:p-6">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-zinc-900">{t('inventory.title')}</h1>
        <p className="text-sm text-zinc-500">{t('inventory.subtitle')}</p>
      </div>

      {/* summary */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Package size={17} /></div>
          <div>
            <p className="font-display text-lg font-bold leading-none">{products.length}</p>
            <p className="mt-0.5 text-[11px] text-zinc-400">{t('inventory.products_tracked')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><AlertTriangle size={17} /></div>
          <div>
            <p className="font-display text-lg font-bold leading-none">{lowStock.length}</p>
            <p className="mt-0.5 text-[11px] text-zinc-400">{t('inventory.low_stock')}</p>
          </div>
        </div>
        <div className="col-span-2 flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100 md:col-span-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><ArrowUpRight size={17} /></div>
          <div>
            <p className="font-display text-lg font-bold leading-none">{logs.filter((l) => l.reason === 'restock' && l.change > 0).length}</p>
            <p className="mt-0.5 text-[11px] text-zinc-400">{t('inventory.restocks_logged')}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        {/* stock levels */}
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 xl:col-span-3">
          <h2 className="border-b border-zinc-100 px-5 py-4 font-display text-sm font-bold text-zinc-900">{t('inventory.stock_levels')}</h2>
          <ul className="thin-scroll max-h-[560px] divide-y divide-zinc-50 overflow-y-auto">
            {products.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                <img src={p.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-zinc-900">{p.name}</p>
                    {p.stock <= 8 && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">{t('inventory.low')}</span>}
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className={`h-full rounded-full ${p.stock <= 8 ? 'bg-amber-400' : 'bg-brand-500'}`}
                      style={{ width: `${Math.max(4, (p.stock / maxStock) * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="w-12 text-end font-display text-sm font-bold text-zinc-900">{p.stock}</span>
                <button onClick={() => openModal(p)} className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-600 hover:bg-brand-50 hover:text-brand-700">
                  {t('inventory.adjust')}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* movement history */}
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 xl:col-span-2">
          <h2 className="border-b border-zinc-100 px-5 py-4 font-display text-sm font-bold text-zinc-900">{t('inventory.movement_history')}</h2>
          <ul className="thin-scroll max-h-[560px] divide-y divide-zinc-50 overflow-y-auto">
            {logs.length === 0 && <li className="px-5 py-8 text-center text-xs text-zinc-400">{t('inventory.no_movements')}</li>}
            {logs.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-5 py-2.5">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${l.change >= 0 ? 'bg-brand-50 text-brand-600' : 'bg-red-50 text-red-500'}`}>
                  {l.change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-zinc-800">{productName(l.product_id)}</p>
                  <p className="truncate text-[10px] text-zinc-400">{l.reason}{l.notes ? ` · ${l.notes}` : ''}</p>
                </div>
                <span className={`text-xs font-bold ${l.change >= 0 ? 'text-brand-600' : 'text-red-500'}`}>
                  {l.change >= 0 ? '+' : ''}{l.change}
                </span>
                <span className="w-14 text-end text-[10px] text-zinc-300">{timeAgo(l.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* adjust modal */}
      <Modal open={!!target} onClose={() => setTarget(null)} title={`${t('inventory.adjust_stock')} ${target?.name ?? ''}`}>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setReason(r.value)}
                className={`rounded-xl border-2 py-2 text-xs font-bold transition ${reason === r.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-zinc-100 text-zinc-500'}`}
              >
                {t(r.labelKey)}
              </button>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">{t('inventory.quantity')}</label>
            <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min="1" className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">{t('inventory.notes')}</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('inventory.notes.placeholder')} className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400" />
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>}
          <button onClick={submit} disabled={saving} className="w-full rounded-xl bg-brand-500 py-3 font-display text-sm font-bold text-white shadow-lg shadow-orange-500/30 hover:bg-brand-600 disabled:opacity-60">
            {saving ? t('inventory.logging') : t('inventory.log_movement')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
