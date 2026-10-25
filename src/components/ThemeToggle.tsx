import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useLang } from '../lib/i18n';

/** Pill-shaped animated switch for the header, in the spirit of the
 *  driver-dashboard DarkModeToggle but a spring-animated thumb rather than
 *  a plain icon swap, since this one is customer-facing. */
export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { t } = useLang();
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={toggle}
      aria-label={t('theme.toggle')}
      className="gem gem-sm relative flex h-9 w-14 shrink-0 items-center [--gem-r:18px] rounded-full bg-zinc-100 p-1 transition-colors duration-300 dark:bg-zinc-900"
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-soft-sm dark:bg-zinc-950 dark:shadow-[0_0_10px_rgba(255,106,0,0.35)]"
        style={{ marginInlineStart: dark ? 'calc(100% - 1.75rem)' : 0 }}
      >
        {dark ? <Moon size={14} className="text-brand-400" /> : <Sun size={14} className="text-brand-500" />}
      </motion.span>
    </button>
  );
}
