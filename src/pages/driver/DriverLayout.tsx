import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bike, ListChecks, LogOut } from 'lucide-react';
import supabase from '../../lib/supabase';
import { useSettings } from '../../lib/settings';
import { useLang } from '../../lib/i18n';
import LanguageSwitch from '../../components/LanguageSwitch';

const TABS = [
  { to: '/driver', labelKey: 'driver.nav.active', icon: Bike, end: true },
  { to: '/driver/available', labelKey: 'driver.nav.available', icon: ListChecks, end: false },
];

export default function DriverLayout() {
  const navigate = useNavigate();
  const { t } = useLang();
  const settings = useSettings();

  const logout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-100">
      {/* Top bar */}
      <header className="sticky top-0 z-10 flex items-center justify-between bg-zinc-950 px-4 py-3 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center text-base ${settings?.logo_url ? '' : 'rounded-lg bg-brand-500'}`}>
            {settings?.logo_url ? <img src={settings.logo_url} alt="" className="h-full w-full object-contain" /> : '🛵'}
          </div>
          <div>
            <p className="font-display text-sm font-extrabold leading-none text-white">{settings?.restaurant_name || 'TRIANGLE'}</p>
            <p className="text-[10px] font-medium tracking-wide text-zinc-500">{t('driver.title')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitch compact />
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

      {/* Page content */}
      <main className="flex-1 px-4 py-4 pb-24">
        <Outlet />
      </main>

      {/* Bottom tab nav — thumb-reachable, large targets */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-zinc-200 bg-white/95 backdrop-blur">
        {TABS.map(({ to, labelKey, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-3 text-xs font-bold transition ${
                isActive ? 'text-brand-600' : 'text-zinc-400'
              }`
            }
          >
            <Icon size={22} />
            {t(labelKey)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
