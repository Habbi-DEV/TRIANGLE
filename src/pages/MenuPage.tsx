import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, Search, ShoppingBag, ShoppingBasket, UtensilsCrossed, X } from 'lucide-react';
import type { Category, Order, Product, Promotion } from '../lib/types';
import { ACTIVE_STATUSES } from '../lib/types';
import { money } from '../lib/format';
import { useSettings } from '../lib/settings';
import { useCartStore, selectCount, selectSubtotal } from '../stores/cartStore';
import ProductCard from '../components/customer/ProductCard';
import ProductSheet from '../components/customer/ProductSheet';
import CartSheet from '../components/customer/CartSheet';
import OrderTracker from '../components/customer/OrderTracker';
import Spinner from '../components/ui/Spinner';
import { playChime, unlockChime } from '../lib/chime';
import { ORDER_STATUS_HINT, ORDER_STATUS_LABEL } from '../lib/orderStatus';
import { useLang } from '../lib/i18n';

// Persists the last placed order's id across a page reload/close, purely
// client-side (there's no customer login to key this off of). Only the id
// is stored — the actual order data is always re-fetched fresh from the
// server, never trusted from storage.
const LAST_ORDER_KEY = 'restolink:lastOrderId';

export default function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState<number | 'all'>('all');
  const [detail, setDetail] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Promo banner carousel: bannerIdx tracks the slide currently in view
  // (updated both by manual swipe, via the container's own onScroll, and
  // by the auto-advance timer below), bannerRef is used to scroll to a
  // given slide from either the dots or the timer.
  const [bannerIdx, setBannerIdx] = useState(0);
  const bannerRef = useRef<HTMLDivElement>(null);

  // The last placed order and whether its tracker is currently shown are
  // kept separate: closing the tracker (via its own X, or by tapping the
  // bell again) shouldn't forget the order, so the bell can bring it back.
  const [order, setOrder] = useState<Order | null>(null);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [orderUnseen, setOrderUnseen] = useState(false);

  const { t, lang, setLang } = useLang();
  const settings = useSettings();
  const count = useCartStore(selectCount);
  const subtotal = useCartStore(selectSubtotal);
  const add = useCartStore((s) => s.add);

  useEffect(() => {
    Promise.all([
      fetch('/api/categories').then((r) => r.json()),
      fetch('/api/products').then((r) => r.json()),
      fetch('/api/categories?type=promotion&active=1').then((r) => r.json()),
    ])
      .then(([cats, prods, promos]) => {
        // Keep the full list (including inactive categories) for the chip
        // strip's own bookkeeping — it filters to active ones itself.
        setCategories(Array.isArray(cats) ? cats : []);
        setProducts(Array.isArray(prods) ? prods : []);
        setPromotions(Array.isArray(promos) ? promos : []);
      })
      .catch((e) => console.error('menu load failed', e))
      .finally(() => setLoading(false));
  }, []);

  // Auto-advance the banner carousel every 4.5s. Restarting on every
  // bannerIdx change (not just on mount) means a manual swipe or a dot tap
  // resets the countdown instead of fighting the timer's own scroll.
  useEffect(() => {
    if (promotions.length < 2) return;
    const id = setInterval(() => {
      const el = bannerRef.current;
      if (!el) return;
      const next = (bannerIdx + 1) % promotions.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    }, 4500);
    return () => clearInterval(id);
  }, [bannerIdx, promotions.length]);

  // Restores the notification bell across a page reload: if a previous
  // session left an order id behind, fetch its current status so the bell
  // lights up again immediately, without waiting for the next poll tick.
  // No `orderUnseen` here — restoring silently isn't a new notification.
  useEffect(() => {
    const storedId = localStorage.getItem(LAST_ORDER_KEY);
    if (!storedId) return;
    fetch(`/api/orders?id=${storedId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((o: Order) => setOrder(o))
      .catch(() => localStorage.removeItem(LAST_ORDER_KEY));
  }, []);

  // Browsers block audio that starts without a user gesture, and the chime
  // plays from a background timer (not a click) — so unlock it on whatever
  // the person taps first, well before any status change could need it.
  useEffect(() => {
    const unlock = () => unlockChime();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // Keeps the bell honest while the tracker itself is closed: OrderTracker
  // already polls every 3s (and reports back via onUpdate) whenever it's
  // open, so this only needs to run the rest of the time. Checks every 15s
  // — frequent enough to notice a status change without hammering the API
  // — and stops on its own once the order reaches a terminal status, since
  // nothing more can change after that.
  useEffect(() => {
    if (!order || trackerOpen || !ACTIVE_STATUSES.includes(order.status)) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders?id=${order.id}`);
        if (!res.ok) {
          // Order no longer exists (e.g. test data was reset) — stop
          // pestering the server about it and clear the stale bell.
          localStorage.removeItem(LAST_ORDER_KEY);
          setOrder(null);
          return;
        }
        const updated: Order = await res.json();
        if (updated.status !== order.status) {
          setOrder(updated);
          setOrderUnseen(true);
          playChime();
          if ('Notification' in window && Notification.permission === 'granted') {
            const n = new Notification(settings?.restaurant_name || 'Restolink', {
              body: [ORDER_STATUS_LABEL[updated.status], ORDER_STATUS_HINT[updated.status]].filter(Boolean).join(' — '),
              icon: settings?.logo_url || '/favicon.svg',
              // Replaces any earlier notification for this same order
              // instead of stacking one per status change.
              tag: `order-${updated.id}`,
            });
            n.onclick = () => {
              window.focus();
              setTrackerOpen(true);
              setOrderUnseen(false);
              n.close();
            };
          }
        }
      } catch {
        /* transient network hiccup — try again next tick */
      }
    }, 15000);
    return () => clearInterval(id);
  }, [order, trackerOpen, settings?.restaurant_name, settings?.logo_url]);

  const visible = useMemo(() => {
    const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name));
    const byCat = activeCat === 'all' ? sorted : sorted.filter((p) => p.category_id === activeCat);
    const q = search.trim().toLowerCase();
    return q ? byCat.filter((p) => p.name.toLowerCase().includes(q)) : byCat;
  }, [products, activeCat, search]);

  return (
    <div className="min-h-screen bg-zinc-50 pb-36">
      <div className="mx-auto max-w-md px-4 md:max-w-3xl lg:max-w-5xl">
        {/* header — sticky identity bar only (logo, name, language, cart). Kept
            separate from the banner/categories below so it's always the very
            first thing on screen, pinned, instead of the banner pushing it down. */}
        <header className="sticky top-0 z-30 -mx-4 border-b border-zinc-100 bg-white/90 px-4 py-3 backdrop-blur md:mx-0 md:px-0">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center text-lg ${settings?.logo_url ? '' : 'rounded-xl bg-brand-500 shadow-sm shadow-orange-500/30'}`}>
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="" className="h-full w-full object-contain" />
              ) : (
                '🍽️'
              )}
            </div>
            <h1 className="min-w-0 flex-1 truncate font-display text-[17px] font-extrabold tracking-tight text-zinc-900">{settings?.restaurant_name || 'Restolink'}</h1>
            <div className="ms-auto flex shrink-0 items-center gap-2">
              <div className="flex rounded-full bg-zinc-100 p-0.5">
                <button
                  onClick={() => setLang('fr')}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${lang === 'fr' ? 'bg-brand-500 text-white' : 'text-zinc-500'}`}
                >
                  FR
                </button>
                <button
                  onClick={() => setLang('ar')}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${lang === 'ar' ? 'bg-brand-500 text-white' : 'text-zinc-500'}`}
                >
                  AR
                </button>
              </div>
              <button
                onClick={() => setCartOpen(true)}
                aria-label={t('shop.cart_aria')}
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-zinc-700 transition hover:bg-zinc-100"
              >
                <ShoppingBag size={19} />
                {count > 0 && (
                  <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[9px] font-bold text-white">
                    {count}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* promo banner carousel — right below the pinned header, scrolls away normally */}
        {promotions.length > 0 && (
          <div className="pt-3">
            <div
              ref={bannerRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                setBannerIdx(Math.round(el.scrollLeft / el.clientWidth));
              }}
              className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-2xl bg-white"
            >
              {promotions.map((p) => (
                <img key={p.id} src={p.image_url} alt="" className="aspect-[2/1] w-full shrink-0 snap-center rounded-2xl object-cover" />
              ))}
            </div>
            {promotions.length > 1 && (
              <div className="mt-2 flex justify-center gap-1.5">
                {promotions.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      const el = bannerRef.current;
                      if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
                    }}
                    aria-label={t('shop.go_to_banner', { n: i + 1 })}
                    className={`h-1.5 rounded-full transition-all ${i === bannerIdx ? 'w-4 bg-brand-500' : 'w-1.5 bg-zinc-200'}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* category rail — square icons; scrolls away with the banner, not
            pinned. Extra top padding keeps the selection ring's box-shadow
            from being clipped by the scroll container (overflow-x-auto also
            clips the y-axis unless it has room to spare). */}
        <div className="no-scrollbar -mx-4 mt-4 flex gap-4 overflow-x-auto px-4 pb-1 pt-2 md:mx-0 md:px-0">
          <button onClick={() => setActiveCat('all')} className="flex shrink-0 flex-col items-center gap-1.5">
            <span
              className={`flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl text-xl transition ${
                settings?.all_category_image_url
                  ? `bg-white ${activeCat === 'all' ? 'ring-2 ring-brand-500' : 'ring-1 ring-zinc-200'}`
                  : activeCat === 'all'
                    ? 'bg-brand-50 ring-2 ring-brand-500'
                    : 'bg-zinc-100'
              }`}
            >
              {settings?.all_category_image_url ? (
                <img src={settings.all_category_image_url} alt="" className="h-full w-full object-cover" />
              ) : (
                '✨'
              )}
            </span>
            <span className={`text-[10px] font-semibold ${activeCat === 'all' ? 'text-brand-600' : 'text-zinc-500'}`}>{t('shop.all')}</span>
          </button>
          {categories.filter((c) => c.is_active).map((c) => (
            <button key={c.id} onClick={() => setActiveCat(c.id)} className="flex shrink-0 flex-col items-center gap-1.5">
              <span
                className={`flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl text-xl transition ${
                  c.image_url
                    ? `bg-white ${activeCat === c.id ? 'ring-2 ring-brand-500' : 'ring-1 ring-zinc-200'}`
                    : activeCat === c.id
                      ? 'bg-brand-50 ring-2 ring-brand-500'
                      : 'bg-zinc-100'
                }`}
              >
                {c.image_url ? <img src={c.image_url} alt="" className="h-full w-full object-cover" /> : c.icon}
              </span>
              <span className={`max-w-[56px] truncate text-[10px] font-semibold ${activeCat === c.id ? 'text-brand-600' : 'text-zinc-500'}`}>
                {c.name}
              </span>
            </button>
          ))}
        </div>

        {/* inline search — opened from the bottom nav, which also scrolls the
            page back to the top so this is reachable even mid-scroll */}
        {searchOpen && (
          <div className="mt-3">
            <div className="flex items-center gap-2 rounded-full bg-zinc-100 px-3.5 py-2.5">
              <Search size={16} className="shrink-0 text-zinc-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('shop.search_placeholder')}
                className="flex-1 bg-transparent text-[13px] text-zinc-800 placeholder:text-zinc-400 focus:outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')} className="shrink-0 text-zinc-400" aria-label={t('shop.clear_search')}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* product grid */}
        {loading ? (
          <Spinner label={t('shop.loading')} />
        ) : visible.length === 0 ? (
          <p className="py-16 text-center text-sm text-zinc-400">{search ? t('shop.no_results', { q: search }) : t('shop.empty')}</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {visible.map((p) => (
              <ProductCard key={p.id} product={p} onOpen={setDetail} onQuickAdd={(prod) => add(prod, 1)} />
            ))}
          </div>
        )}
      </div>

      {/* floating cart bar — sits just above the bottom nav */}
      {count > 0 && !trackerOpen && (
        <motion.button
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-md items-center justify-between rounded-full bg-zinc-900 px-5 py-4 text-white shadow-2xl transition active:scale-[0.98]"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingBasket size={18} className="text-brand-400" />
            {count} {count === 1 ? t('cart.items') : t('cart.items_plural')}
          </span>
          <span className="font-display text-[15px] font-bold">{t('shop.view_cart')} · {money(subtotal)}</span>
        </motion.button>
      )}

      {/* bottom nav — Menu / Search / order status */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-around px-6 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 md:max-w-3xl lg:max-w-5xl">
          <button onClick={() => setSearchOpen(false)} className="flex flex-col items-center gap-0.5">
            <UtensilsCrossed size={19} className={!searchOpen ? 'text-zinc-900' : 'text-zinc-400'} />
            <span className={`text-[10px] font-semibold ${!searchOpen ? 'text-zinc-900' : 'text-zinc-400'}`}>{t('shop.nav_menu')}</span>
          </button>
          <button
            onClick={() => {
              setSearchOpen((v) => {
                const next = !v;
                if (next) window.scrollTo({ top: 0, behavior: 'smooth' });
                return next;
              });
            }}
            className="flex flex-col items-center gap-0.5"
          >
            <Search size={19} className={searchOpen ? 'text-zinc-900' : 'text-zinc-400'} />
            <span className={`text-[10px] font-semibold ${searchOpen ? 'text-zinc-900' : 'text-zinc-400'}`}>{t('shop.nav_search')}</span>
          </button>
          <button
            onClick={() => {
              if (!order) return;
              setTrackerOpen(true);
              setOrderUnseen(false);
            }}
            disabled={!order}
            aria-label={t('shop.order_status_aria')}
            title={order ? undefined : t('shop.no_active_order')}
            className={`relative flex h-9 w-9 items-center justify-center rounded-full transition ${order ? 'bg-brand-500 text-white' : 'bg-zinc-100 text-zinc-300'}`}
          >
            <Bell size={17} />
            {orderUnseen && <span className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />}
          </button>
        </div>
      </nav>

      <ProductSheet key={detail?.id ?? 'none'} product={detail} onClose={() => setDetail(null)} onAdd={(p, q, sauces, supplements) => add(p, q, sauces, supplements)} />
      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onPlaced={(o) => {
          setOrder(o);
          setTrackerOpen(true);
          setOrderUnseen(true);
          localStorage.setItem(LAST_ORDER_KEY, String(o.id));
        }}
      />
      {order && trackerOpen && <OrderTracker order={order} onClose={() => setTrackerOpen(false)} onUpdate={setOrder} />}
    </div>
  );
}
