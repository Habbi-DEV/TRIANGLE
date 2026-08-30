import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChefHat, Radio, ShoppingCart } from 'lucide-react';
import supabase from '../lib/supabase';
import { signInWithGoogle } from '../lib/googleAuth';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../lib/settings';
import { useLang } from '../lib/i18n';
import LanguageSwitch from '../components/LanguageSwitch';

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();
  const { t } = useLang();
  const settings = useSettings();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);

  // Wait until the profile's role has actually loaded before redirecting —
  // navigating straight to /admin as soon as `user` exists (the old
  // behaviour) always won 'the race' against role loading, so a
  // delivery_driver account never got routed anywhere but /admin.
  useEffect(() => {
    if (!user || loading) return;
    navigate(role === 'delivery_driver' ? '/driver' : '/admin', { replace: true });
  }, [user, role, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
    // No navigate() here on success — the effect above takes over once
    // AuthContext has resolved the signed-in user's role, and routes
    // delivery_driver accounts to /driver instead of /admin.
  };

  const handleGoogle = async () => {
    setError('');
    setGoogleBusy(true);
    try {
      await signInWithGoogle();
      // On success the browser is redirected to Google, so this component
      // unmounts here. We only reach the lines below if it failed to start.
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.error_generic'));
      setGoogleBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-2">
      {/* brand panel */}
      <div className="relative hidden overflow-hidden lg:block">
        <img src="/images/hero.jpg" alt="TRIANGLE restaurant" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600/90 via-burnt/80 to-zinc-950/90" />
        <div className="relative flex h-full flex-col justify-between p-10 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/15 text-2xl backdrop-blur">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="" className="h-full w-full object-contain" />
              ) : (
                '🍽️'
              )}
            </div>
            <span className="font-display text-2xl font-extrabold tracking-tight">TRIANGLE</span>
          </div>
          <div>
            <h2 className="font-display text-4xl font-extrabold leading-tight">
              {t('login.hero_title1')}<br />{t('login.hero_title2')}
            </h2>
            <ul className="mt-6 space-y-3 text-sm text-orange-50/90">
              <li className="flex items-center gap-3"><ShoppingCart size={16} /> {t('login.feature1')}</li>
              <li className="flex items-center gap-3"><Radio size={16} /> {t('login.feature2')}</li>
              <li className="flex items-center gap-3"><ChefHat size={16} /> {t('login.feature3')}</li>
            </ul>
          </div>
          <p className="text-xs text-orange-100/60">{t('login.footer')}</p>
        </div>
      </div>

      {/* form panel */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 lg:hidden">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden text-xl ${
                  settings?.logo_url ? '' : 'rounded-2xl bg-brand-500'
                }`}
              >
                {settings?.logo_url ? (
                  <img src={settings.logo_url} alt="" className="h-full w-full object-contain" />
                ) : (
                  '🍽️'
                )}
              </div>
              <span className="font-display text-xl font-extrabold">TRIANGLE</span>
            </div>
            <LanguageSwitch />
          </div>

          <h1 className="font-display text-2xl font-bold text-zinc-900">{t('login.staff_sign_in')}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t('login.access_dashboard')}</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-zinc-400">{t('login.email')}</label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                placeholder="you@restolink.com"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-zinc-400">{t('login.password')}</label>
              <input
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>}
            <button
              type="submit" disabled={busy}
              className="w-full rounded-xl bg-brand-500 py-3 font-display text-[15px] font-bold text-white shadow-lg shadow-orange-500/30 transition hover:bg-brand-600 active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? t('login.signing_in') : t('login.sign_in')}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs font-medium text-zinc-300">
            <div className="h-px flex-1 bg-zinc-100" /> {t('login.or')} <div className="h-px flex-1 bg-zinc-100" />
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleBusy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
            {googleBusy ? t('login.signing_in') : t('login.continue_google')}
          </button>

          <a href="/" className="mt-6 block text-center text-xs font-semibold text-zinc-400 hover:text-brand-600">
            {t('login.back_to_menu')}
          </a>
        </div>
      </div>
    </div>
  );
}
