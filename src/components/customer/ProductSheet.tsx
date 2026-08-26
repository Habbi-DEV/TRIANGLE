import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Droplet, Layers, Minus, Plus, X } from 'lucide-react';
import type { Product, Sauce, Supplement } from '../../lib/types';
import { money } from '../../lib/format';
import { useLang } from '../../lib/i18n';

interface Props {
  product: Product | null;
  onClose: () => void;
  onAdd: (p: Product, qty: number, sauces: Sauce[], supplements: Supplement[]) => void;
}

// Multiple stacked drop-shadows (not a box border) so the green highlight
// traces the swatch's own alpha silhouette instead of a rectangle — two
// tight passes build a crisp outline, two passes with modest blur build a
// contained glow that hugs the shape rather than spreading far past it.
// Shared by both Sauces and Supplements so the two pickers look identical.
const SELECTED_FILTER =
  'drop-shadow(0 0 1.5px #22c55e) drop-shadow(0 0 1.5px #22c55e) drop-shadow(0 0 3px rgba(34,197,94,0.65)) drop-shadow(0 0 6px rgba(34,197,94,0.35))';

export default function ProductSheet({ product, onClose, onAdd }: Props) {
  const { t } = useLang();
  const [qty, setQty] = useState(1);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [selectedSauceIds, setSelectedSauceIds] = useState<number[]>([]);
  const [selectedSupplementIds, setSelectedSupplementIds] = useState<number[]>([]);

  // Cover photo first, then the gallery — one strip customers can flip through.
  const photos = product
    ? [product.image_url, ...(product.images ?? []).map((i) => i.url)].filter(Boolean)
    : [];

  // Sauces and supplements both come straight off the product itself
  // (attached by the API from product_sauces / product_supplements) — no
  // separate fetch, no category rule. Only the ones the admin left visible
  // (is_active) show up here.
  const sauces = (product?.sauces ?? []).filter((s) => s.is_active);
  const supplements = (product?.supplements ?? []).filter((s) => s.is_active);

  useEffect(() => {
    if (!product) return;
    setQty(1);
    setPhotoIdx(0);
    setSelectedSauceIds([]);
    setSelectedSupplementIds([]);
  }, [product]);

  const toggleSauce = (id: number) =>
    setSelectedSauceIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const toggleSupplement = (id: number) =>
    setSelectedSupplementIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const chosenSauces = sauces.filter((s) => selectedSauceIds.includes(s.id));
  const chosenSupplements = supplements.filter((s) => selectedSupplementIds.includes(s.id));
  const unitPrice = product
    ? product.price
      + chosenSauces.reduce((n, s) => n + s.price, 0)
      + chosenSupplements.reduce((n, s) => n + s.price, 0)
    : 0;

  return (
    <AnimatePresence>
      {product && (
        <motion.div
          className="fixed inset-0 z-40 flex items-end justify-center bg-zinc-950/50 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 350 }}
          >
            <div className="relative h-52 shrink-0 bg-orange-100">
              {photos.length > 0 && (
                <img src={photos[photoIdx]} alt={product.name} className="h-full w-full object-cover" />
              )}
              <button
                onClick={onClose}
                className="absolute end-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-zinc-700 shadow"
                aria-label={t('shop.close')}
              >
                <X size={18} />
              </button>
              {photos.length > 1 && (
                <>
                  <button
                    onClick={() => setPhotoIdx((i) => (i - 1 + photos.length) % photos.length)}
                    className="absolute start-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-zinc-700 shadow transition hover:bg-white active:scale-90 rtl:rotate-180"
                    aria-label={t('shop.prev_photo')}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={() => setPhotoIdx((i) => (i + 1) % photos.length)}
                    className="absolute end-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-zinc-700 shadow transition hover:bg-white active:scale-90 rtl:rotate-180"
                    aria-label={t('shop.next_photo')}
                  >
                    <ChevronRight size={18} />
                  </button>
                  <div className="absolute bottom-3 start-1/2 flex -translate-x-1/2 gap-1.5 rtl:translate-x-1/2">
                    {photos.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setPhotoIdx(i)}
                        aria-label={t('shop.photo_n', { n: i + 1 })}
                        className={`h-1.5 rounded-full transition-all ${i === photoIdx ? 'w-5 bg-white' : 'w-1.5 bg-white/60'}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="overflow-y-auto thin-scroll p-5 pb-8">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-xl font-bold text-zinc-900">{product.name}</h2>
                <span className="font-display text-lg font-bold text-burnt">{money(unitPrice)}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">{product.description}</p>

              {sauces.length > 0 && (
                <div className="mt-5">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-400">{t('shop.sauces')}</p>
                  <div className="flex flex-wrap gap-4">
                    {sauces.map((s) => {
                      const active = selectedSauceIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          onClick={() => toggleSauce(s.id)}
                          className="flex w-16 flex-col items-center gap-1.5"
                        >
                          {/* Purely a layout box — no bg/border/overflow-hidden, so a
                              transparent-PNG sauce photo sits directly on the page
                              with nothing framing it. The orange selected state is a
                              drop-shadow on the image itself, so it hugs the bowl's
                              real silhouette instead of this box's rectangle. */}
                          <span className="flex h-14 w-14 items-center justify-center">
                            {s.image_url ? (
                              <img
                                src={s.image_url}
                                alt=""
                                className="h-14 w-14 object-contain transition-[filter] duration-200"
                                style={active ? { filter: SELECTED_FILTER } : undefined}
                              />
                            ) : (
                              <span
                                className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 transition-[filter] duration-200"
                                style={active ? { filter: SELECTED_FILTER } : undefined}
                              >
                                <Droplet size={18} />
                              </span>
                            )}
                          </span>
                          <span className={`truncate text-[11px] leading-tight ${active ? 'font-bold text-green-700' : 'font-semibold text-zinc-600'}`}>
                            {s.name}
                          </span>
                          {s.price > 0 && <span className="-mt-1 text-[10px] text-zinc-400">+{money(s.price)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {supplements.length > 0 && (
                <div className="mt-5">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-400">{t('shop.supplements')}</p>
                  <div className="flex flex-wrap gap-4">
                    {supplements.map((s) => {
                      const active = selectedSupplementIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          onClick={() => toggleSupplement(s.id)}
                          className="flex w-16 flex-col items-center gap-1.5"
                        >
                          {/* Same treatment as the sauce swatches above: a bare
                              layout box (no bg/border/overflow-hidden) so a
                              transparent-PNG supplement photo sits directly on
                              the page, with the orange selected state applied
                              as a drop-shadow that hugs the photo's real
                              silhouette instead of a rectangle. */}
                          <span className="flex h-14 w-14 items-center justify-center">
                            {s.image_url ? (
                              <img
                                src={s.image_url}
                                alt=""
                                className="h-14 w-14 object-contain transition-[filter] duration-200"
                                style={active ? { filter: SELECTED_FILTER } : undefined}
                              />
                            ) : (
                              <span
                                className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 transition-[filter] duration-200"
                                style={active ? { filter: SELECTED_FILTER } : undefined}
                              >
                                <Layers size={18} />
                              </span>
                            )}
                          </span>
                          <span className={`truncate text-[11px] leading-tight ${active ? 'font-bold text-green-700' : 'font-semibold text-zinc-600'}`}>
                            {s.name}
                          </span>
                          {s.price > 0 && <span className="-mt-1 text-[10px] text-zinc-400">+{money(s.price)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-6 flex items-center gap-3">
                <div className="flex items-center gap-4 rounded-full bg-zinc-100 px-2 py-1.5">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm active:scale-90"
                    aria-label={t('shop.decrease_qty')}
                  >
                    <Minus size={16} />
                  </button>
                  <span className="w-6 text-center font-display text-lg font-bold">{qty}</span>
                  <button
                    onClick={() => setQty((q) => Math.min(20, q + 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm active:scale-90"
                    aria-label={t('shop.increase_qty')}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <button
                  onClick={() => {
                    onAdd(product, qty, chosenSauces, chosenSupplements);
                    onClose();
                  }}
                  className="flex-1 rounded-full bg-brand-500 py-3.5 font-display text-[15px] font-bold text-white shadow-lg shadow-orange-500/30 transition hover:bg-brand-600 active:scale-[0.98]"
                >
                  {t('shop.add_to_cart_cta')} · {money(unitPrice * qty)}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}