import { motion, AnimatePresence } from 'framer-motion';
import { Download, X } from 'lucide-react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { useLang } from '../lib/i18n';

/**
 * Thin, dismissible banner offering to install the PWA to the home screen.
 * Only renders when the browser has actually fired `beforeinstallprompt`
 * (Chrome/Edge/Android) — there's nothing to show on iOS Safari, which has
 * no such event, or once the app is already installed/running standalone.
 * Dismissal is remembered for the tab session only (sessionStorage), so it
 * can resurface on the next visit rather than being gone forever.
 */
export default function InstallBanner() {
  const { canInstall, promptInstall, dismiss } = useInstallPrompt();
  const { t } = useLang();

  return (
    <AnimatePresence>
      {canInstall && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
        >
          <div className="mx-auto flex max-w-md items-center gap-3 border-b border-brand-100 bg-brand-50 px-4 py-2.5 md:max-w-3xl lg:max-w-5xl">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm shadow-orange-500/30">
              <Download size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-zinc-900">{t('pwa.install_title')}</p>
              <p className="truncate text-[11px] text-zinc-500">{t('pwa.install_body')}</p>
            </div>
            <button
              onClick={promptInstall}
              className="shrink-0 rounded-full bg-brand-500 px-3.5 py-1.5 text-[12px] font-bold text-white shadow-sm shadow-orange-500/30 transition active:scale-95"
            >
              {t('pwa.install_cta')}
            </button>
            <button
              onClick={dismiss}
              aria-label={t('pwa.install_dismiss')}
              className="shrink-0 rounded-full p-1.5 text-zinc-400 transition hover:bg-black/5"
            >
              <X size={15} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
