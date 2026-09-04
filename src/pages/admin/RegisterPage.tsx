import { useEffect, useMemo, useState } from 'react';
import { Check, Droplet, Layers, Minus, Plus, Printer, Search, ShoppingCart, SlidersHorizontal, Trash2, X } from 'lucide-react';
import type { Category, Order, Product, RestaurantTable, Sauce, Supplement } from '../../lib/types';
import { api } from '../../lib/api';
import { money, orderNumber, timeAgo } from '../../lib/format';
import { printInvoice } from '../../lib/invoice';
import { useCartStore, selectSubtotal, lineKey } from '../../stores/cartStore';
import { useSettings } from '../../lib/settings';
import { useLang } from '../../lib/i18n';
import useLiveOrders from '../../hooks/useLiveOrders';
import StatusBadge from '../../components/StatusBadge';
import { OrderTypeTag, orderContext } from '../../components/OrderTypeTag';
import Spinner from '../../components/ui/Spinner';
import type { OrderType } from '../../lib/types';

// Same treatment as the category rail / sauce swatches on the customer
// e-menu (MenuPage / ProductSheet) — stacked drop-shadows trace the tile's
// own alpha silhouette instead of a rectangular ring, so a transparent-PNG
// category photo reads as "lit up" rather than boxed. Kept identical here
// so the cashier's category rail looks like the same design system as the
// front-of-house menu, not a second visual language.
const CATEGORY_SELECTED_FILTER =
  'drop-shadow(0 0 0.75px #ffffff) drop-shadow(0 0 0.75px #ffffff) drop-shadow(0 0 1.5px #f97316) drop-shadow(0 0 3px rgba(249,115,22,0.55))';

// Sauce/supplement swatch selected-state — identical filter to
// ProductSheet's SELECTED_FILTER so a sauce picked here looks the same way
// it would from the customer-facing product sheet.
const EXTRA_SELECTED_FILTER =
  'drop-shadow(0 0 1.5px #22c55e) drop-shadow(0 0 1.5px #22c55e) drop-shadow(0 0 3px rgba(34,197,94,0.65)) drop-shadow(0 0 6px rgba(34,197,94,0.35))';

const TYPES: { value: OrderType; labelKey: string; emoji: string }[] = [
  { value: 'dine_in', labelKey: 'orderType.dine_in', emoji: '🍽️' },
  { value: 'takeaway', labelKey: 'orderType.takeaway', emoji: '🥡' },
  { value: 'delivery', labelKey: 'orderType.delivery', emoji: '🛵' },
];

export default function RegisterPage() {
  const { t } = useLang();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'ticket' | 'live'>('ticket');
  const [flash, setFlash] = useState('');
  // Grid mode: 'products' is the normal category-filtered product grid;
  // 'extras' swaps it for the standalone Sauces & Suppléments picker (see
  // request: these must be their own directly-reachable section, not
  // something buried inside a per-product modal). Toggled from a pinned
  // chip in the category rail, exactly like switching category.
  const [mode, setMode] = useState<'products' | 'extras'>('products');
  // Which ticket line the extras picker is currently editing. Auto-set to
  // the line just added whenever a product is tapped, and re-settable by
  // tapping any other line in the ticket — so "add sauces" is always just
  // one or two taps away, never a separate flow per product.
  const [activeLineKey, setActiveLineKey] = useState<string | null>(null);
  // Below `lg` the ticket/live panel is a slide-up sheet (like the
  // customer-facing cart) instead of a permanent side column — there just
  // isn't room for both the product grid and a full ticket side by side on
  // a phone/tablet screen.
  const [mobileTicketOpen, setMobileTicketOpen] = useState(false);

  const { orders, loading: feedLoading, refresh } = useLiveOrders(25, 5000);
  const settings = useSettings();

  const { lines, add, inc, dec, remove, clear, setLineExtras } = useCartStore();
  const subtotal = useCartStore(selectSubtotal);

  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  // Delivery fee only applies once "Delivery" is picked on the ticket.
  const deliveryFee = orderType === 'delivery' ? Number(settings?.delivery_fee ?? 0) : 0;
  const total = Math.round((subtotal + deliveryFee) * 100) / 100;
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [placing, setPlacing] = useState(false);

  const loadAll = () => {
    Promise.all([
      fetch('/api/categories').then((r) => r.json()),
      fetch('/api/products').then((r) => r.json()),
      fetch('/api/tables').then((r) => r.json()),
    ])
      .then(([c, p, t]) => {
        setCategories(Array.isArray(c) ? c : []);
        setProducts(Array.isArray(p) ? p : []);
        setTables(Array.isArray(t) ? t : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadAll, []);

  const visible = useMemo(() => {
    let list = products;
    if (activeCat !== 'all') list = list.filter((p) => p.category_id === activeCat);
    if (search.trim()) list = list.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [products, activeCat, search]);

  // The ticket line currently targeted by the extras picker, if any (it may
  // have been removed from the ticket entirely since it was selected).
  const targetLine = activeLineKey ? lines.find((l) => l.key === activeLineKey) : undefined;
  const targetSauces = (targetLine?.product.sauces ?? []).filter((s) => s.is_active);
  const targetSupplements = (targetLine?.product.supplements ?? []).filter((s) => s.is_active);

  const addProduct = (p: Product) => {
    add(p, 1);
    // A fresh tap always targets the plain (no add-ons yet) variant of this
    // product's line — matches add()'s own default of empty sauces/
    // supplements, so the key predicted here always matches the line add()
    // just created or incremented.
    setActiveLineKey(lineKey(p.id, [], []));
  };

  const toggleExtraSauce = (s: Sauce) => {
    if (!targetLine) return;
    const has = targetLine.sauces.some((x) => x.id === s.id);
    const nextSauces = has ? targetLine.sauces.filter((x) => x.id !== s.id) : [...targetLine.sauces, s];
    setLineExtras(targetLine.key, nextSauces, targetLine.supplements);
    setActiveLineKey(lineKey(targetLine.product.id, nextSauces, targetLine.supplements));
  };

  const toggleExtraSupplement = (s: Supplement) => {
    if (!targetLine) return;
    const has = targetLine.supplements.some((x) => x.id === s.id);
    const nextSupplements = has ? targetLine.supplements.filter((x) => x.id !== s.id) : [...targetLine.supplements, s];
    setLineExtras(targetLine.key, targetLine.sauces, nextSupplements);
    setActiveLineKey(lineKey(targetLine.product.id, targetLine.sauces, nextSupplements));
  };

  const placeOrder = async () => {
    const e: Record<string, string> = {};
    if (lines.length === 0) e.items = t('register.error_items');
    if (orderType === 'dine_in' && !tableNumber) e.table = t('register.error_table');
    if (orderType === 'delivery') {
      if (!name.trim()) e.name = t('register.error_name');
      if (phone.trim().replace(/\D/g, '').length < 6) e.phone = t('register.error_phone');
      if (!address.trim()) e.address = t('register.error_address');
    }
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setPlacing(true);
    try {
      const order = await api<Order>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          order_type: orderType,
          table_number: orderType === 'dine_in' ? tableNumber : undefined,
          customer_name: orderType === 'delivery' ? name : undefined,
          customer_phone: orderType === 'delivery' ? phone : undefined,
          delivery_address: orderType === 'delivery' ? address : undefined,
          notes: notes || undefined,
          // Algeria: cash only — the API forces this server-side too.
          payment_method: 'cash',
          items: lines.map((l) => ({
            product_id: l.product.id,
            quantity: l.qty,
            sauce_ids: l.sauces.map((s) => s.id),
            supplement_ids: l.supplements.map((s) => s.id),
          })),
        }),
      });
      clear();
      setActiveLineKey(null);
      setMode('products');
      setTableNumber(null); setName(''); setPhone(''); setAddress(''); setNotes('');
      setFlash(t('register.sent_to_kitchen', { n: orderNumber(order.id) }));
      setTimeout(() => setFlash(''), 3500);
      setTab('live');
      refresh();
      loadAll();
    } catch (err) {
      setErrors({ items: err instanceof Error ? err.message : t('register.error_generic') });
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="lg:flex lg:h-screen">
      {/* -------- product grid side -------- */}
      <div className="flex min-w-0 flex-col lg:flex-1 lg:overflow-hidden">
        <div className="border-b border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-xl font-bold text-zinc-900">{t('register.title')}</h1>
            <div className="relative ms-auto w-full sm:w-64">
              <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t('register.search_products')}
                className="w-full rounded-xl border border-zinc-200 py-2 ps-9 pe-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>
          {/* category rail — same visual language as the customer e-menu's
              rail (MenuPage): a photo tile when the category has one,
              falling back to its emoji in a rounded tile, with the same
              orange "lit silhouette" selected state. Kept as its own
              horizontal scroller here (compact icon-strip form) rather than
              the menu's larger circular tiles, since the register also
              needs room for the search bar above it — but the tile
              artwork, ordering, and selection treatment are identical so a
              cashier recognizes the same categories at a glance. A pinned
              "Sauces & Suppléments" chip always sits right after "Tout" —
              its own directly-reachable section rather than something
              buried inside a per-product screen. */}
          <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto pb-1 pt-1">
            <button
              onClick={() => { setMode('products'); setActiveCat('all'); }}
              className="flex shrink-0 flex-col items-center gap-1"
            >
              {settings === null ? (
                <span className="h-11 w-11" />
              ) : settings.all_category_image_url ? (
                <span className="flex h-11 w-11 items-center justify-center">
                  <img
                    src={settings.all_category_image_url}
                    alt=""
                    className="h-11 w-11 object-contain transition-[filter] duration-200"
                    style={mode === 'products' && activeCat === 'all' ? { filter: CATEGORY_SELECTED_FILTER } : undefined}
                  />
                </span>
              ) : (
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl text-lg transition ${
                    mode === 'products' && activeCat === 'all' ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-zinc-100'
                  }`}
                >
                  ✨
                </span>
              )}
              <span className={`max-w-[64px] truncate text-[10px] font-bold ${mode === 'products' && activeCat === 'all' ? 'text-brand-600' : 'text-zinc-500'}`}>
                {t('register.all')}
              </span>
            </button>

            <button
              onClick={() => setMode('extras')}
              className="flex shrink-0 flex-col items-center gap-1"
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-xl transition ${
                  mode === 'extras' ? 'bg-brand-50 text-brand-600 ring-2 ring-brand-500' : 'bg-zinc-100 text-zinc-500'
                }`}
              >
                <SlidersHorizontal size={19} />
              </span>
              <span className={`max-w-[64px] truncate text-[10px] font-bold ${mode === 'extras' ? 'text-brand-600' : 'text-zinc-500'}`}>
                {t('register.extras_tab')}
              </span>
            </button>

            {categories.filter((c) => c.is_active).map((c) => (
              <button
                key={c.id}
                onClick={() => { setMode('products'); setActiveCat(c.id); }}
                className="flex shrink-0 flex-col items-center gap-1"
              >
                {c.image_url ? (
                  <span className="flex h-11 w-11 items-center justify-center">
                    <img
                      src={c.image_url}
                      alt=""
                      className="h-11 w-11 object-contain transition-[filter] duration-200"
                      style={mode === 'products' && activeCat === c.id ? { filter: CATEGORY_SELECTED_FILTER } : undefined}
                    />
                  </span>
                ) : (
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-xl text-lg transition ${
                      mode === 'products' && activeCat === c.id ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-zinc-100'
                    }`}
                  >
                    {c.icon}
                  </span>
                )}
                <span className={`max-w-[64px] truncate text-[10px] font-bold ${mode === 'products' && activeCat === c.id ? 'text-brand-600' : 'text-zinc-500'}`}>
                  {c.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="thin-scroll p-4 pb-24 lg:flex-1 lg:overflow-y-auto lg:pb-4">
          {mode === 'extras' ? (
            <div>
              {!targetLine ? (
                <p className="py-16 text-center text-sm text-zinc-400">
                  {lines.length === 0 ? t('register.extras_empty_cart') : t('register.extras_select_item')}
                </p>
              ) : (
                <>
                  <div className="mb-4 flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-orange-50">
                      {targetLine.product.image_url && (
                        <img src={targetLine.product.image_url} alt="" className="h-full w-full object-cover" />
                      )}
                    </span>
                    <p className="min-w-0 truncate text-xs text-zinc-500">
                      <span className="font-bold text-zinc-800">{t('register.extras_editing')}</span> {targetLine.product.name}
                    </p>
                  </div>

                  {targetSauces.length === 0 && targetSupplements.length === 0 ? (
                    <p className="py-10 text-center text-xs text-zinc-400">{t('register.extras_none_for_item')}</p>
                  ) : (
                    <>
                      {targetSauces.length > 0 && (
                        <div className="mb-6">
                          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-400">{t('shop.sauces')}</p>
                          <div className="flex flex-wrap gap-4">
                            {targetSauces.map((s) => {
                              const active = targetLine.sauces.some((x) => x.id === s.id);
                              return (
                                <button key={s.id} onClick={() => toggleExtraSauce(s)} className="flex w-16 flex-col items-center gap-1.5">
                                  <span className="flex h-14 w-14 items-center justify-center">
                                    {s.image_url ? (
                                      <img
                                        src={s.image_url} alt=""
                                        className="h-14 w-14 object-contain transition-[filter] duration-200"
                                        style={active ? { filter: EXTRA_SELECTED_FILTER } : undefined}
                                      />
                                    ) : (
                                      <span
                                        className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 transition-[filter] duration-200"
                                        style={active ? { filter: EXTRA_SELECTED_FILTER } : undefined}
                                      >
                                        <Droplet size={18} />
                                      </span>
                                    )}
                                  </span>
                                  <span className={`truncate text-[11px] leading-tight ${active ? 'font-bold text-green-700' : 'font-semibold text-zinc-600'}`}>{s.name}</span>
                                  {s.price > 0 && <span className="-mt-1 text-[10px] text-zinc-400">+{money(s.price)}</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {targetSupplements.length > 0 && (
                        <div>
                          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-400">{t('shop.supplements')}</p>
                          <div className="flex flex-wrap gap-4">
                            {targetSupplements.map((s) => {
                              const active = targetLine.supplements.some((x) => x.id === s.id);
                              return (
                                <button key={s.id} onClick={() => toggleExtraSupplement(s)} className="flex w-16 flex-col items-center gap-1.5">
                                  <span className="flex h-14 w-14 items-center justify-center">
                                    {s.image_url ? (
                                      <img
                                        src={s.image_url} alt=""
                                        className="h-14 w-14 object-contain transition-[filter] duration-200"
                                        style={active ? { filter: EXTRA_SELECTED_FILTER } : undefined}
                                      />
                                    ) : (
                                      <span
                                        className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 transition-[filter] duration-200"
                                        style={active ? { filter: EXTRA_SELECTED_FILTER } : undefined}
                                      >
                                        <Layers size={18} />
                                      </span>
                                    )}
                                  </span>
                                  <span className={`truncate text-[11px] leading-tight ${active ? 'font-bold text-green-700' : 'font-semibold text-zinc-600'}`}>{s.name}</span>
                                  {s.price > 0 && <span className="-mt-1 text-[10px] text-zinc-400">+{money(s.price)}</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          ) : loading ? (
            <Spinner label={t('register.loading_products')} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5">
              {visible.map((p) => {
                const disabled = !p.is_available || p.stock <= 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => !disabled && addProduct(p)}
                    disabled={disabled}
                    className={`group overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-zinc-100 transition hover:shadow-md active:scale-[0.98] ${disabled ? 'opacity-50' : ''}`}
                  >
                    <div className="relative h-24 bg-orange-50">
                      {p.image_url && <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover" />}
                      {p.stock > 0 && p.stock <= 8 && (
                        <span className="absolute end-1.5 top-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold text-amber-950">{p.stock} {t('register.left')}</span>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="truncate text-xs font-semibold text-zinc-900">{p.name}</p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="font-display text-sm font-bold text-burnt">{money(p.price)}</span>
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-brand-600 opacity-0 transition group-hover:opacity-100"><Plus size={13} /></span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* -------- mobile/tablet: backdrop + floating ticket button -------- */}
      {mobileTicketOpen && (
        <div
          className="fixed inset-0 z-20 bg-zinc-950/40 lg:hidden"
          onClick={() => setMobileTicketOpen(false)}
        />
      )}
      {!mobileTicketOpen && (
        <button
          type="button"
          onClick={() => setMobileTicketOpen(true)}
          className="fixed inset-x-4 z-30 flex items-center justify-between gap-3 rounded-full bg-zinc-900 px-5 py-3.5 text-white shadow-2xl transition active:scale-[0.98] lg:hidden"
          style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <ShoppingCart size={18} />
            {t('register.ticket')}
            {lines.length > 0 && (
              <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-bold">{lines.length}</span>
            )}
          </span>
          <span className="font-display text-sm font-extrabold">{money(total)}</span>
        </button>
      )}

      {/* -------- right panel: ticket / live feed -------- */}
      <aside
        className={`${mobileTicketOpen ? 'flex' : 'hidden'} fixed inset-x-0 bottom-0 z-30 max-h-[85vh] w-full flex-col rounded-t-3xl border-t border-zinc-200 bg-white shadow-2xl lg:static lg:z-auto lg:flex lg:max-h-none lg:w-[380px] lg:shrink-0 lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none`}
      >
        {/* mobile-only grabber + close (this panel is a permanent side
            column on lg — the close control only makes sense as a sheet) */}
        <div className="shrink-0 lg:hidden">
          <div className="flex justify-center pt-2"><span className="h-1.5 w-10 rounded-full bg-zinc-200" /></div>
          <div className="flex items-center justify-between px-4 pt-1.5">
            <p className="font-display text-sm font-bold text-zinc-900">{t('register.title')}</p>
            <button
              onClick={() => setMobileTicketOpen(false)}
              className="rounded-full p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
              aria-label={t('common.close')}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex shrink-0 border-b border-zinc-100">
          {(['ticket', 'live'] as const).map((tabKey) => (
            <button
              key={tabKey} onClick={() => setTab(tabKey)}
              className={`flex-1 py-3 text-sm font-bold transition ${tab === tabKey ? 'border-b-2 border-brand-500 text-brand-600' : 'text-zinc-400 hover:text-zinc-600'}`}
            >
              {tabKey === 'ticket' ? `${t('register.ticket')}${lines.length ? ` (${lines.length})` : ''}` : t('register.live_feed')}
            </button>
          ))}
        </div>

        {flash && <div className="mx-3 mt-3 shrink-0 rounded-xl bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700">{flash}</div>}

        {tab === 'ticket' ? (
          <div className="thin-scroll flex flex-1 flex-col overflow-y-auto p-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
            {/* order type */}
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map((opt) => (
                <button
                  key={opt.value} onClick={() => setOrderType(opt.value)}
                  className={`rounded-xl border-2 py-2 text-center transition ${orderType === opt.value ? 'border-brand-500 bg-brand-50' : 'border-zinc-100 hover:border-zinc-200'}`}
                >
                  <span className="block text-base">{opt.emoji}</span>
                  <span className={`text-[11px] font-bold ${orderType === opt.value ? 'text-brand-700' : 'text-zinc-500'}`}>{t(opt.labelKey)}</span>
                </button>
              ))}
            </div>

            {/* conditional fields */}
            {orderType === 'dine_in' && (
              <div className="mt-3">
                <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-6">
                  {tables.map((tbl) => (
                    <button
                      key={tbl.id} onClick={() => tbl.status !== 'occupied' && setTableNumber(tbl.table_number)}
                      disabled={tbl.status === 'occupied' && tableNumber !== tbl.table_number}
                      title={`${tbl.table_number} · ${tbl.status}`}
                      className={`rounded-lg py-1.5 text-xs font-bold transition ${
                        tableNumber === tbl.table_number ? 'bg-brand-500 text-white' :
                        tbl.status === 'occupied' ? 'bg-zinc-100 text-zinc-300' :
                        tbl.status === 'reserved' ? 'bg-indigo-50 text-indigo-400' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                      }`}
                    >
                      {tbl.table_number}
                    </button>
                  ))}
                </div>
                {errors.table && <p className="mt-1 text-[11px] font-medium text-red-500">{errors.table}</p>}
              </div>
            )}
            {orderType === 'delivery' && (
              <div className="mt-3 space-y-2">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('register.customer_name')} className={`w-full rounded-lg border px-3 py-2 text-xs outline-none ${errors.name ? 'border-red-300' : 'border-zinc-200'}`} />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('register.phone')} className={`w-full rounded-lg border px-3 py-2 text-xs outline-none ${errors.phone ? 'border-red-300' : 'border-zinc-200'}`} />
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('register.delivery_address')} className={`w-full rounded-lg border px-3 py-2 text-xs outline-none ${errors.address ? 'border-red-300' : 'border-zinc-200'}`} />
              </div>
            )}

            {/* items */}
            <div className="mt-4 flex-1">
              {lines.length === 0 ? (
                <p className="py-8 text-center text-xs text-zinc-400">{t('register.tap_to_build')}</p>
              ) : (
                <ul className="space-y-2">
                  {lines.map((l) => {
                    const hasExtras = (l.product.sauces?.some((s) => s.is_active) || l.product.supplements?.some((s) => s.is_active));
                    const extraNames = [...l.sauces, ...l.supplements].map((s) => s.name);
                    return (
                      <li
                        key={l.key}
                        onClick={() => setActiveLineKey(l.key)}
                        className={`flex items-center gap-2 rounded-xl p-2 transition ${
                          activeLineKey === l.key ? 'bg-brand-50 ring-2 ring-brand-400' : 'bg-zinc-50'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-zinc-900">{l.product.name}</p>
                          <p className="text-[11px] text-zinc-400">{money(l.product.price)} × {l.qty}</p>
                          {extraNames.length > 0 && (
                            <p className="truncate text-[10px] text-brand-600">+ {extraNames.join(', ')}</p>
                          )}
                        </div>
                        {hasExtras && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setActiveLineKey(l.key); setMode('extras'); setMobileTicketOpen(false); }}
                            title={t('register.extras_tab')}
                            aria-label={t('register.extras_tab')}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-brand-500 shadow-sm"
                          >
                            <SlidersHorizontal size={12} />
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); dec(l.key); }} className="flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm"><Minus size={11} /></button>
                        <span className="w-4 text-center text-xs font-bold">{l.qty}</span>
                        <button onClick={(e) => { e.stopPropagation(); inc(l.key); }} className="flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm"><Plus size={11} /></button>
                        <button onClick={(e) => { e.stopPropagation(); remove(l.key); if (activeLineKey === l.key) setActiveLineKey(null); }} className="text-zinc-300 hover:text-red-500"><Trash2 size={14} /></button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {errors.items && <p className="mt-2 text-[11px] font-medium text-red-500">{errors.items}</p>}
            </div>

            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('register.ticket_notes')} className="mt-3 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs outline-none" />

            {/* totals + CTA */}
            <div className="mt-3 space-y-1 border-t border-dashed border-zinc-200 pt-3 text-xs">
              <div className="flex justify-between text-zinc-500"><span>{t('common.subtotal')}</span><span>{money(subtotal)}</span></div>
              {deliveryFee > 0 && (
                <div className="flex justify-between text-zinc-500"><span>{t('common.delivery_fee')}</span><span>{money(deliveryFee)}</span></div>
              )}
              <div className="flex justify-between font-display text-base font-bold text-zinc-900"><span>{t('common.total')}</span><span className="text-burnt">{money(total)}</span></div>
            </div>
            <button
              onClick={placeOrder} disabled={placing}
              className="mt-3 w-full rounded-xl bg-brand-500 py-3 font-display text-sm font-bold text-white shadow-lg shadow-orange-500/30 transition hover:bg-brand-600 active:scale-[0.98] disabled:opacity-60"
            >
              {placing ? t('register.sending') : t('register.place_order')}
            </button>
          </div>
        ) : (
          <div className="thin-scroll flex-1 overflow-y-auto p-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
            {feedLoading ? (
              <Spinner />
            ) : orders.length === 0 ? (
              <p className="py-10 text-center text-xs text-zinc-400">{t('register.waiting_first_order')}</p>
            ) : (
              <ul className="space-y-2">
                {orders.map((o) => (
                  <li key={o.id} className="rounded-xl border border-zinc-100 p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-bold">{orderNumber(o.id)}</span>
                      <OrderTypeTag type={o.order_type} />
                      <span className="ms-auto text-[10px] text-zinc-400">{timeAgo(o.created_at)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[11px] text-zinc-500">{orderContext(o)}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold">{money(o.total)}</span>
                        <button
                          onClick={() => printInvoice(o)}
                          title={t('register.print_invoice')}
                          aria-label={t('register.print_invoice')}
                          className="flex h-6 w-6 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-50 hover:text-brand-600"
                        >
                          <Printer size={13} />
                        </button>
                        <StatusBadge status={o.status} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={refresh} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-200 py-2 text-xs font-bold text-zinc-500 hover:bg-zinc-50">
              <Check size={13} /> {t('register.refresh_feed')}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
