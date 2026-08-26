import { Languages } from 'lucide-react';
import { useLang } from '../lib/i18n';

/** Small FR/AR toggle. Used in both the admin sidebar/topbar and the
 *  customer e-menu header — switching flips `dir` (rtl for Arabic) and
 *  persists the choice for next visit. */
export default function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useLang();

  return (
    <div
      className={`flex items-center gap-1 rounded-full bg-zinc-100 p-1 text-xs font-bold ${compact ? '' : ''}`}
      role="group"
      aria-label="Language"
    >
      {!compact && <Languages size={13} className="ms-1.5 text-zinc-400" />}
      {(['fr', 'ar'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={`rounded-full px-2.5 py-1 transition ${
            lang === l ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          {l === 'fr' ? 'FR' : 'AR'}
        </button>
      ))}
    </div>
  );
}
