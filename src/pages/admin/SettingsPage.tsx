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
  logo_url: string;
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

const toForm = (s: Settings): FormState => ({
  restaurant_name: s.restaurant_name,
  logo_url: s.logo_url,
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
  const [uploading, setUploading] = useState(false);
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

  const dirty = !!saved && !!form && JSON.stringify(toForm(saved)) !== JSON.stringify(form);

  const uploadLogo = async (file: File) => {
    setUploading(true);
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
        body: JSON.stringify({ fileName: file.name, fileBase64: base64, contentType: file.type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      set('logo_url', data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
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
          disabled={saving || uploading || !dirty}
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

        <Field label={t('settings.logo')}>
          <div className="flex items-center gap-3">
            {form.logo_url ? (
              <img src={form.logo_url} alt="" className="h-14 w-14 rounded-xl object-cover ring-1 ring-zinc-200" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-50 text-zinc-300"><ImagePlus size={20} /></div>
            )}
            <label className="cursor-pointer rounded-xl border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-50">
              {uploading ? t('settings.uploading') : t('settings.upload_logo')}
              <input type="file" accept="image/*,.heic,.heif,.avif,.webp,.gif,.bmp,.tiff" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            </label>
          </div>
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
            <span className="h-8 w-8 shrink-0 rounded-lg ring-1 ring-zinc-200" style={{ backgroundColor: form.brand_color }} />
            <input value={form.brand_color} onChange={(e) => set('brand_color', e.target.value)} className={`${inputCls} max-w-[140px] font-mono`} />
          </div>
        </Field>
        <p className="text-[11px] text-zinc-400">
          {t('settings.brand_color.note1')}<code className="rounded bg-zinc-100 px-1 py-0.5">brand-500</code>{t('settings.brand_color.note2')}
        </p>
      </Card>
    </div>
  );
}
