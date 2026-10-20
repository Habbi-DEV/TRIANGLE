import type { Product, ProductVariant } from './types';

/** A size can be ordered when the admin left it visible AND it has stock.
 *  The public API only sends `in_stock` (never the number); staff payloads
 *  carry `stock` instead — so both are understood here. */
export const isVariantSellable = (v: ProductVariant): boolean =>
  v.is_available && (v.in_stock ?? (v.stock ?? 0) > 0);

/** Visible sizes of a product (sold-out ones included, so they can be shown greyed out). */
export const visibleVariants = (p: Product | null | undefined): ProductVariant[] =>
  (p?.variants ?? []).filter((v) => v.is_available);

/** Sizes that can actually be ordered right now. */
export const sellableVariants = (p: Product | null | undefined): ProductVariant[] =>
  (p?.variants ?? []).filter(isVariantSellable);

/** Cheapest orderable size, or null when the product has none. */
export const cheapestSellable = (p: Product | null | undefined): ProductVariant | null => {
  const vs = sellableVariants(p);
  return vs.length ? [...vs].sort((a, b) => a.price - b.price)[0] : null;
};

/** Photo to show for a cart / ticket line: the chosen size's own photo (the
 *  brand's cover photo shows ALL sizes together), falling back to the product's. */
export const lineImage = (product: Product, variant: ProductVariant | null | undefined): string =>
  (variant?.image_url || product.image_url || '');
