import { ChevronRight, Gift } from 'lucide-react';
import { motion } from 'framer-motion';
import { money } from '../../lib/format';
import { useLang } from '../../lib/i18n';

/** Floating promo pill above the bottom nav. Only rendered by MenuPage when
 *  the owner has set a free-delivery threshold in Settings (> 0), so the
 *  promise on screen always matches what api/orders.js really charges. */
export default function FreeDeliveryBar({ threshold, onClick }: { threshold: number; onClick: () => void }) {
  const { t } = useLang();
  return (
    <motion.button
      type="button"
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      onClick={onClick}
      className="fixed inset-x-4 bottom-[calc(88px+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md items-center gap-3 gem overflow-hidden rounded-2xl bg-white/90 [--gem-r:16px] px-3 py-2.5 text-start shadow-soft-lg backdrop-blur-xl transition active:scale-[0.98] dark:bg-zinc-950/90 dark:shadow-ember"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-[0_0_16px_rgba(255,106,0,0.5)]">
        <Gift size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-zinc-900 dark:text-zinc-100">{t('shop.free_delivery.title')}</span>
        <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">{t('shop.free_delivery.desc', { amount: money(threshold) })}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-brand-500 rtl:rotate-180" />
    </motion.button>
  );
}
