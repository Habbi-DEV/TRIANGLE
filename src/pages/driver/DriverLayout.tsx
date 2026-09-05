import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bike, ListChecks, History, LogOut } from 'lucide-react';
import supabase from '../../lib/supabase';
import { useSettings } from '../../lib/settings';
import { useLang } from '../../lib/i18n';
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
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-zinc-200 driver-dark:border-zinc-800 bg-white/95 driver-dark:bg-zinc-950/95 backdrop-blur">
      {TABS.map(({ to, labelKey, icon: Icon, end }) => {
        const badge = to === '/driver/available' ? orders.length : 0;
        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `relative flex flex-1 flex-col items-center gap-1 py-3 text-xs font-bold transition ${
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

  const logout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className={`flex min-h-screen flex-col bg-zinc-100 driver-dark:bg-zinc-950 ${dark ? 'driver-dark' : ''}`}>
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between bg-zinc-950 px-4 py-3 shadow-md">
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
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <DriverAvailableProvider>
        <NewOrdersBanner />

        {/* Page content */}
        <main className="flex-1 px-4 py-4 pb-24">
          <Outlet />
        </main>

        <BottomNav />
      </DriverAvailableProvider>
    </div>
  );
}
