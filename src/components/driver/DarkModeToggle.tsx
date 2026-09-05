import { Moon, Sun } from 'lucide-react';
import { useLang } from '../../lib/i18n';

export default function DarkModeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  const { t } = useLang();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={t('driver.dark_mode')}
      aria-pressed={dark}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
