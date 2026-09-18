import useDriverOnlineStatus from '../../hooks/useDriverOnlineStatus';
import { useLang } from '../../lib/i18n';

/**
 * Availability switch controlling whether this driver currently receives
 * new delivery orders (see useDriverOnlineStatus + migration_v15).
 * Confirms before switching off, since going offline silently while an
 * order was about to be broadcast could be surprising.
 *
 * Mobile-first layout: this used to be a small text pill squeezed into the
 * header's action row next to the language switch, the dark-mode button
 * and logout — four controls plus the restaurant name on a 360px screen,
 * so "Hors ligne" (and the longer Arabic "غير متصل") ran out of room and
 * collided with its neighbours. It now owns a full-width row of its own
 * under the brand: the label can never outgrow the badge, the tap target
 * is a comfortable 44px, and the state is readable at a glance while
 * riding — which matters more here than saving a few pixels of header.
 */
export default function OnlineToggle() {
  const { t } = useLang();
  const { isOnline, loading, busy, setOnline } = useDriverOnlineStatus();

  // Reserve the row's height while loading instead of returning null, so
  // the header doesn't visibly jump once the status resolves.
  if (loading) {
    return <div className="h-11 w-full animate-pulse rounded-xl bg-zinc-800/60" aria-hidden />;
  }

  const toggle = () => {
    if (isOnline && !window.confirm(t('driver.going_offline_confirm'))) return;
    setOnline(!isOnline);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      role="switch"
      aria-checked={isOnline}
      className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-start transition active:scale-[0.99] disabled:opacity-60 ${
        isOnline
          ? 'bg-emerald-500/15 ring-1 ring-emerald-500/40'
          : 'bg-zinc-800/80 ring-1 ring-zinc-700'
      }`}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
          {isOnline && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />}
          <span className={`relative h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
        </span>
        {/* truncate + min-w-0: however long the translated label is, it
            shortens inside the badge instead of pushing past its edge. */}
        <span className={`min-w-0 truncate text-[13px] font-bold ${isOnline ? 'text-emerald-400' : 'text-zinc-400'}`}>
          {isOnline ? t('driver.online') : t('driver.offline')}
        </span>
      </span>

      {/* Track/thumb: makes it obvious this is a switch, not a status label */}
      <span
        className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          isOnline ? 'bg-emerald-500/70' : 'bg-zinc-600'
        }`}
        aria-hidden
      >
        {/* marginInlineStart (not translateX) so the thumb slides toward
            the correct side when the app is in RTL/Arabic. */}
        <span
          className="h-5 w-5 rounded-full bg-white shadow transition-[margin] duration-200"
          style={{ marginInlineStart: isOnline ? 'calc(100% - 1.25rem)' : 0 }}
        />
      </span>
    </button>
  );
}
