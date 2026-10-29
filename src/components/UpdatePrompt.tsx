import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useLang } from '../lib/i18n';

/** How often an open app asks the server "is there a new build?". Browsers
 *  only check on navigation, and an installed PWA can stay open for days. */
const CHECK_EVERY_MS = 30 * 60 * 1000;
/** "Plus tard" hides the banner for this long, then it comes back. */
const SNOOZE_MS = 24 * 60 * 60 * 1000;
const SNOOZE_KEY = 'triangle_update_snoozed_at';

function snoozedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(SNOOZE_KEY));
    return at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/**
 * "Nouvelle version disponible" banner.
 *
 * Every Vercel deploy produces a new service worker; the browser downloads it
 * in the background and parks it as "waiting". This banner appears when that
 * happens and, on tap, activates it and reloads. It never forces an update —
 * the cart lives in localStorage so nothing is lost, but a customer in the
 * middle of an order should choose the moment.
 */
export default function UpdatePrompt() {
  const { t } = useLang();
  const [snoozed, setSnoozed] = useState(snoozedRecently);
  const [updating, setUpdating] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {});
      };
      setInterval(check, CHECK_EVERY_MS);
      // Coming back to the app from the background (the usual way a PWA is
      // "reopened") is the most useful moment to look for a new build.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });

  // A new build arrived after the user had snoozed an older one: the snooze
  // was for that one, so show this one.
  useEffect(() => {
    if (needRefresh) setSnoozed(snoozedRecently());
  }, [needRefresh]);

  const show = needRefresh && !snoozed;

  const update = async () => {
    setUpdating(true);
    try {
      await updateServiceWorker(true); // activates the new SW, then reloads
    } finally {
      // Safety net: if the reload didn't happen (SW stuck), force it.
      setTimeout(() => window.location.reload(), 4000);
    }
  };

  const later = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    } catch {
      /* private mode — the banner just reappears next time */
    }
    setSnoozed(true);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: 'spring', damping: 24, stiffness: 260 }}
          className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+8px)] z-[200] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-orange-500/40 bg-white/95 p-3 shadow-soft-xl backdrop-blur-xl dark:bg-zinc-950/95 dark:shadow-ember"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-grad text-white shadow-[0_0_16px_rgba(var(--brand-glow-rgb),0.5)]">
            <RefreshCw size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold leading-tight text-zinc-900 dark:text-zinc-100">{t('update.title')}</p>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{t('update.desc')}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <button
              type="button"
              onClick={update}
              disabled={updating}
              className="flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-b from-brand-400 to-brand-grad px-3.5 py-1.5 text-[12px] font-bold text-white shadow-[0_4px_14px_-3px_rgba(var(--brand-glow-rgb),0.7)] transition active:scale-95 disabled:opacity-80"
            >
              {updating && <Loader2 size={12} className="animate-spin" />}
              {t(updating ? 'update.updating' : 'update.action')}
            </button>
            {!updating && (
              <button type="button" onClick={later} className="rounded-full px-3 py-0.5 text-[11px] font-semibold text-zinc-400 transition hover:text-zinc-600 dark:hover:text-zinc-300">
                {t('update.later')}
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
