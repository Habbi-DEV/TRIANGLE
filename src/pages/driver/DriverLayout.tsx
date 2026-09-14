import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bike, ListChecks, History, LogOut } from 'lucide-react';
import supabase from '../../lib/supabase';
import { useSettings } from '../../lib/settings';
import { useLang } from '../../lib/i18n';
import { unlockChime, isChimeUnlocked } from '../../lib/chime';
import LanguageSwitch from '../../components/LanguageSwitch';
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
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-zinc-200 driver-dark:border-zinc-800 bg-white/95 driver-dark:bg-zinc-950/95 backdrop-blur"
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
              `relative flex flex-1 flex-col items-center gap-1 py-3 text-xs font-bold transition active:scale-95 ${
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
            {t(labelKey)}
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
    const { secureSignOut } = await import('../../lib/security');
    await secureSignOut(supabase);
    navigate('/login', { replace: true });
  };

  return (
    <div className={`flex min-h-screen flex-col bg-zinc-100 driver-dark:bg-zinc-950 ${dark ? 'driver-dark' : ''}`}>
      {/* Top bar */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between bg-zinc-950 px-4 pb-3 shadow-md"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center text-base ${settings?.logo_url ? '' : 'rounded-lg bg-brand-500'}`}>
            {settings?.logo_url ? <img src={settings.logo_url} alt="" className="h-full w-full object-contain" /> : '🛵'}
          </div>
          <div>
            <p className="font-display text-sm font-extrabold leading-none text-white">{settings?.restaurant_name || 'TRIANGLE'}</p>
            <p className="text-[10px] font-medium tracking-wide text-zinc-500">{t('driver.title')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <OnlineToggle />
          <LanguageSwitch compact />
          <DarkModeToggle dark={dark} onToggle={toggleDark} />
          <button
            type="button"
            onClick={logout}
            aria-label={t('driver.logout')}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-800 hover:text-white active:scale-95"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <DriverAvailableProvider>
        <NewOrdersBanner />

        {/* Page content */}
        <main
          className="flex-1 px-4 py-4"
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
