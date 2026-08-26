import { useEffect, useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import type { Order, RestaurantTable, TableStatus } from '../../lib/types';
import { api } from '../../lib/api';
import { orderNumber } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import { ACTIVE_STATUSES } from '../../lib/types';

const STATUS_META: Record<TableStatus, { key: string; cls: string }> = {
  available: { key: 'tables.available', cls: 'bg-sky-50 text-sky-600 ring-sky-200' },
  occupied: { key: 'tables.occupied', cls: 'bg-brand-50 text-brand-700 ring-brand-200' },
  reserved: { key: 'tables.reserved', cls: 'bg-indigo-50 text-indigo-600 ring-indigo-200' },
  cleaning: { key: 'tables.cleaning', cls: 'bg-zinc-100 text-zinc-500 ring-zinc-200' },
};

export default function TablesPage() {
  const { t } = useLang();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ table_number: '', seats: '2' });
  const [error, setError] = useState('');

  const load = () => {
    Promise.all([
      fetch('/api/tables').then((r) => r.json()),
      fetch('/api/orders?limit=80').then((r) => r.json()),
    ])
      .then(([tbls, o]) => {
        setTables(Array.isArray(tbls) ? tbls : []);
        setOrders(Array.isArray(o) ? o : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const activeOrderFor = (tableNumber: number) =>
    orders.find((o) => o.table_number === tableNumber && ACTIVE_STATUSES.includes(o.status) && o.order_type === 'dine_in');

  const setStatus = async (tbl: RestaurantTable, status: TableStatus) => {
    await api('/api/tables', { method: 'PUT', body: JSON.stringify({ id: tbl.id, status }) }).catch(console.error);
    load();
  };

  const addTable = async () => {
    const n = Number(form.table_number);
    if (!n || n <= 0) {
      setError(t('tables.error_invalid_number'));
      return;
    }
    if (tables.some((tbl) => tbl.table_number === n)) {
      setError(t('tables.error_exists', { n }));
      return;
    }
    try {
      await api('/api/tables', { method: 'POST', body: JSON.stringify({ table_number: n, seats: Number(form.seats) || 2 }) });
      setModalOpen(false);
      setForm({ table_number: '', seats: '2' });
      setError('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tables.error_add_failed'));
    }
  };

  const removeTable = async (tbl: RestaurantTable) => {
    if (!confirm(t('tables.remove_confirm', { n: tbl.table_number }))) return;
    await api('/api/tables', { method: 'DELETE', body: JSON.stringify({ id: tbl.id }) }).catch(console.error);
    load();
  };

  if (loading) return <Spinner label={t('tables.loading')} />;

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-zinc-900">{t('tables.title')}</h1>
          <p className="text-sm text-zinc-500">
            {tables.filter((tbl) => tbl.status === 'available').length} {t('tables.available')} ·{' '}
            {tables.filter((tbl) => tbl.status === 'occupied').length} {t('tables.occupied')} ·{' '}
            {tables.filter((tbl) => tbl.status === 'reserved').length} {t('tables.reserved')} ·{' '}
            {tables.filter((tbl) => tbl.status === 'cleaning').length} {t('tables.cleaning')}
          </p>
        </div>
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-500/30 hover:bg-brand-600">
          <Plus size={16} /> {t('tables.add_table')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {tables.map((tbl) => {
          const meta = STATUS_META[tbl.status];
          const active = activeOrderFor(tbl.table_number);
          return (
            <div key={tbl.id} className={`rounded-2xl bg-white p-4 shadow-sm ring-1 transition ${tbl.status === 'occupied' ? 'ring-brand-200' : 'ring-zinc-100'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display text-2xl font-extrabold text-zinc-900">T{tbl.table_number}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-400"><Users size={11} /> {tbl.seats} {t('tables.seats')}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${meta.cls}`}>{t(meta.key)}</span>
              </div>

              {active && (
                <p className="mt-2 rounded-lg bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700">
                  {t('tables.order_open', { id: orderNumber(active.id) })}
                </p>
              )}

              <div className="mt-3 flex gap-1.5">
                {(['available', 'occupied', 'reserved', 'cleaning'] as TableStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(tbl, s)}
                    className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold transition ${tbl.status === s ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}
                  >
                    {t(STATUS_META[s].key)}
                  </button>
                ))}
                <button onClick={() => removeTable(tbl)} className="rounded-lg bg-zinc-100 px-2 text-zinc-400 hover:bg-red-50 hover:text-red-500" aria-label={t('tables.delete_table')}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('tables.add_table')}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">{t('tables.table_number')}</label>
              <input value={form.table_number} onChange={(e) => setForm({ ...form, table_number: e.target.value })} type="number" min="1" className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">{t('tables.seats_label')}</label>
              <input value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} type="number" min="1" className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400" />
            </div>
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>}
          <button onClick={addTable} className="w-full rounded-xl bg-brand-500 py-3 font-display text-sm font-bold text-white shadow-lg shadow-orange-500/30 hover:bg-brand-600">
            {t('tables.add_table')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
