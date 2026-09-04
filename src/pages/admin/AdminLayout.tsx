import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Armchair, Database, ExternalLink, LayoutDashboard, LogOut,
  Package, ReceiptText, Settings, ShoppingCart, UsersRound, UtensilsCrossed,
} from 'lucide-react';
import supabase from '../../lib/supabase';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../lib/settings';
import { useLang } from '../../lib/i18n';
import LanguageSwitch from '../../components/LanguageSwitch';
import SoundAlertBanner from '../../components/shared/SoundAlertBanner';
import useNewOrderAlert from '../../hooks/useNewOrderAlert';
import { unlockChime, isChimeUnlocked } from '../../lib/chime';
import { orderNumber } from '../../lib/format';
import type { Stats } from '../../lib/types';

const NAV = [
  { to: '/admin', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/register', labelKey: 'nav.register', icon: ShoppingCart, end: false },
  { to: '/admin/orders', labelKey: 'nav.orders', icon: ReceiptText, end: false, badge: true },
  { to: '/admin/menu', labelKey: 'nav.menu', icon: UtensilsCrossed, end: false },
  { to: '/admin/tables', labelKey: 'nav.tables', icon: Armchair, end: false },
  { to: '/admin/inventory', labelKey: 'nav.inventory', icon: Package, end: false },
  { to: '/admin/schema', labelKey: 'nav.schema', icon: Database, end: false },
  // Admin-only in practice: /api/settings PUT is guarded server-side by
  // requireAdmin (api/settings.js). There's no client-side role in
  // AuthContext yet to hide this link for non-admin staff, so any staff
  // member can open the page but only admins can actually save changes.
  { to: '/admin/settings', labelKey: 'nav.settings', icon: Settings, end: false },
  // Admin-only, and unlike the link above we CAN hide it client-side: the
  // page lists every teammate's email, so it's only shown when `role`
  // (from AuthContext) is 'admin'. /api/staff still enforces this itself.
  { to: '/admin/staff', labelKey: 'nav.staff', icon: UsersRound, end: false, adminOnly: true },
];

function Brand() {
  const settings = useSettings();
  return (
    <div className="flex items-center gap-2.5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center text-lg ${settings?.logo_url ? '' : 'rounded-xl bg-brand-500 shadow-md shadow-orange-500/40'}`}>
        {settings?.logo_url ? <img src={settings.logo_url} alt="" className="h-full w-full object-contain" /> : '🍽️'}
      </div>
      <div>
        <p className="font-display text-[15px] font-extrabold leading-none text-white">{settings?.restaurant_name || 'TRIANGLE'}</p>
        <p className="text-[10px] font-medium tracking-wide text-zinc-500">POS · RMS</p>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { t } = useLang();
  const settings = useSettings();
  const nav = NAV.filter((n) => !n.adminOnly || role === 'admin');
  // Real active-order total from /api/stats, not a count over the latest
  // 60 fetched orders — that cap meant the badge silently stopped
  // climbing once there were more than 60 orders in play.
  const [activeCount, setActiveCount] = useState(0);
  useEffect(() => {
    const load = () => api<Stats>('/api/stats').then((s) => setActiveCount(s.active_orders)).catch(console.error);
    load();
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, []);

  // New-order alarm: rings continuously (see useNewOrderAlert) until a
  // staff member hits "stop" below, or every order it's flagged has been
  // handled elsewhere. Lives here (not on the Orders page) so it fires no
  // matter which admin screen someone happens to be looking at.
  // Defaults to on while settings is still loading (null), matching the
  // toggle's own default in the DB.
  const soundEnabled = settings ? settings.new_order_sound_enabled : true;
  const { newOrders, dismiss } = useNewOrderAlert(soundEnabled);

  // Browsers block audio without a prior user gesture, and this alarm is
  // triggered from a background poll, not a click — so unlock the audio
  // context as early as possible.
  //
  // Two paths, because a single "first pointerdown, once" listener misses
  // the most common real case: staff reach /admin by clicking "Sign in" on
  // /login, then never touch the screen again while just watching for
  // orders — exactly the situation this alarm exists for. That click
  // happens on a different route, before AdminLayout (and this listener)
  // even mounts, so it's never seen here. But since it's a client-side
  // route change (no full reload), the browser's "user activation" from
  // that click is still in effect on this same document — so an
  // *immediate* unlock attempt on mount typically succeeds using it.
  //
  // The event listeners below are the fallback for whenever that doesn't
  // apply (e.g. a hard refresh landed straight on /admin via a persisted
  // session, so there was no earlier click at all): unlike the previous
  // `{ once: true }` version, this keeps trying on every gesture — not
  // just the first — until the context is actually confirmed running, so
  // one failed attempt can't lock the alarm out for the rest of the visit.
  const [soundUnlocked, setSoundUnlocked] = useState(isChimeUnlocked());
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

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition ${
      isActive ? 'bg-brand-500 text-white shadow-md shadow-orange-500/30' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
    }`;

  return (
    <div className="min-h-screen bg-zinc-100">
      {/* Last-resort manual unlock: covers the rare browser where neither
          the immediate attempt nor a generic pointerdown/keydown above
          actually got the context running. One deliberate tap here always
          works, since it's a direct click on this exact element. */}
      {!soundUnlocked && (
        <button
          type="button"
          onClick={() => {
            unlockChime();
            if (isChimeUnlocked()) setSoundUnlocked(true);
          }}
          className="fixed bottom-4 end-4 z-[100] rounded-full bg-zinc-900 px-4 py-2.5 text-xs font-bold text-white shadow-lg transition hover:bg-zinc-800 active:scale-95"
        >
          🔔 {t('orders.enable_sound')}
        </button>
      )}
      {newOrders.length > 0 && (
        <SoundAlertBanner
          message={
            newOrders.length === 1
              ? t('orders.new_order_alert_one', { id: orderNumber(newOrders[0].id) })
              : t('orders.new_order_alert_many', { n: newOrders.length })
          }
          stopLabel={t('orders.stop_alert')}
          onStop={dismiss}
        />
      )}
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 flex-col bg-zinc-950 p-4 lg:flex">
        <Brand />
        <div className="mt-4"><LanguageSwitch /></div>
        <nav className="mt-4 flex-1 space-y-1.5">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkCls}>
              <n.icon size={17} />
              {t(n.labelKey)}
              {n.badge && activeCount > 0 && (
                <span className="ms-auto rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-white">{activeCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100">
          <ExternalLink size={15} /> {t('nav.customer_menu')}
        </a>
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 font-display text-sm font-bold text-white">
            {(user?.email || 'S')[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-white">{user?.email}</p>
            <p className="text-[10px] text-zinc-500">{t('nav.administrator')}</p>
          </div>
          <button onClick={signOut} className="text-zinc-500 transition hover:text-red-400" aria-label={t('nav.sign_out')}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-40 bg-zinc-950 px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))] lg:hidden">
        <div className="flex items-center justify-between">
          <Brand />
          <div className="flex items-center gap-2">
            <LanguageSwitch compact />
            <a href="/" target="_blank" rel="noreferrer" className="text-zinc-400"><ExternalLink size={17} /></a>
            <button onClick={signOut} className="text-zinc-400" aria-label={t('nav.sign_out')}><LogOut size={17} /></button>
          </div>
        </div>
        <nav className="no-scrollbar -mx-1 mt-3 flex gap-1 overflow-x-auto px-1">
          {nav.map((n) => (
            <NavLink
              key={n.to} to={n.to} end={n.end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  isActive ? 'bg-brand-500 text-white' : 'text-zinc-400'
                }`
              }
            >
              <n.icon size={13} /> {t(n.labelKey)}
              {n.badge && activeCount > 0 && <span className="rounded-full bg-white/20 px-1.5 text-[10px] font-bold">{activeCount}</span>}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="min-h-screen lg:ps-64">
        <Outlet />
      </main>
    </div>
  );
}
