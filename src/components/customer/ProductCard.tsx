import { Flame, Heart, Package, Plus, Sparkles, Star, type LucideIcon } from 'lucide-react';
import type { Product, ProductBadge } from '../../lib/types';
import { money } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import { cheapestSellable, sellableVariants, visibleVariants } from '../../lib/variants';
import { useFavoritesStore } from '../../stores/favoritesStore';

interface Props {
  product: Product;
  onOpen: (p: Product) => void;
  onQuickAdd: (p: Product) => void;
}

const BADGES: Record<ProductBadge, { icon: LucideIcon; label: string }> = {
  popular: { icon: Flame, label: 'shop.badge.popular' },
  new: { icon: Sparkles, label: 'shop.badge.new' },
  limited: { icon: Star, label: 'shop.badge.limited' },
};

export default function ProductCard({ product, onOpen, onQuickAdd }: Props) {
  const { t } = useLang();
  const isFav = useFavoritesStore((s) => s.ids.includes(product.id));
  const toggleFav = useFavoritesStore((s) => s.toggle);
  // The public API hides `stock` and sends a server-computed `in_stock`
  // instead (true as long as one size — or the product itself — has stock).
  const soldOut = !product.is_available || product.in_stock === false || product.stock <= 0;
  const variants = visibleVariants(product);
  // A product with sizes shows its cheapest orderable size on the card — the
  // exact price depends on which size is picked in the sheet, same idea as a
  // restaurant menu printing "from 2.00".
  const cheapestVariant = cheapestSellable(product) ?? (variants.length ? [...variants].sort((a, b) => a.price - b.price)[0] : null);
  const displayPrice = cheapestVariant ? cheapestVariant.price : product.price;
  const isPack = product.is_pack === true;
  // What the customer saves against buying the contents one by one.
  const saving = isPack && product.pack_value && product.pack_value > product.price ? Math.round((product.pack_value - product.price) * 100) / 100 : 0;
  const badge = !soldOut && !isPack && product.badge ? BADGES[product.badge] : null;

  return (
    <div
      onClick={() => !soldOut && onOpen(product)}
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-3xl bg-white shadow-soft-sm ring-1 ring-zinc-200/70 transition duration-300 hover:shadow-soft dark:bg-zinc-900/80 dark:shadow-none dark:ring-orange-500/20 dark:hover:shadow-ember dark:hover:ring-orange-500/50 ${soldOut ? 'opacity-60' : ''}`}
    >
      {/* The photo fades into the card colour at its bottom edge, so a food
          shot with its own dark backdrop melts into the card instead of
          ending on a hard line. */}
      <div className="relative aspect-[5/4] overflow-hidden bg-orange-100 dark:bg-zinc-800">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="food-photo h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">🍽️</div>
        )}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent dark:from-zinc-900" />

        {soldOut && (
          <span className="absolute start-2.5 top-2.5 rounded-full bg-zinc-900/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white dark:bg-black/70">
            {t('shop.sold_out')}
          </span>
        )}
        {isPack && !soldOut && (
          <span className="absolute start-2 top-2.5 flex items-center gap-1 rounded-full bg-zinc-950/85 py-1 pe-2.5 ps-2 text-[10px] font-extrabold tracking-wider text-brand-400 ring-1 ring-orange-500/60 backdrop-blur">
            <Package size={12} strokeWidth={2.4} className="shrink-0" />
            {t('pack.label')}
          </span>
        )}
        {saving > 0 && !soldOut && (
          <span className="absolute bottom-2 start-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-grad px-2.5 py-1 text-[10px] font-bold text-white shadow-[0_4px_14px_-2px_rgba(var(--brand-glow-rgb),0.6)]">
            {t('pack.save', { amount: money(saving) })}
          </span>
        )}
        {badge && (
          <span className="absolute start-2 top-2.5 flex max-w-[calc(100%-3.25rem)] items-center gap-1 rounded-full bg-gradient-to-r from-brand-500 to-brand-grad py-1 pe-2 ps-1.5 text-[10px] font-bold text-white shadow-[0_4px_14px_-2px_rgba(var(--brand-glow-rgb),0.6)]">
            <badge.icon size={12} strokeWidth={2.4} className="shrink-0" />
            <span className="truncate">{t(badge.label)}</span>
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleFav(product.id);
          }}
          aria-pressed={isFav}
          aria-label={t(isFav ? 'shop.favorite_remove' : 'shop.favorite_add', { name: product.name })}
          className="absolute end-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md transition active:scale-90"
        >
          <Heart size={16} className={isFav ? 'fill-brand-500 text-brand-500' : ''} />
        </button>
      </div>

      <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-1">
        <h3 className="min-h-[2.5rem] text-[14px] font-semibold leading-snug text-zinc-900 line-clamp-2 dark:text-zinc-100">{product.name}</h3>
        <div className="mt-auto flex items-center justify-between pt-2.5">
          {/* Brand orange stays the accent in both themes — bumped one
              shade lighter (brand-400) on dark so it keeps AA contrast
              against zinc-900 instead of reading muddy. */}
          <span className="price-mark whitespace-nowrap font-display text-[18px] font-bold leading-none text-burnt dark:text-brand-400">
            {saving > 0 && <span className="mb-1 block text-[12px] font-semibold leading-none text-zinc-400 line-through decoration-1 dark:text-zinc-500">{money(product.pack_value as number)}</span>}
            {sellableVariants(product).length > 1 && <span className="me-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{t('shop.from')}</span>}
            {money(displayPrice)}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!soldOut) onQuickAdd(product);
            }}
            disabled={soldOut}
            aria-label={t('shop.add_to_cart', { name: product.name })}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-brand-400 to-brand-grad text-white shadow-[0_6px_18px_-4px_rgba(var(--brand-glow-rgb),0.7)] transition hover:brightness-110 active:scale-90 disabled:bg-none disabled:bg-zinc-300 disabled:shadow-none dark:disabled:bg-zinc-700"
          >
            <Plus size={19} strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
}
