import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bell, Heart, Search, ShoppingBag, ShoppingBasket, UtensilsCrossed, X, type LucideIcon } from 'lucide-react';
import type { Category, Order, OrderStatus, Product, Promotion } from '../lib/types';
import { ACTIVE_STATUSES } from '../lib/types';
import { money, orderNumber } from '../lib/format';
import { useSettings } from '../lib/settings';
import { useCartStore, selectCount, selectSubtotal } from '../stores/cartStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import ProductCard from '../components/customer/ProductCard';
import ProductSheet from '../components/customer/ProductSheet';
import TrustStrip from '../components/customer/TrustStrip';
import FreeDeliveryBar from '../components/customer/FreeDeliveryBar';
import { sellableVariants } from '../lib/variants';
import CartSheet from '../components/customer/CartSheet';
import OrderTracker from '../components/customer/OrderTracker';
import Skeleton from '../components/ui/Skeleton';
import ThemeToggle from '../components/ThemeToggle';
import LanguageSwitch from '../components/LanguageSwitch';
import AppLogo from '../components/AppLogo';
import InstallBanner from '../components/InstallBanner';
import SoundAlertBanner from '../components/shared/SoundAlertBanner';
import { playStatusChime, startAlarm, stopAlarm, unlockChime, isChimeUnlocked } from '../lib/chime';
import { ORDER_STATUS_HINT, ORDER_STATUS_LABEL } from '../lib/orderStatus';
import { fetchCustomerOrder, saveOrderToken } from '../lib/api';
import { useLang } from '../lib/i18n';

// Persists the last placed order's id across a page reload/close, purely
// client-side (there's no customer login to key this off of). Only the id
// is stored — the actual order data is always re-fetched fresh from the
// server, never trusted from storage.
const LAST_ORDER_KEY = 'restolink:lastOrderId';

/** One tile of the category rail. The selected one gets its photo outlined
 *  along the photo's own edge (see .cat-active in index.css) plus an underline
 *  bar; the rest sit flat, separated by a hairline divider. `children` is the picture (photo or emoji). */
function CategoryTile({ active, divider, label, onClick, children }: {
  active: boolean;
  divider: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group relative flex w-[80px] shrink-0 flex-col items-center gap-2 px-1.5 pb-4 pt-3.5 ${active ? 'cat-active' : ''} ${
        divider ? 'before:absolute before:inset-y-4 before:start-0 before:w-px before:bg-zinc-200/80 dark:before:bg-white/[0.07]' : ''
      }`}
    >
      <span className="flex h-12 w-12 items-center justify-center">{children}</span>
      <span className={`max-w-full truncate text-[11px] font-semibold ${active ? 'text-brand-600 dark:text-brand-400' : 'text-zinc-500 dark:text-zinc-300'}`}>{label}</span>
      {active && <span aria-hidden="true" className="absolute bottom-1.5 h-[3px] w-8 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(255,106,0,0.8)]" />}
    </button>
  );
}

/** Bottom-nav item: icon + label, with an ember underline when active. */
function NavItem({ active, icon: Icon, label, onClick }: { active: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} className="relative flex flex-col items-center gap-0.5 px-3 pb-2 pt-0.5">
      <Icon size={21} className={active ? 'text-brand-500' : 'text-zinc-400 dark:text-zinc-500'} />
      <span className={`text-[11px] font-semibold ${active ? 'text-brand-600 dark:text-brand-400' : 'text-zinc-400 dark:text-zinc-500'}`}>{label}</span>
      {active && <span aria-hidden="true" className="absolute bottom-0 h-[3px] w-7 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(255,106,0,0.8)]" />}
    </button>
  );
}

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
  const [favOnly, setFavOnly] = useState(false);
  const favIds = useFavoritesStore((st) => st.ids);

  // Promo banner carousel: bannerIdx tracks the slide currently in view
  // (updated both by manual swipe, via the container's own onScroll, and
  // by the auto-advance timer below), bannerRef is used to scroll to a
  // given slide from either the dots or the timer.
  const [bannerIdx, setBannerIdx] = useState(0);
  const bannerRef = useRef<HTMLDivElement>(null);
  // Pausing is read by the autoplay timer below but shouldn't itself
  // trigger a re-render on every hover/touch — a ref is enough since
  // nothing in the UI needs to reflect "paused" visually.
  const bannerPausedRef = useRef(false);

  // The last placed order and whether its tracker is currently shown are
  // kept separate: closing the tracker (via its own X, or by tapping the
  // bell again) shouldn't forget the order, so the bell can bring it back.
  const [order, setOrder] = useState<Order | null>(null);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [orderUnseen, setOrderUnseen] = useState(false);
  // True while the continuous "your order is ready" alarm (lib/chime.ts)
  // is ringing — rendered as a fixed banner (below) regardless of whether
  // the tracker screen happens to be open, so it can't be missed either
  // way. Cleared only by the customer's own "stop" tap, or once the order
  // moves past "ready" on its own.
  const [readyAlarmActive, setReadyAlarmActive] = useState(false);
  // Whether the audio context has actually been unlocked yet — drives the
  // manual fallback button below (see the unlock effect further down).
  const [soundUnlocked, setSoundUnlocked] = useState(isChimeUnlocked());

  const { t } = useLang();
  const settings = useSettings();
  const count = useCartStore(selectCount);
  const subtotal = useCartStore(selectSubtotal);
  const add = useCartStore((s) => s.add);

  // Shared by both places that detect a live status change (the
  // background poller below, and OrderTracker's onUpdate when its own
  // screen is open): "ready" on a pickup-style order (dine-in/takeaway)
  // gets the continuous, hard-to-miss alarm since that's the moment the
  // customer actually needs to walk over and get their food; every other
  // transition (including "ready" on a delivery order, which just means
  // it's now waiting on a driver) gets its own short, distinct sound.
  // stopAlarm()/setReadyAlarmActive(false) run unconditionally in the
  // "else" branch — harmless even if no alarm was active — so this stays
  // a stable callback with no outer state to depend on.
  const handleStatusTransition = useCallback((prevStatus: OrderStatus, updated: Order) => {
    if (updated.status === prevStatus) return;
    if (updated.status === 'ready' && updated.order_type !== 'delivery') {
      startAlarm();
      setReadyAlarmActive(true);
      return;
    }
    stopAlarm();
    setReadyAlarmActive(false);
    playStatusChime(updated.status);
  }, []);

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
  // Paused for as long as the finger/cursor is on the banner (see
  // bannerPausedRef, set from the container's own pointer handlers below)
  // so a slide mid-read never gets yanked away by the timer.
  useEffect(() => {
    if (promotions.length < 2) return;
    const id = setInterval(() => {
      if (bannerPausedRef.current) return;
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
    fetchCustomerOrder<Order>(storedId)
      .then((o: Order) => setOrder(o))
      .catch(() => localStorage.removeItem(LAST_ORDER_KEY));
  }, []);

  // Browsers block audio that starts without a user gesture, and the chime
  // plays from a background timer (not a click) — so unlock it as early as
  // possible. Tries immediately on mount first (covers a client-side nav
  // that landed here with user activation already in effect), then keeps
  // retrying on every subsequent gesture — not just the first, unlike the
  // previous `{ once: true }` listener — until the context is actually
  // confirmed running, so one failed attempt can't lock sound out for the
  // rest of the visit.
  useEffect(() => {
    unlockChime();
    if (isChimeUnlocked()) {
      setSoundUnlocked(true);
      return;
    }
    const events = ['pointerdown', 'keydown'] as const;
    const tryUnlock = () => {
      unlockChime();
      if (isChimeUnlocked()) {
        setSoundUnlocked(true);
        events.forEach((ev) => window.removeEventListener(ev, tryUnlock));
      }
    };
    events.forEach((ev) => window.addEventListener(ev, tryUnlock));
    return () => events.forEach((ev) => window.removeEventListener(ev, tryUnlock));
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
        const updated = await fetchCustomerOrder<Order>(order.id);
        if (updated.status !== order.status) {
          handleStatusTransition(order.status, updated);
          setOrder(updated);
          setOrderUnseen(true);
          if ('Notification' in window && Notification.permission === 'granted') {
            const n = new Notification(settings?.restaurant_name || 'TRIANGLE', {
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
      } catch (e) {
        // Order deleted server-side (or token lost) -> stop pestering the
        // server and clear the stale bell. Network hiccups retry next tick.
        const msg = e instanceof Error ? e.message : '';
        if (/not found|forbidden/i.test(msg)) {
          localStorage.removeItem(LAST_ORDER_KEY);
          setOrder(null);
        }
      }
    }, 15000);
    return () => clearInterval(id);
  }, [order, trackerOpen, settings?.restaurant_name, settings?.logo_url, handleStatusTransition]);

  // Safety net: never leave the alarm ringing behind if this screen goes
  // away entirely (e.g. a hard navigation elsewhere in the app).
  useEffect(() => () => stopAlarm(), []);

  const visible = useMemo(() => {
    const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name));
    const byCat = activeCat === 'all' ? sorted : sorted.filter((p) => p.category_id === activeCat);
    const byFav = favOnly && favIds.length > 0 ? byCat.filter((p) => favIds.includes(p.id)) : byCat;
    const q = search.trim().toLowerCase();
    return q ? byFav.filter((p) => p.name.toLowerCase().includes(q)) : byFav;
  }, [products, activeCat, search, favOnly, favIds]);
  const freeThreshold = Number(settings?.free_delivery_threshold) || 0;

  return (
    <div className="menu-ambient min-h-screen bg-zinc-50 pb-48 dark:bg-zinc-950">
      {/* Last-resort manual unlock, in case the order/status wasn't placed
          on this exact page load (e.g. the bell restored a previous order
          across a reload) and no other gesture happened to unlock it yet. */}
      {order && !soundUnlocked && (
        <button
          type="button"
          onClick={() => {
            unlockChime();
            if (isChimeUnlocked()) setSoundUnlocked(true);
          }}
          className="fixed bottom-40 end-4 z-[100] rounded-full bg-zinc-900 px-4 py-2.5 text-xs font-bold text-white shadow-lg transition hover:bg-zinc-800 active:scale-95"
        >
          🔔 {t('shop.enable_sound')}
        </button>
      )}
      {readyAlarmActive && order && (
        <SoundAlertBanner
          message={t('shop.ready_alert_msg', { id: orderNumber(order.id) })}
          stopLabel={t('shop.stop_alert')}
          onStop={() => {
            stopAlarm();
            setReadyAlarmActive(false);
          }}
        />
      )}
      <div className="mx-auto max-w-md px-4 md:max-w-3xl lg:max-w-5xl">
        {/* header — sticky identity bar only (logo, name, language, cart). Kept
            separate from the banner/categories below so it's always the very
            first thing on screen, pinned, instead of the banner pushing it down. */}
        <header className="sticky top-0 z-30 -mx-4 rounded-b-[28px] border-b border-zinc-200/70 bg-white/85 px-4 pb-3.5 pt-[calc(0.75rem+env(safe-area-inset-top))] shadow-soft-sm backdrop-blur-xl md:mx-0 md:px-5 md:pt-3 dark:border-orange-500/25 dark:bg-zinc-950/80 dark:shadow-[0_12px_40px_-14px_rgba(255,106,0,0.4)]">
          <div className="flex items-center gap-2">
            {/* Swaps to the white wordmark the moment the header goes
                zinc-950 in dark mode — loading and no-logo states live in
                the component (see components/AppLogo.tsx). */}
            <AppLogo
              className="flex h-10 w-10 shrink-0 items-center justify-center text-lg"
              fallbackClassName="rounded-xl bg-brand-500 shadow-sm shadow-orange-500/30"
            />
            <h1 className="min-w-0 flex-1 truncate font-display text-[17px] font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
              {settings === null ? '' : settings.restaurant_name || 'TRIANGLE'}
            </h1>
            <div className="ms-auto flex shrink-0 items-center gap-1.5">
              <LanguageSwitch />
              <ThemeToggle />
              <button
                onClick={() => setCartOpen(true)}
                aria-label={t('shop.cart_aria')}
                className="relative flex h-10 w-10 items-center justify-center rounded-full text-zinc-700 transition hover:bg-zinc-100 active:scale-90 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                <ShoppingBag size={22} />
                {count > 0 && (
                  <span className="absolute -end-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-[0_0_10px_rgba(239,68,68,0.55)]">
                    {count}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* PWA install banner — collapses away once dismissed or installed */}
        <div className="-mx-4 md:mx-0">
          <InstallBanner />
        </div>

        {/* promo banner carousel — right below the pinned header, scrolls away
            normally. Skeleton while loading: we don't yet know whether this
            restaurant even has promotions, so we show a plausible banner
            shape and let it collapse away once the real promotions array
            resolves (possibly empty). */}
        {loading ? (
          <div className="pt-4">
            <Skeleton className="aspect-[2/1] w-full rounded-3xl" />
          </div>
        ) : (
          promotions.length > 0 && (
            <div className="pt-4">
              <div
                ref={bannerRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  setBannerIdx(Math.round(el.scrollLeft / el.clientWidth));
                }}
                onMouseEnter={() => { bannerPausedRef.current = true; }}
                onMouseLeave={() => { bannerPausedRef.current = false; }}
                onTouchStart={() => { bannerPausedRef.current = true; }}
                onTouchEnd={() => { bannerPausedRef.current = false; }}
                // Light mode stays clean and relies on plain contrast against
                // the page. Dark mode needs its own separation: the banner
                // graphics have a dark background of their own, so without a
                // border/glow they visually merge into the dark app shell and
                // lose all depth — a thin brand-orange border plus a soft
                // ambient glow restores the boundary without looking loud.
                className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-3xl border border-orange-500/30 bg-white shadow-soft dark:border-orange-500/40 dark:bg-zinc-900 dark:shadow-ember"
              >
                {promotions.map((p) => (
                  <img key={p.id} src={p.image_url} alt="" className="aspect-[2/1] w-full shrink-0 snap-center object-cover" />
                ))}
              </div>
              {promotions.length > 1 && (
                <div className="mt-3 flex justify-center gap-1.5">
                  {promotions.map((p, i) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        const el = bannerRef.current;
                        if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
                      }}
                      aria-label={t('shop.go_to_banner', { n: i + 1 })}
                      className={`h-1.5 rounded-full transition-all ${i === bannerIdx ? 'w-6 bg-brand-500 shadow-[0_0_8px_rgba(255,106,0,0.7)]' : 'w-1.5 bg-zinc-300 dark:bg-zinc-700'}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {/* category rail — one glass panel, scrolls away with the banner (not
            pinned). Each category is a tile (see CategoryTile): its photo
            floats bare (transparent PNGs look best), categories without one
            fall back to an emoji in a rounded square. */}
        <div className="no-scrollbar mt-4 flex overflow-x-auto rounded-3xl border border-zinc-200/80 bg-white/70 px-1.5 py-1 backdrop-blur dark:border-orange-500/20 dark:bg-zinc-900/50">
          {loading ? (
            // Six placeholder tiles — a plausible category-rail count —
            // since categories haven't loaded yet.
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex w-[80px] shrink-0 flex-col items-center gap-2 px-1.5 pb-4 pt-3.5">
                <Skeleton className="h-12 w-12 rounded-xl" />
                <Skeleton className="h-2.5 w-10 rounded" />
              </div>
            ))
          ) : (
            <>
              <CategoryTile active={activeCat === 'all'} divider={false} label={t('shop.all')} onClick={() => setActiveCat('all')}>
                {/* "Tout" is the brand tile: its own artwork on a light
                    background, the white wordmark in dark mode so it doesn't
                    vanish into the page. */}
                <AppLogo
                  sources={{ light: settings?.all_category_image_url }}
                  className="flex h-12 w-12 items-center justify-center"
                  fallbackClassName="rounded-xl bg-zinc-100 text-xl transition group-aria-pressed:ring-2 group-aria-pressed:ring-orange-500 dark:bg-zinc-800"
                  imgClassName="cat-photo h-12 w-12 object-contain"
                  fallback="✨"
                />
              </CategoryTile>
              {categories.filter((c) => c.is_active).map((c) => (
                <CategoryTile key={c.id} active={activeCat === c.id} divider label={c.name} onClick={() => setActiveCat(c.id)}>
                  {c.image_url ? (
                    <img src={c.image_url} alt="" className="cat-photo h-12 w-12 object-contain" />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-xl transition group-aria-pressed:ring-2 group-aria-pressed:ring-orange-500 dark:bg-zinc-800">{c.icon}</span>
                  )}
                </CategoryTile>
              ))}
            </>
          )}
        </div>

        <TrustStrip />

        {/* inline search — opened from the bottom nav, which also scrolls the
            page back to the top so this is reachable even mid-scroll */}
        {searchOpen && (
          <div className="mt-3">
            <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-3 dark:border-orange-500/25 dark:bg-zinc-900">
              <Search size={16} className="shrink-0 text-zinc-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('shop.search_placeholder')}
                style={{ backgroundColor: 'transparent' }}
                className="flex-1 text-[14px] text-zinc-800 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100"
              />
              {search && (
                <button onClick={() => setSearch('')} className="shrink-0 text-zinc-400" aria-label={t('shop.clear_search')}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {favIds.length > 0 && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setFavOnly((v) => !v)}
              aria-pressed={favOnly}
              className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition ${
                favOnly ? 'border-brand-500 bg-brand-500 text-white shadow-ember' : 'border-zinc-200 bg-white text-zinc-600 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300'
              }`}
            >
              <Heart size={13} className={favOnly ? 'fill-white' : ''} />
              {t('shop.favorites')} · {favIds.length}
            </button>
          </div>
        )}

        {/* product grid */}
        {loading ? (
          // Eight card-shaped placeholders matching ProductCard's own
          // proportions (aspect-[5/4] image + two text lines), in the same
          // grid the real cards will render into — so the skeleton doesn't
          // reflow into a different shape once data lands.
          <div className="mt-4 grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-soft-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900/80 dark:shadow-none dark:ring-orange-500/20">
                <Skeleton className="aspect-[5/4] w-full rounded-none" />
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <Skeleton className="h-3 w-4/5 rounded" />
                  <Skeleton className="h-3 w-2/5 rounded" />
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <Skeleton className="h-4 w-12 rounded" />
                    <Skeleton className="h-8 w-8 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="py-16 text-center text-sm text-zinc-400">{search ? t('shop.no_results', { q: search }) : t('shop.empty')}</p>
        ) : (
          <div id="menu-grid" className="mt-4 grid scroll-mt-28 grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-4">
            {visible.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onOpen={setDetail}
                onQuickAdd={(prod) => {
                  const vs = sellableVariants(prod);
                  // More than one size means the customer must choose —
                  // open the detail sheet instead of guessing for them.
                  // Exactly one (or none) size adds instantly, same as any
                  // other product's quick-add.
                  if (vs.length > 1) { setDetail(prod); return; }
                  add(prod, 1, [], [], vs[0] ?? null);
                }}
              />
            ))}
          </div>
        )}

        {/* Discreet staff/admin entry point. Once this page is installed as
            a standalone PWA (see vite.config.ts's manifest — start_url is
            always this customer menu) there's no address bar left to type
            /login into, so without a link somewhere in the UI itself,
            staff have no way at all to reach the dashboard. Kept tiny and
            muted so it doesn't read as a customer-facing action. */}
        <div className="mt-10 pb-2 text-center">
          <Link to="/login" className="text-[11px] font-medium text-zinc-400 transition hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400">
            {t('shop.staff_access')}
          </Link>
        </div>
      </div>

      {/* floating cart bar — sits just above the bottom nav */}
      {count > 0 && !trackerOpen && (
        <motion.button
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-4 bottom-[calc(88px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center justify-between rounded-full bg-gradient-to-r from-brand-500 to-brand-600 px-5 py-4 text-white shadow-ember-lg transition active:scale-[0.98]"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingBasket size={18} />
            {count} {count === 1 ? t('cart.items') : t('cart.items_plural')}
          </span>
          <span className="font-display text-[15px] font-bold">{t('shop.view_cart')} · {money(subtotal)}</span>
        </motion.button>
      )}

      {freeThreshold > 0 && count === 0 && !trackerOpen && !loading && (
        <FreeDeliveryBar
          threshold={freeThreshold}
          onClick={() => document.getElementById('menu-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
      )}

      {/* bottom nav — a floating pill: Menu / Search / order status */}
      <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-md items-center justify-around rounded-[28px] border border-zinc-200/80 bg-white/85 px-6 py-2.5 shadow-soft-xl backdrop-blur-xl md:max-w-3xl lg:max-w-5xl dark:border-orange-500/25 dark:bg-zinc-950/85 dark:shadow-[0_-8px_40px_-12px_rgba(255,106,0,0.35)]">
          <NavItem active={!searchOpen} icon={UtensilsCrossed} label={t('shop.nav_menu')} onClick={() => setSearchOpen(false)} />
          <NavItem
            active={searchOpen}
            icon={Search}
            label={t('shop.nav_search')}
            onClick={() => {
              setSearchOpen((v) => {
                const next = !v;
                if (next) window.scrollTo({ top: 0, behavior: 'smooth' });
                return next;
              });
            }}
          />
          <button
            onClick={() => {
              if (!order) return;
              setTrackerOpen(true);
              setOrderUnseen(false);
            }}
            disabled={!order}
            aria-label={t('shop.order_status_aria')}
            title={order ? undefined : t('shop.no_active_order')}
            className={`relative flex h-12 w-12 items-center justify-center rounded-full transition ${
              order ? 'bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[0_6px_20px_-4px_rgba(255,106,0,0.7)] active:scale-90' : 'bg-zinc-100 text-zinc-300 dark:bg-zinc-800 dark:text-zinc-600'
            }`}
          >
            <Bell size={20} />
            {orderUnseen && <span className="absolute -end-0.5 -top-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white dark:ring-zinc-950" />}
          </button>
        </div>
      </nav>

      <ProductSheet key={detail?.id ?? 'none'} product={detail} onClose={() => setDetail(null)} onAdd={(p, q, sauces, supplements, variant) => add(p, q, sauces, supplements, variant)} />
      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onPlaced={(o) => {
          stopAlarm();
          setReadyAlarmActive(false);
          // If this is the authoritative real order (id > 0) replace any optimistic placeholder
          setOrder((prev) => {
            if (prev && prev.id < 0 && o.id > 0) {
              localStorage.removeItem(LAST_ORDER_KEY);
            }
            return o;
          });
          setTrackerOpen(true);
          setOrderUnseen(true);
          localStorage.setItem(LAST_ORDER_KEY, String(o.id));
          if (o.order_token) saveOrderToken(o.id, o.order_token);
          // also migrate token if this was an optimistic -> real replacement: remove optimistic token key if any
          if (o.id > 0) {
            // optimistic token was never saved, but clean up any stale negative key
          }
        }}
        onRollback={(optimisticId) => {
          setOrder((prev) => (prev?.id === optimisticId ? null : prev));
          setTrackerOpen(false);
          localStorage.removeItem(LAST_ORDER_KEY);
        }}
      />
      {order && trackerOpen && (
        <OrderTracker
          order={order}
          onClose={() => setTrackerOpen(false)}
          onUpdate={(updated) =>
            setOrder((prev) => {
              // Same status-change handling as the background poller
              // above — this just covers the case where the tracker
              // itself is open and doing the polling instead.
              if (prev) handleStatusTransition(prev.status, updated);
              return updated;
            })
          }
        />
      )}
    </div>
  );
}
