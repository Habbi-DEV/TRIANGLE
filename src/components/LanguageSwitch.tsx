import { useLang } from '../lib/i18n';

/** Small FR/AR toggle. Used in the admin sidebar/topbar, the driver top bar,
 *  the login page, and the customer e-menu header — switching flips `dir`
 *  (rtl for Arabic) and persists the choice for next visit.
 *
 *  Styled to match the customer e-menu header exactly (brand-colored active
 *  pill, no leading icon) so the control looks identical everywhere in the
 *  app. `compact` is kept only so existing call sites don't need to change,
 *  but no longer alters the appearance. */
export default function LanguageSwitch({ compact: _compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useLang();

  return (
    <div
      className="gem gem-sm flex rounded-full bg-zinc-100 p-1 [--gem-r:20px] dark:bg-zinc-900"
      role="group"
      aria-label="Language"
    >
      {(['fr', 'ar'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
            lang === l ? 'bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[0_0_12px_rgba(255,106,0,0.45)]' : 'text-zinc-500 dark:text-zinc-400'
          }`}
        >
          {l === 'fr' ? 'FR' : 'AR'}
        </button>
      ))}
    </div>
  );
}
