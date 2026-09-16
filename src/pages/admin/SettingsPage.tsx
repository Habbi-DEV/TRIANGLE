import { useEffect, useState } from 'react';
import {
  Bell, Building2, ImagePlus, Palette, Save, Truck,
} from 'lucide-react';
import type { Settings } from '../../lib/types';
import { api } from '../../lib/api';
import supabase from '../../lib/supabase';
import { setCachedSettings } from '../../lib/settings';
import { useLang } from '../../lib/i18n';
import Spinner from '../../components/ui/Spinner';

// Editable subset of Settings — everything except id/updated_at, which the
// server owns. Numeric fields are kept as strings while editing (same
// pattern as MenuManagePage's product form) so the input can be empty
// mid-edit without fighting `type="number"`.
type FormState = {
  restaurant_name: string;
  /** Legacy single logo — no field of its own anymore, kept in the form so
   *  it can be mirrored from the light logo on save (see uploadLogo). */
  logo_url: string;
  light_logo_url: string;
  dark_logo_url: string;
  address: string;
  phone: string;
  contact_email: string;
  opening_hours: string;
  delivery_fee: string;
  delivery_min_order: string;
  new_order_sound_enabled: boolean;
  low_stock_threshold: string;
  brand_color: string;
};

/** The two editable logo slots — see src/lib/logo.ts for how they're read. */
type LogoKey = 'light_logo_url' | 'dark_logo_url';

const toForm = (s: Settings): FormState => ({
  restaurant_name: s.restaurant_name,
  logo_url: s.logo_url,
  // ?? '' — these are null on a deployment where migration_v17 hasn't run,
  // and an uncontrolled <input> would warn.
  light_logo_url: s.light_logo_url ?? '',
  dark_logo_url: s.dark_logo_url ?? '',
  address: s.address,
  phone: s.phone,
  contact_email: s.contact_email,
  opening_hours: s.opening_hours,
  delivery_fee: String(s.delivery_fee),
  delivery_min_order: String(s.delivery_min_order),
  new_order_sound_enabled: s.new_order_sound_enabled,
  low_stock_threshold: String(s.low_stock_threshold),
  brand_color: s.brand_color,
});

function Card({ icon: Icon, title, description, children }: {
  icon: typeof Building2; title: string; description: string; children: React.ReactNode;
}) {
  return (
    <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100 md:p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon size={17} /></div>
        <div>
          <h2 className="font-display text-sm font-bold text-zinc-900">{title}</h2>
          <p className="text-[11px] text-zinc-400">{description}</p>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Best-effort cleanup for what someone typed into the brand-color field —
 *  runs on blur, not on every keystroke, so it doesn't fight typing. Adds a
 *  missing '#', expands shorthand (#f60 -> #ff6600), and lowercases. Left
 *  untouched if it still doesn't match after this — that's what the inline
 *  warning below the field is for, instead of a save that silently fails on
 *  the server with every other change in the form. */
function normalizeHexColor(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  const shorthand = /^#([0-9a-fA-F]{3})$/.exec(withHash);
  const expanded = shorthand
    ? `#${shorthand[1].split('').map((c) => c + c).join('')}`
    : withHash;
  return HEX_COLOR_RE.test(expanded) ? expanded.toLowerCase() : trimmed;
}

const IMAGE_ACCEPT = 'image/*,.heic,.heif,.avif,.webp,.gif,.bmp,.tiff';

/** Upload / preview / clear for one of the two logo files. The preview sits
 *  on the background that file is actually meant for — white for the black
 *  wordmark, zinc-900 for the white one — so a white logo isn't invisible on
 *  the very screen where you upload it. */
function LogoPicker({ url, tone, busy, locked, hint, onPick, onClear }: {
  url: string;
  tone: 'light' | 'dark';
  busy: boolean;
  /** Another upload is in flight — don't let a second one race it. */
  locked: boolean;
  hint: string;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const { t } = useLang();
  const dark = tone === 'dark';

  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ${
          dark ? 'bg-zinc-900 ring-zinc-800' : 'bg-white ring-zinc-200'
        }`}
      >
        {url ? (
          <img src={url} alt="" className="h-full w-full object-contain p-1.5" />
        ) : (
          <ImagePlus size={20} className={dark ? 'text-zinc-600' : 'text-zinc-300'} />
        )}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <label
            className={`cursor-pointer rounded-xl border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 ${
              locked ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            {busy ? t('settings.uploading') : url ? t('settings.replace_logo') : t('settings.upload_logo')}
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Reset the input so picking the same file twice in a row
                // still fires onChange.
                e.target.value = '';
                if (file) onPick(file);
              }}
            />
          </label>
          {url && !busy && (
            <button type="button" onClick={onClear} className="text-xs font-bold text-zinc-400 transition hover:text-red-500">
              {t('settings.remove_logo')}
            </button>
          )}
        </div>
        <p className="mt-1 text-[11px] text-zinc-400">{hint}</p>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-sm font-semibold transition ${
        checked ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-zinc-200 text-zinc-500'
      }`}
    >
      {label}
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? 'bg-brand-500' : 'bg-zinc-300'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'left-4' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export default function SettingsPage() {
  const { t } = useLang();
  const [saved, setSaved] = useState<Settings | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<LogoKey | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s: Settings) => {
        setSaved(s);
        setForm(toForm(s));
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('settings.load_error')))
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof FormState,>(key: K, value: FormState[K]) => {
    setSuccess(false);
    setForm((f) => (f ? { ...f, [key]: value } : f));
  };

  /** Single writer for both logo slots. Writing the light one also mirrors
   *  `logo_url`: it's the column every pre-<AppLogo /> reader still points
   *  at (older SQL, exports), and the black wordmark is the safe file there
   *  since those surfaces are all light. Clearing follows the same rule —
   *  otherwise the stale legacy URL would keep showing through the fallback
   *  chain in lib/logo.ts and "remove" would look broken. */
  const setLogo = (key: LogoKey, url: string) => {
    set(key, url);
    if (key === 'light_logo_url') set('logo_url', url);
  };

  const dirty = !!saved && !!form && JSON.stringify(toForm(saved)) !== JSON.stringify(form);
  // Gate Save on this client-side, in addition to the server check — one bad
  // field here otherwise rejects the whole PUT (a single settings row),
  // silently discarding every other change in the same save, logos included.
  const brandColorValid = !!form && HEX_COLOR_RE.test(form.brand_color);

  /** Uploads into one of the two logo slots. Which slot is also the busy
   *  flag, so only the picker being used shows "uploading…". */
  const uploadLogo = async (file: File, key: LogoKey) => {
    setUploading(key);
    setError('');
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ fileName: file.name, fileBase64: base64, contentType: file.type, folder: 'Logo' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setLogo(key, String(data.url));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const payload = {
        ...form,
        delivery_fee: Number(form.delivery_fee) || 0,
        delivery_min_order: Number(form.delivery_min_order) || 0,
        low_stock_threshold: parseInt(form.low_stock_threshold, 10) || 0,
      };
      const updated = await api<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(payload) });
      setSaved(updated);
      setForm(toForm(updated));
      setCachedSettings(updated); // money() picks up any change immediately
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.save_error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) return <Spinner label={t('common.loading')} />;

  return (
    <div className="p-4 pb-28 md:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-zinc-900">{t('settings.title')}</h1>
          <p className="text-sm text-zinc-500">{t('settings.subtitle')}</p>
        </div>
        <button
          onClick={save}
          disabled={saving || uploading !== null || !dirty || !brandColorValid}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-500/30 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          <Save size={16} /> {saving ? t('common.saving') : dirty ? t('common.save') : t('common.saved')}
        </button>
      </div>

      {dirty && !saving && (
        <p className="mb-4 rounded-xl bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-700">{t('settings.unsaved')}</p>
      )}
      {success && <p className="mb-4 rounded-xl bg-brand-50 px-3.5 py-2 text-xs font-semibold text-brand-700">{t('settings.saved_msg')}</p>}
      {error && <p className="mb-4 rounded-xl bg-red-50 px-3.5 py-2 text-xs font-medium text-red-600">{error}</p>}

      {/* General */}
      <Card icon={Building2} title={t('settings.general')} description={t('settings.general.desc')}>
        <Field label={t('settings.restaurant_name')}>
          <input value={form.restaurant_name} onChange={(e) => set('restaurant_name', e.target.value)} className={inputCls} />
        </Field>

        {/* Two files, one brand. The app picks between them per surface —
            see src/lib/logo.ts and <AppLogo />. */}
        <Field label={t('settings.light_logo')}>
          <LogoPicker
            url={form.light_logo_url}
            tone="light"
            busy={uploading === 'light_logo_url'}
            locked={uploading !== null}
            hint={t('settings.light_logo.hint')}
            onPick={(file) => uploadLogo(file, 'light_logo_url')}
            onClear={() => setLogo('light_logo_url', '')}
          />
        </Field>

        <Field label={t('settings.dark_logo')}>
          <LogoPicker
            url={form.dark_logo_url}
            tone="dark"
            busy={uploading === 'dark_logo_url'}
            locked={uploading !== null}
            hint={t('settings.dark_logo.hint')}
            onPick={(file) => uploadLogo(file, 'dark_logo_url')}
            onClear={() => setLogo('dark_logo_url', '')}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('settings.address')}>
            <input value={form.address} onChange={(e) => set('address', e.target.value)} className={inputCls} />
          </Field>
          <Field label={t('settings.phone')}>
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label={t('settings.contact_email')}>
          <input type="email" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} className={inputCls} />
        </Field>
        <Field label={t('settings.opening_hours')}>
          <textarea
            value={form.opening_hours}
            onChange={(e) => set('opening_hours', e.target.value)}
            rows={2}
            placeholder={t('settings.opening_hours.placeholder')}
            className={`${inputCls} resize-none`}
          />
        </Field>
      </Card>

      {/* Order & delivery — Algeria: single currency (Da), no VAT, cash only */}
      <Card icon={Truck} title={t('settings.order_payment')} description={t('settings.order_payment.desc')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('settings.delivery_fee')}>
            <input value={form.delivery_fee} onChange={(e) => set('delivery_fee', e.target.value)} type="number" step="0.10" min="0" className={inputCls} />
          </Field>
          <Field label={t('settings.delivery_min_order')}>
            <input value={form.delivery_min_order} onChange={(e) => set('delivery_min_order', e.target.value)} type="number" step="0.10" min="0" className={inputCls} />
          </Field>
        </div>
        <p className="text-[11px] text-zinc-400">{t('settings.payment_note')}</p>
      </Card>

      {/* Notifications */}
      <Card icon={Bell} title={t('settings.notifications')} description={t('settings.notifications.desc')}>
        <Toggle checked={form.new_order_sound_enabled} onChange={(v) => set('new_order_sound_enabled', v)} label={t('settings.play_sound')} />
        <Field label={t('settings.low_stock_threshold')}>
          <input value={form.low_stock_threshold} onChange={(e) => set('low_stock_threshold', e.target.value)} type="number" min="0" className={inputCls} />
        </Field>
        <p className="text-[11px] text-zinc-400">{t('settings.low_stock_note')}</p>
      </Card>

      {/* Branding */}
      <Card icon={Palette} title={t('settings.branding')} description={t('settings.branding.desc')}>
        <Field label={t('settings.brand_color')}>
          <div className="flex items-center gap-3">
            {/* Native color picker doubles as the swatch — it always
                produces a valid #rrggbb, so this is the easiest way to
                never hit the error below in the first place. Falls back to
                the brand orange while the typed value is invalid, so the
                picker always has something sane to open with. */}
            <label
              className={`relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-lg ring-1 ${
                brandColorValid ? 'ring-zinc-200' : 'ring-red-300'
              }`}
            >
              <span
                className="absolute inset-0"
                style={{ backgroundColor: brandColorValid ? form.brand_color : '#f97316' }}
              />
              <input
                type="color"
                value={brandColorValid ? form.brand_color : '#f97316'}
                onChange={(e) => set('brand_color', e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label={t('settings.brand_color')}
              />
            </label>
            <input
              value={form.brand_color}
              onChange={(e) => set('brand_color', e.target.value)}
              onBlur={(e) => set('brand_color', normalizeHexColor(e.target.value))}
              placeholder="#f97316"
              className={`${inputCls} max-w-[140px] font-mono ${
                brandColorValid ? '' : 'border-red-300 focus:border-red-400 focus:ring-red-100'
              }`}
            />
          </div>
          {!brandColorValid && (
            <p className="mt-1.5 text-[11px] font-semibold text-red-500">{t('settings.brand_color.invalid')}</p>
          )}
        </Field>
        <p className="text-[11px] text-zinc-400">
          {t('settings.brand_color.note1')}<code className="rounded bg-zinc-100 px-1 py-0.5">brand-500</code>{t('settings.brand_color.note2')}
        </p>
      </Card>
    </div>
  );
}
