import useDriverOnlineStatus from '../../hooks/useDriverOnlineStatus';
import { useLang } from '../../lib/i18n';

/**
 * Header toggle controlling whether this driver currently receives new
 * delivery orders (see useDriverOnlineStatus + migration_v15). Confirms
 * before switching off, since going offline silently while an order was
 * about to be broadcast could be surprising.
 */
export default function OnlineToggle() {
  const { t } = useLang();
  const { isOnline, loading, busy, setOnline } = useDriverOnlineStatus();

  if (loading) return null;

  const toggle = () => {
    if (isOnline && !window.confirm(t('driver.going_offline_confirm'))) return;
    setOnline(!isOnline);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={isOnline}
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold transition disabled:opacity-60 ${
        isOnline
          ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/40'
          : 'bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
      {isOnline ? t('driver.online') : t('driver.offline')}
    </button>
  );
}
