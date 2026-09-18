import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bike, ListChecks, History, LogOut } from 'lucide-react';
import supabase from '../../lib/supabase';
import { useSettings } from '../../lib/settings';
import { useLang } from '../../lib/i18n';
import { unlockChime, isChimeUnlocked } from '../../lib/chime';
import { secureSignOut } from '../../lib/security';
import LanguageSwitch from '../../components/LanguageSwitch';
import AppLogo from '../../components/AppLogo';
import OnlineToggle from '../../components/driver/OnlineToggle';
import DarkModeToggle from '../../components/driver/DarkModeToggle';
import NewOrdersBanner from '../../components/driver/NewOrdersBanner';
import useDriverDarkMode from '../../hooks/useDriverDarkMode';
import { DriverAvailableProvider, useDriverAvailable } from '../../contexts/DriverAvailableContext';

const TABS = [
  { to: '/driver', labelKey: 'driver.nav.active', icon: Bike, end: true },
  { to: '/driver/available', labelKey: 'driver.nav.available', icon: ListChecks, end: false },
  { to: '/driver/history', labelKey: 'driver.nav.history', icon: History, end: false },
];

/** Bottom tab nav — thumb-reachable, large targets. Lives inside
 *  DriverAvailableProvider so the "Available" tab can show a live badge
 *  without a second subscription to the same feed. */
function BottomNav() {
  const { t } = useLang();
  const { orders } = useDriverAvailable();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-zinc-200 driver-dark:border-zinc-800 bg-white/95 driver-dark:bg-zinc-950/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map(({ to, labelKey, icon: Icon, end }) => {
        const badge = to === '/driver/available' ? orders.length : 0;
        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2.5 text-[11px] font-bold transition active:scale-95 ${
                isActive ? 'text-brand-600' : 'text-zinc-400'
              }`
            }
          >
            <span className="relative">
              <Icon size={22} />
              {badge > 0 && (
                <span className="absolute -end-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-extrabold leading-none text-white">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </span>
            <span className="w-full truncate text-center leading-tight">{t(labelKey)}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export default function DriverLayout() {
  const navigate = useNavigate();
  const { t } = useLang();
  const settings = useSettings();
  const { dark, toggle: toggleDark } = useDriverDarkMode();

  // NewOrdersBanner sticks directly under this header. It used to hardcode
  // `top-[57px]`, which was already a guess and breaks outright now that
  // the header has two rows — and it never accounted for the iOS safe-area
  // inset either. Publish the real measured height as a CSS variable
  // instead, re-measured whenever the header resizes (safe-area changes,
  // a longer restaurant name wrapping, the availability row appearing
  // after its loading skeleton).
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const publish = () => {
      document.documentElement.style.setProperty('--driver-header-h', `${el.getBoundingClientRect().height}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--driver-header-h');
    };
  }, []);

  // Unlocks the Web Audio context that DriverAvailableContext's new-order
  // chime needs (see lib/chime.ts) — without this, playNewOrderChime() ran
  // on every new order but silently did nothing, because the browser
  // blocks audio that never started from a real user gesture. AdminLayout
  // and MenuPage already do this; the driver shell was simply missing it,
  // which is exactly why sound never worked there while it worked
  // everywhere else in the app.
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

  const logout = async () => {
    try {
      await secureSignOut(supabase);
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className={`flex min-h-screen flex-col bg-zinc-100 driver-dark:bg-zinc-950 ${dark ? 'driver-dark' : ''}`}>
      {/* Top bar — two rows on purpose (mobile-first): the brand and the
          icon actions share row 1, and the availability switch owns row 2.
          Cramming all five controls onto one line is what made the
          "En ligne / Hors ligne" badge overflow on a phone. */}
      <header
        ref={headerRef}
        className="sticky top-0 z-30 bg-zinc-950 px-3 pb-2.5 shadow-md sm:px-4"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* Same case as the admin sidebar: this top bar is zinc-950 whether
                or not the driver has turned on the dashboard's dark mode, so the
                white wordmark is forced rather than tied to a theme. */}
            <AppLogo
              variant="dark"
              className="flex h-9 w-9 shrink-0 items-center justify-center text-base"
              fallbackClassName="rounded-lg bg-brand-500"
              fallback="🛵"
            />
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-extrabold leading-none text-white">{settings?.restaurant_name || 'TRIANGLE'}</p>
              <p className="truncate text-[10px] font-medium tracking-wide text-zinc-500">{t('driver.title')}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <LanguageSwitch compact />
            <DarkModeToggle dark={dark} onToggle={toggleDark} />
            <button
              type="button"
              onClick={logout}
              aria-label={t('driver.logout')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-800 hover:text-white active:scale-95"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        <div className="mt-2 sm:max-w-xs">
          <OnlineToggle />
        </div>
      </header>

      <DriverAvailableProvider>
        <NewOrdersBanner />

        {/* Page content */}
        <main
          className="w-full max-w-full flex-1 overflow-x-hidden px-3 py-3 sm:px-4 sm:py-4"
          style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
        >
          <Outlet />
        </main>

        <BottomNav />

        {/* Last-resort manual unlock — same fallback AdminLayout offers,
            for the rare browser where the pointerdown/keydown listeners
            above didn't catch a real user gesture in time. */}
        {!soundUnlocked && (
          <button
            type="button"
            onClick={() => {
              unlockChime();
              if (isChimeUnlocked()) setSoundUnlocked(true);
            }}
            className="fixed z-[100] rounded-full bg-zinc-900 px-4 py-2.5 text-xs font-bold text-white shadow-lg transition hover:bg-zinc-800 active:scale-95"
            style={{ insetInlineEnd: '1rem', bottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
          >
            🔔 {t('orders.enable_sound')}
          </button>
        )}
      </DriverAvailableProvider>
    </div>
  );
}
