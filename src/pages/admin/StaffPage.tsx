import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import type { StaffRole } from '../../contexts/AuthContext';
import { useLang } from '../../lib/i18n';
import { timeAgo } from '../../lib/format';
import Spinner from '../../components/ui/Spinner';

type Role = Exclude<StaffRole, null>;

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  created_at: string;
}

const ROLES: Role[] = ['admin', 'cashier', 'kitchen', 'delivery_driver', 'pending'];

export default function StaffPage() {
  const { t } = useLang();
  const { user, role: myRole } = useAuth();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [loading, setLoading] = useState(() => myRole === 'admin');
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (myRole !== 'admin') return;
    api<Profile[]>('/api/staff')
      .then(setProfiles)
      .catch((err) => setError(err instanceof Error ? err.message : t('staff.load_error')))
      .finally(() => setLoading(false));
  }, [myRole]);

  const changeRole = async (id: string, role: Role) => {
    setSavingId(id);
    setError('');
    try {
      const updated = await api<Profile>('/api/staff', { method: 'PUT', body: JSON.stringify({ id, role }) });
      setProfiles((list) => list?.map((p) => (p.id === id ? updated : p)) ?? list);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('staff.update_error'));
    } finally {
      setSavingId(null);
    }
  };

  // Server-side, /api/staff already rejects non-admins (requireAdmin) — this
  // is just so a non-admin who navigates here directly sees a clean message
  // instead of a raw 403 / empty table.
  if (myRole !== 'admin') {
    return (
      <div className="p-4 pb-28 md:p-6">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-zinc-100">
          <p className="text-sm font-semibold text-zinc-500">{t('staff.access_denied')}</p>
        </div>
      </div>
    );
  }

  if (loading) return <Spinner label={t('common.loading')} />;

  return (
    <div className="p-4 pb-28 md:p-6">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-zinc-900">{t('staff.title')}</h1>
        <p className="text-sm text-zinc-500">{t('staff.subtitle')}</p>
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-50 px-3.5 py-2 text-xs font-medium text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100">
        {profiles?.length === 0 && <p className="p-6 text-center text-sm text-zinc-400">{t('staff.empty')}</p>}

        {profiles?.map((p) => {
          const isSelf = p.id === user?.id;
          return (
            <div key={p.id} className="flex items-center gap-3 border-b border-zinc-50 p-4 last:border-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 font-display text-sm font-bold text-white">
                {(p.full_name || p.email)[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-zinc-900">
                  {p.full_name || p.email}
                  {isSelf && <span className="ms-2 text-[10px] font-semibold text-zinc-400">({t('staff.you')})</span>}
                </p>
                <p className="truncate text-xs text-zinc-400">{p.email} · {t('staff.joined')} {timeAgo(p.created_at)}</p>
              </div>
              <select
                value={p.role}
                disabled={isSelf || savingId === p.id}
                onChange={(e) => changeRole(p.id, e.target.value as Role)}
                className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:opacity-50"
              >
                {ROLES.map((r) => <option key={r} value={r}>{t(`staff.role.${r}`)}</option>)}
              </select>
            </div>
          );
        })}
      </div>

      {profiles?.some((p) => p.id === user?.id) && (
        <p className="mt-3 text-[11px] text-zinc-400">{t('staff.self_note')}</p>
      )}
    </div>
  );
}
