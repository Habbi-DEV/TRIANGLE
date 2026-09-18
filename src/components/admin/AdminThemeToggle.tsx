import { AnimatePresence, motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useLang } from '../../lib/i18n';

/** Standalone dark-mode button for the admin shell (sidebar + mobile top
 *  bar). Deliberately NOT the customer-facing pill switch (ThemeToggle):
 *  the admin sidebar and mobile header are zinc-950 in *both* themes, so a
 *  light-surfaced pill would sit on them as a bright rectangle. This is a
 *  single self-contained round icon button sized like the other header
 *  actions (h-9 w-9, shrink-0), so it lines up with them instead of
 *  overlapping or squeezing the brand block on small screens.
 *
 *  It drives the same global ThemeProvider as everywhere else, so the
 *  choice persists (localStorage) and applies to the whole app. */
export default function AdminThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const { t } = useLang();
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={toggle}
      title={t('theme.toggle')}
      aria-label={t('theme.toggle')}
      className={`relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:border-brand-500/40 hover:bg-white/10 hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 active:scale-95 ${className}`}
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={dark ? 'moon' : 'sun'}
          initial={{ y: 9, opacity: 0, rotate: -40 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -9, opacity: 0, rotate: 40 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="flex items-center justify-center"
        >
          {dark ? <Moon size={16} className="text-brand-400" /> : <Sun size={16} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
