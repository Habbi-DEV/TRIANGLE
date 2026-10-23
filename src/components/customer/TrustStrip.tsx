import { Flame, Leaf, ShieldCheck, Star, type LucideIcon } from 'lucide-react';
import { useLang } from '../../lib/i18n';

const ITEMS: { icon: LucideIcon; title: string; sub: string }[] = [
  { icon: Flame, title: 'shop.trust.fast', sub: 'shop.trust.fast_sub' },
  { icon: ShieldCheck, title: 'shop.trust.secure', sub: 'shop.trust.secure_sub' },
  { icon: Leaf, title: 'shop.trust.fresh', sub: 'shop.trust.fresh_sub' },
  { icon: Star, title: 'shop.trust.premium', sub: 'shop.trust.premium_sub' },
];

/** Four reassurance points under the category rail. Stacked (icon above
 *  text) on phones so all four fit side by side without scrolling; inline
 *  (icon beside text) from `sm` up. */
export default function TrustStrip() {
  const { t } = useLang();
  return (
    <ul className="mt-4 grid grid-cols-4 divide-x divide-zinc-200/80 rounded-3xl border border-zinc-200/80 bg-white/70 py-3 backdrop-blur rtl:divide-x-reverse dark:divide-white/[0.07] dark:border-orange-500/20 dark:bg-zinc-900/50">
      {ITEMS.map(({ icon: Icon, title, sub }) => (
        <li key={title} className="flex flex-col items-center gap-1.5 px-1 text-center sm:flex-row sm:gap-2.5 sm:px-3 sm:text-start">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-orange-500/60 text-brand-500 shadow-[0_0_12px_rgba(255,106,0,0.25)] dark:text-brand-400">
            <Icon size={15} strokeWidth={2.2} />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-bold leading-tight text-zinc-900 sm:text-[11px] dark:text-zinc-100">{t(title)}</span>
            <span className="mt-0.5 block text-[9px] leading-tight text-zinc-500 sm:text-[10px] dark:text-zinc-400">{t(sub)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
