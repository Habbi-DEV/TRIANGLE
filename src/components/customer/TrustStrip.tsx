import { Flame, Leaf, ShieldCheck, Star, type LucideIcon } from 'lucide-react';
import { useLang } from '../../lib/i18n';

const ITEMS: { icon: LucideIcon; title: string }[] = [
  { icon: Flame, title: 'shop.trust.fast' },
  { icon: ShieldCheck, title: 'shop.trust.secure' },
  { icon: Leaf, title: 'shop.trust.fresh' },
  { icon: Star, title: 'shop.trust.premium' },
];

/** One compact row of four reassurance points, right under the banner.
 *  Deliberately a single short line each (icon + one word): it is secondary
 *  information, so it must not push the menu down the screen. */
export default function TrustStrip() {
  const { t } = useLang();
  return (
    <ul className="mt-3 grid grid-cols-4 divide-x divide-zinc-200/80 rounded-2xl border border-zinc-200/80 bg-white/90 py-2 rtl:divide-x-reverse dark:divide-white/[0.07] dark:border-orange-500/20 dark:bg-zinc-900/80">
      {ITEMS.map(({ icon: Icon, title }) => (
        <li key={title} className="flex min-w-0 items-center justify-center gap-1 px-0.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-orange-500/60 text-brand-500 shadow-[0_0_10px_rgba(255,106,0,0.25)] dark:text-brand-400">
            <Icon size={11} strokeWidth={2.4} />
          </span>
          <span className="whitespace-nowrap text-[10.5px] font-bold leading-none text-zinc-900 dark:text-zinc-100">{t(title)}</span>
        </li>
      ))}
    </ul>
  );
}
