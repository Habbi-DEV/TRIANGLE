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
  return (
    <div
      onClick={() => !soldOut && onOpen(product)}
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 transition hover:shadow-md ${soldOut ? 'opacity-60' : ''}`}
    >
      <div className="relative aspect-[5/4] overflow-hidden bg-orange-100">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">🍽️</div>
        )}
        {soldOut && (
          <span className="absolute start-2 top-2 rounded-full bg-zinc-900/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {t('shop.sold_out')}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="text-[13px] font-semibold leading-snug text-zinc-900 line-clamp-2">{product.name}</h3>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="font-display text-[15px] font-bold text-burnt">{money(product.price)}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!soldOut) onQuickAdd(product);
            }}
            disabled={soldOut}
            aria-label={t('shop.add_to_cart', { name: product.name })}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm transition hover:bg-brand-600 active:scale-90 disabled:bg-zinc-300"
          >
            <Plus size={16} strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
}
