import { Plus } from 'lucide-react';
import type { Product } from '../../lib/types';
import { money } from '../../lib/format';
import { useLang } from '../../lib/i18n';

interface Props {
  product: Product;
  onOpen: (p: Product) => void;
  onQuickAdd: (p: Product) => void;
}

export default function ProductCard({ product, onOpen, onQuickAdd }: Props) {
  const { t } = useLang();
  const soldOut = !product.is_available || product.stock <= 0;
  const variants = (product.variants ?? []).filter((v) => v.is_available);
  // A product with sizes shows its cheapest one on the card — the exact
  // price the customer will pay depends on which size they pick in the
  // sheet, same idea as a restaurant menu printing "from 2.00".
  const cheapestVariant = variants.length ? [...variants].sort((a, b) => a.price - b.price)[0] : null;
  const displayPrice = cheapestVariant ? cheapestVariant.price : product.price;
  return (
    <div
      onClick={() => !soldOut && onOpen(product)}
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-white shadow-soft-sm ring-1 ring-zinc-100 transition hover:shadow-soft dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-white/[0.08] dark:hover:ring-white/[0.14] ${soldOut ? 'opacity-60' : ''}`}
    >
      {/* dark:bg-zinc-900 on this wrapper (not just black) is what lets a
          food photo with its own dark background blend into the card
          instead of sitting on a harsher near-black — see .food-photo in
          index.css for the matching inner-edge treatment. */}
      <div className="relative aspect-[5/4] overflow-hidden bg-orange-100 dark:bg-zinc-800">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="food-photo h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">🍽️</div>
        )}
        {soldOut && (
          <span className="absolute start-2 top-2 rounded-full bg-zinc-900/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white dark:bg-black/70">
            {t('shop.sold_out')}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="text-[13px] font-semibold leading-snug text-zinc-900 line-clamp-2 dark:text-zinc-100">{product.name}</h3>
        <div className="mt-auto flex items-center justify-between pt-2">
          {/* Brand orange stays the accent in both themes — bumped one
              shade lighter (brand-400) on dark so it keeps AA contrast
              against zinc-900 instead of reading muddy. */}
          <span className="font-display text-[15px] font-bold text-burnt dark:text-brand-400">
            {variants.length > 1 && <span className="me-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{t('shop.from')}</span>}
            {money(displayPrice)}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!soldOut) onQuickAdd(product);
            }}
            disabled={soldOut}
            aria-label={t('shop.add_to_cart', { name: product.name })}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white shadow-soft-sm transition hover:bg-brand-600 active:scale-90 disabled:bg-zinc-300 dark:shadow-orange-500/20 dark:disabled:bg-zinc-700"
          >
            <Plus size={16} strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
}
