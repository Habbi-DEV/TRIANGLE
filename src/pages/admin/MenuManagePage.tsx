import { useEffect, useState } from 'react';
import { Droplet, ImagePlus, Layers, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Category, Product, ProductImage, Promotion, Sauce, Settings, Supplement } from '../../lib/types';
import { api } from '../../lib/api';
import supabase from '../../lib/supabase';
import { money } from '../../lib/format';
import { setCachedSettings, useSettings } from '../../lib/settings';
import { useLang } from '../../lib/i18n';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';

const EMPTY_FORM = {
  name: '',
  description: '',
  price: '',
  category_id: '',
  image_url: '',
  stock: '20',
  is_available: true,
};

export default function MenuManagePage() {
  const { t } = useLang();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sauces, setSauces] = useState<Sauce[]>([]);
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);

  const [newCat, setNewCat] = useState({ name: '', icon: '🍽️', image_url: '' });
  const [uploadingCategoryPhoto, setUploadingCategoryPhoto] = useState<'new' | number | null>(null);
  const [uploadingPromotion, setUploadingPromotion] = useState(false);
  const [uploadingAllIcon, setUploadingAllIcon] = useState(false);
  const settings = useSettings();
  const [newSauce, setNewSauce] = useState({ name: '', price: '', image_url: '' });
  const [savingSauce, setSavingSauce] = useState(false);
  const [uploadingSaucePhoto, setUploadingSaucePhoto] = useState<'new' | number | null>(null);
  const [newSupplement, setNewSupplement] = useState({ name: '', price: '', image_url: '' });
  const [savingSupplement, setSavingSupplement] = useState(false);
  const [uploadingSupplementPhoto, setUploadingSupplementPhoto] = useState<'new' | number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  // Gallery photos (in addition to the single cover `image_url`). Saved
  // products keep theirs in `gallery`; a brand-new product has nowhere to
  // attach photos to yet, so uploads sit in `pendingGallery` (URLs already
  // in storage) until `save()` creates the product and links them.
  const [gallery, setGallery] = useState<ProductImage[]>([]);
  const [pendingGallery, setPendingGallery] = useState<string[]>([]);
  const [galleryUploading, setGalleryUploading] = useState(false);

  // Which sauces and supplements (from the general catalogs above) this
  // specific product offers — set from `product.sauces` / `.supplements`
  // when editing, sent back as `sauce_ids` / `supplement_ids` on save.
  // Both are per-product picks that live on the product form itself.
  const [selectedSauceIds, setSelectedSauceIds] = useState<number[]>([]);
  const [selectedSupplementIds, setSelectedSupplementIds] = useState<number[]>([]);

  const load = () => {
    Promise.all([
      fetch('/api/categories').then((r) => r.json()),
      fetch('/api/products').then((r) => r.json()),
      fetch('/api/sauces').then((r) => r.json()),
      fetch('/api/sauces?type=supplement').then((r) => r.json()),
      fetch('/api/categories?type=promotion').then((r) => r.json()),
    ])
      .then(([c, p, s, sup, promos]) => {
        setCategories(Array.isArray(c) ? c : []);
        setProducts(Array.isArray(p) ? p : []);
        setSauces(Array.isArray(s) ? s : []);
        setSupplements(Array.isArray(sup) ? sup : []);
        setPromotions(Array.isArray(promos) ? promos : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const catName = (id: number | null) => categories.find((c) => c.id === id)?.name ?? '—';

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setGallery([]);
    setPendingGallery([]);
    setSelectedSauceIds([]);
    setSelectedSupplementIds([]);
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description,
      price: String(p.price),
      category_id: p.category_id ? String(p.category_id) : '',
      image_url: p.image_url,
      stock: String(p.stock),
      is_available: p.is_available,
    });
    setError('');
    setGallery(p.images ?? []);
    setPendingGallery([]);
    setSelectedSauceIds((p.sauces ?? []).map((s) => s.id));
    setSelectedSupplementIds((p.supplements ?? []).map((s) => s.id));
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.price || isNaN(Number(form.price))) {
      setError(t('menu.error_name_price'));
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      name: form.name.trim(),
      description: form.description,
      price: Number(form.price),
      category_id: form.category_id ? Number(form.category_id) : null,
      image_url: form.image_url,
      stock: Number(form.stock) || 0,
      is_available: form.is_available,
      sauce_ids: selectedSauceIds,
      supplement_ids: selectedSupplementIds,
    };
    try {
      if (editing) {
        await api('/api/products', { method: 'PUT', body: JSON.stringify({ id: editing.id, ...payload }) });
      } else {
        const created = await api<Product>('/api/products', { method: 'POST', body: JSON.stringify(payload) });
        // Flush any gallery photos uploaded before the product existed.
        if (pendingGallery.length) {
          await Promise.all(
            pendingGallery.map((url) =>
              api('/api/products?images=1', { method: 'POST', body: JSON.stringify({ product_id: created.id, url }) }),
            ),
          ).catch(console.error);
        }
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const removeProduct = async (p: Product) => {
    if (!confirm(t('menu.delete_product_confirm', { name: p.name }))) return;
    await api('/api/products', { method: 'DELETE', body: JSON.stringify({ id: p.id }) }).catch(console.error);
    load();
  };

  const toggleAvailable = async (p: Product) => {
    await api('/api/products', {
      method: 'PUT',
      body: JSON.stringify({ id: p.id, is_available: !p.is_available }),
    }).catch(console.error);
    load();
  };

  const addCategory = async () => {
    if (!newCat.name.trim()) return;
    await api('/api/categories', { method: 'POST', body: JSON.stringify(newCat) }).catch(console.error);
    setNewCat({ name: '', icon: '🍽️', image_url: '' });
    load();
  };

  const toggleCategory = async (c: Category) => {
    await api('/api/categories', { method: 'PUT', body: JSON.stringify({ id: c.id, is_active: !c.is_active }) }).catch(console.error);
    load();
  };

  const removeCategory = async (c: Category) => {
    if (!confirm(t('menu.delete_category_confirm', { name: c.name }))) return;
    await api('/api/categories', { method: 'DELETE', body: JSON.stringify({ id: c.id }) }).catch(console.error);
    load();
  };

  /** "All" isn't a real category row, so its photo lives on settings
   *  (all_category_image_url) instead of a per-category upload. Uses the
   *  shared settings cache (setCachedSettings) so the change shows up live
   *  on the e-menu too, same as a logo/name change on the Settings page. */
  const uploadAllCategoryImage = async (file: File) => {
    setUploadingAllIcon(true);
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
        body: JSON.stringify({ fileName: file.name, fileBase64: base64, contentType: file.type, folder: 'Categories' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('common.upload_failed'));
      const updated = await api<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify({ all_category_image_url: data.url }) });
      if (updated) setCachedSettings(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.upload_failed'));
    } finally {
      setUploadingAllIcon(false);
    }
  };

  /** Shared with both the "new category" form (target 'new') and an
   *  existing category's own square swatch (target = that category's id). */
  const uploadCategoryPhoto = async (file: File, target: 'new' | number) => {
    setUploadingCategoryPhoto(target);
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
        body: JSON.stringify({ fileName: file.name, fileBase64: base64, contentType: file.type, folder: 'Categories' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('common.upload_failed'));

      if (target === 'new') {
        setNewCat((c) => ({ ...c, image_url: data.url }));
      } else {
        await api('/api/categories', { method: 'PUT', body: JSON.stringify({ id: target, image_url: data.url }) });
        load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.upload_failed'));
    } finally {
      setUploadingCategoryPhoto(null);
    }
  };

  /** Promo banners have no separate "fill in a form, then save" step —
   *  picking a file uploads it and creates the row in one go, since the
   *  image is the only real field (any offer text lives inside the image
   *  itself, there's nothing else to type). */
  const uploadPromotionImage = async (file: File) => {
    setUploadingPromotion(true);
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
        body: JSON.stringify({ fileName: file.name, fileBase64: base64, contentType: file.type, folder: 'Banniere' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('common.upload_failed'));
      await api('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ type: 'promotion', image_url: data.url, sort_order: promotions.length }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.upload_failed'));
    } finally {
      setUploadingPromotion(false);
    }
  };

  const togglePromotionActive = async (p: Promotion) => {
    await api('/api/categories', { method: 'PUT', body: JSON.stringify({ id: p.id, type: 'promotion', is_active: !p.is_active }) }).catch(console.error);
    load();
  };

  const removePromotion = async (p: Promotion) => {
    if (!confirm(t('menu.delete_banner_confirm'))) return;
    await api('/api/categories', { method: 'DELETE', body: JSON.stringify({ id: p.id, type: 'promotion' }) }).catch(console.error);
    load();
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = String(reader.result).split(',')[1];
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ fileName: file.name, fileBase64: base64, contentType: file.type, folder: 'Menu Triangle' }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || t('common.upload_failed'));
          setForm((f) => ({ ...f, image_url: data.url }));
        } catch (err) {
          setError(err instanceof Error ? err.message : t('common.upload_failed'));
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
    }
  };

  /** Uploads to storage first, then either attaches to the saved product or
   *  queues the URL for a not-yet-created one (see `pendingGallery`). */
  const addGalleryFiles = async (files: FileList) => {
    setGalleryUploading(true);
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      for (const file of Array.from(files)) {
        const base64: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ fileName: file.name, fileBase64: base64, contentType: file.type, folder: 'Menu Triangle' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('common.upload_failed'));

        if (editing) {
          const saved = await api<ProductImage>('/api/products?images=1', {
            method: 'POST',
            body: JSON.stringify({ product_id: editing.id, url: data.url }),
          });
          setGallery((g) => [...g, saved]);
        } else {
          setPendingGallery((g) => [...g, data.url]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.upload_failed'));
    } finally {
      setGalleryUploading(false);
    }
  };

  const removeGalleryImage = async (img: ProductImage) => {
    setGallery((g) => g.filter((x) => x.id !== img.id));
    await api('/api/products?images=1', { method: 'DELETE', body: JSON.stringify({ id: img.id }) }).catch(console.error);
  };

  const removePendingGallery = (url: string) => setPendingGallery((g) => g.filter((u) => u !== url));

  /** Shared with both the "new sauce" form (target 'new') and an existing
   *  sauce's own photo swatch (target = that sauce's id). */
  const uploadSaucePhoto = async (file: File, target: 'new' | number) => {
    setUploadingSaucePhoto(target);
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
        body: JSON.stringify({ fileName: file.name, fileBase64: base64, contentType: file.type, folder: 'Sauces' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('common.upload_failed'));

      if (target === 'new') {
        setNewSauce((s) => ({ ...s, image_url: data.url }));
      } else {
        await api('/api/sauces', { method: 'PUT', body: JSON.stringify({ id: target, image_url: data.url }) });
        load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.upload_failed'));
    } finally {
      setUploadingSaucePhoto(null);
    }
  };

  const addSauce = async () => {
    if (!newSauce.name.trim()) return;
    setSavingSauce(true);
    try {
      await api('/api/sauces', {
        method: 'POST',
        body: JSON.stringify({ name: newSauce.name.trim(), price: Number(newSauce.price) || 0, image_url: newSauce.image_url || null }),
      });
      setNewSauce({ name: '', price: '', image_url: '' });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('common.save_failed'));
    } finally {
      setSavingSauce(false);
    }
  };

  const toggleSauceActive = async (s: Sauce) => {
    await api('/api/sauces', { method: 'PUT', body: JSON.stringify({ id: s.id, is_active: !s.is_active }) }).catch(console.error);
    load();
  };

  const removeSauce = async (s: Sauce) => {
    if (!confirm(t('menu.delete_sauce_confirm', { name: s.name }))) return;
    await api('/api/sauces', { method: 'DELETE', body: JSON.stringify({ id: s.id }) }).catch(console.error);
    load();
  };

  /** Shared with both the "new supplement" form (target 'new') and an
   *  existing supplement's own photo swatch (target = that supplement's id). */
  const uploadSupplementPhoto = async (file: File, target: 'new' | number) => {
    setUploadingSupplementPhoto(target);
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
        body: JSON.stringify({ fileName: file.name, fileBase64: base64, contentType: file.type, folder: 'Supplements' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('common.upload_failed'));

      if (target === 'new') {
        setNewSupplement((s) => ({ ...s, image_url: data.url }));
      } else {
        await api('/api/sauces', { method: 'PUT', body: JSON.stringify({ id: target, type: 'supplement', image_url: data.url }) });
        load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.upload_failed'));
    } finally {
      setUploadingSupplementPhoto(null);
    }
  };

  const addSupplement = async () => {
    if (!newSupplement.name.trim()) return;
    setSavingSupplement(true);
    try {
      await api('/api/sauces', {
        method: 'POST',
        body: JSON.stringify({
          type: 'supplement',
          name: newSupplement.name.trim(),
          price: Number(newSupplement.price) || 0,
          image_url: newSupplement.image_url || null,
        }),
      });
      setNewSupplement({ name: '', price: '', image_url: '' });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('common.save_failed'));
    } finally {
      setSavingSupplement(false);
    }
  };

  const toggleSupplementActive = async (s: Supplement) => {
    await api('/api/sauces', { method: 'PUT', body: JSON.stringify({ id: s.id, type: 'supplement', is_active: !s.is_active }) }).catch(console.error);
    load();
  };

  const removeSupplement = async (s: Supplement) => {
    if (!confirm(t('menu.delete_supplement_confirm', { name: s.name }))) return;
    await api('/api/sauces', { method: 'DELETE', body: JSON.stringify({ id: s.id, type: 'supplement' }) }).catch(console.error);
    load();
  };

  const toggleProductSauce = (id: number) =>
    setSelectedSauceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const toggleProductSupplement = (id: number) =>
    setSelectedSupplementIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  if (loading) return <Spinner label={t('menu.loading')} />;

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-zinc-900">{t('menu.title')}</h1>
          <p className="text-sm text-zinc-500">{t('menu.stats', { products: products.length, categories: categories.length })}</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-500/30 transition hover:bg-brand-600">
          <Plus size={16} /> {t('menu.add_product')}
        </button>
      </div>

      {/* categories */}
      <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <h2 className="mb-1 font-display text-sm font-bold text-zinc-900">{t('menu.categories')}</h2>
        <p className="mb-3 text-xs text-zinc-400">{t('menu.categories.desc')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white py-1.5 ps-1.5 pe-3 text-xs font-semibold text-zinc-700">
            <label className="group relative h-7 w-7 shrink-0 cursor-pointer" title={t('menu.upload_all_tile')}>
              {settings?.all_category_image_url ? (
                <img src={settings.all_category_image_url} alt="" className="h-7 w-7 rounded-lg object-cover ring-1 ring-zinc-200" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-50 text-sm ring-1 ring-zinc-200">✨</span>
              )}
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-zinc-900/0 text-transparent transition group-hover:bg-zinc-900/40 group-hover:text-white">
                {uploadingAllIcon ? <span className="text-[8px] font-bold">…</span> : <Pencil size={10} />}
              </div>
              <input
                type="file"
                accept="image/*,.heic,.heif,.avif,.svg,.webp,.gif,.bmp,.tiff"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadAllCategoryImage(e.target.files[0])}
              />
            </label>
            <span>{t('menu.all')}</span>
          </div>
          {categories.map((c) => (
            <div key={c.id} className={`flex items-center gap-2 rounded-full border py-1.5 ps-1.5 pe-1.5 text-xs font-semibold ${c.is_active ? 'border-zinc-200 bg-white text-zinc-700' : 'border-dashed border-zinc-200 bg-zinc-50 text-zinc-400'}`}>
              <label className="group relative h-7 w-7 shrink-0 cursor-pointer" title={t('menu.upload_photo')}>
                {c.image_url ? (
                  <img src={c.image_url} alt="" className={`h-7 w-7 rounded-lg object-cover ring-1 ring-zinc-200 ${c.is_active ? '' : 'opacity-40 grayscale'}`} />
                ) : (
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-50 text-sm ring-1 ring-zinc-200 ${c.is_active ? '' : 'opacity-40'}`}>{c.icon}</span>
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-zinc-900/0 text-transparent transition group-hover:bg-zinc-900/40 group-hover:text-white">
                  {uploadingCategoryPhoto === c.id ? <span className="text-[8px] font-bold">…</span> : <Pencil size={10} />}
                </div>
                <input
                  type="file"
                  accept="image/*,.heic,.heif,.avif,.svg,.webp,.gif,.bmp,.tiff"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadCategoryPhoto(e.target.files[0], c.id)}
                />
              </label>
              <span>{c.name}</span>
              <button onClick={() => toggleCategory(c)} title={c.is_active ? t('menu.deactivate') : t('menu.activate')} className={`h-2 w-2 rounded-full ${c.is_active ? 'bg-brand-500' : 'bg-zinc-300'}`} />
              <button onClick={() => removeCategory(c)} className="text-zinc-300 hover:text-red-500"><Trash2 size={12} /></button>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <label className="group relative h-7 w-7 shrink-0 cursor-pointer" title={t('menu.optional_photo')}>
              {newCat.image_url ? (
                <img src={newCat.image_url} alt="" className="h-7 w-7 rounded-lg object-cover ring-1 ring-zinc-200" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-zinc-300">
                  <ImagePlus size={12} />
                </span>
              )}
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-zinc-900/0 text-transparent transition group-hover:bg-zinc-900/40 group-hover:text-white">
                {uploadingCategoryPhoto === 'new' ? <span className="text-[8px] font-bold">…</span> : <Pencil size={10} />}
              </div>
              <input
                type="file"
                accept="image/*,.heic,.heif,.avif,.svg,.webp,.gif,.bmp,.tiff"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadCategoryPhoto(e.target.files[0], 'new')}
              />
            </label>
            <input value={newCat.icon} onChange={(e) => setNewCat({ ...newCat, icon: e.target.value })} className="w-12 rounded-lg border border-zinc-200 px-2 py-1.5 text-center text-xs" maxLength={4} />
            <input value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder={t('menu.new_category')} className="w-36 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs outline-none focus:border-brand-400" />
            <button onClick={addCategory} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-800">{t('menu.add')}</button>
          </div>
        </div>
      </div>

      {/* promo banners */}
      <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <h2 className="mb-1 font-display text-sm font-bold text-zinc-900">{t('menu.promo_banners')}</h2>
        <p className="mb-3 text-xs text-zinc-400">{t('menu.promo_banners.desc')}</p>
        <div className="flex flex-wrap items-start gap-3">
          {promotions.map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-1.5">
              <div className={`h-16 w-28 overflow-hidden rounded-xl ring-1 ring-zinc-200 ${p.is_active ? '' : 'opacity-40 grayscale'}`}>
                <img src={p.image_url} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => togglePromotionActive(p)} title={p.is_active ? t('menu.hide_from_menu') : t('menu.show_on_menu')} className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${p.is_active ? 'bg-brand-50 text-brand-700' : 'bg-zinc-100 text-zinc-400'}`}>
                  {p.is_active ? t('menu.visible') : t('menu.hidden')}
                </button>
                <button onClick={() => removePromotion(p)} className="text-zinc-300 hover:text-red-500"><Trash2 size={11} /></button>
              </div>
            </div>
          ))}
          <label className="flex h-16 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-200 text-zinc-400 transition hover:border-brand-300 hover:text-brand-500">
            {uploadingPromotion ? (
              <span className="text-[10px] font-bold">{t('menu.uploading')}</span>
            ) : (
              <>
                <ImagePlus size={16} />
                <span className="text-[9px] font-bold">{t('menu.add_banner')}</span>
              </>
            )}
            <input
              type="file"
              accept="image/*,.heic,.heif,.avif,.svg,.webp,.gif,.bmp,.tiff"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadPromotionImage(e.target.files[0])}
            />
          </label>
        </div>
      </div>

      {/* sauces */}
      <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <h2 className="mb-1 font-display text-sm font-bold text-zinc-900">{t('menu.sauces')}</h2>
        <p className="mb-3 text-xs text-zinc-400">{t('menu.sauces.desc')}</p>
        <div className="flex flex-wrap items-start gap-3">
          {sauces.map((s) => (
            <div key={s.id} className="flex w-20 flex-col items-center gap-1.5 text-center">
              <label className="group relative h-16 w-16 cursor-pointer">
                {s.image_url ? (
                  <img src={s.image_url} alt="" className={`h-16 w-16 rounded-full object-cover ring-1 ring-zinc-200 ${s.is_active ? '' : 'opacity-40 grayscale'}`} />
                ) : (
                  <div className={`flex h-16 w-16 items-center justify-center rounded-full bg-zinc-50 text-zinc-300 ring-1 ring-zinc-200 ${s.is_active ? '' : 'opacity-40'}`}>
                    <ImagePlus size={18} />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-zinc-900/0 text-transparent transition group-hover:bg-zinc-900/40 group-hover:text-white">
                  {uploadingSaucePhoto === s.id ? <span className="text-[9px] font-bold">…</span> : <Pencil size={13} />}
                </div>
                <input
                  type="file"
                  accept="image/*,.heic,.heif,.avif,.svg,.webp,.gif,.bmp,.tiff"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadSaucePhoto(e.target.files[0], s.id)}
                />
              </label>
              <p className="truncate text-[11px] font-bold text-zinc-700">{s.name}</p>
              {s.price > 0 && <p className="-mt-1 text-[10px] text-zinc-400">+{money(s.price)}</p>}
              <button onClick={() => toggleSauceActive(s)} title={s.is_active ? t('menu.hide_from_menu') : t('menu.show_on_menu')} className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${s.is_active ? 'bg-brand-50 text-brand-700' : 'bg-zinc-100 text-zinc-400'}`}>
                {s.is_active ? t('menu.visible') : t('menu.hidden')}
              </button>
              <button onClick={() => removeSauce(s)} className="text-zinc-300 hover:text-red-500"><Trash2 size={11} /></button>
            </div>
          ))}
          {sauces.length === 0 && <p className="text-xs text-zinc-400">{t('menu.no_sauces')}</p>}
        </div>

        <div className="mt-4 flex items-end gap-2 border-t border-zinc-50 pt-3">
          <label className="group relative h-12 w-12 shrink-0 cursor-pointer">
            {newSauce.image_url ? (
              <img src={newSauce.image_url} alt="" className="h-12 w-12 rounded-full object-cover ring-1 ring-zinc-200" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-zinc-300 bg-zinc-50 text-zinc-300">
                <ImagePlus size={16} />
              </div>
            )}
            <input
              type="file"
              accept="image/*,.heic,.heif,.avif,.svg,.webp,.gif,.bmp,.tiff"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadSaucePhoto(e.target.files[0], 'new')}
            />
          </label>
          <input value={newSauce.name} onChange={(e) => setNewSauce({ ...newSauce, name: e.target.value })} placeholder={t('menu.new_sauce')} className="w-32 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs outline-none focus:border-brand-400" />
          <input value={newSauce.price} onChange={(e) => setNewSauce({ ...newSauce, price: e.target.value })} type="number" step="0.10" min="0" placeholder={t('menu.extra_price')} className="w-20 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs outline-none focus:border-brand-400" />
          <button onClick={addSauce} disabled={savingSauce || uploadingSaucePhoto === 'new'} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-60">{t('menu.add')}</button>
        </div>
      </div>

      {/* supplements */}
      <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <h2 className="mb-1 font-display text-sm font-bold text-zinc-900">{t('menu.supplements')}</h2>
        <p className="mb-3 text-xs text-zinc-400">{t('menu.supplements.desc')}</p>
        <div className="flex flex-wrap items-start gap-3">
          {supplements.map((s) => (
            <div key={s.id} className="flex w-20 flex-col items-center gap-1.5 text-center">
              <label className="group relative h-16 w-16 cursor-pointer">
                {s.image_url ? (
                  <img src={s.image_url} alt="" className={`h-16 w-16 rounded-full object-cover ring-1 ring-zinc-200 ${s.is_active ? '' : 'opacity-40 grayscale'}`} />
                ) : (
                  <div className={`flex h-16 w-16 items-center justify-center rounded-full bg-zinc-50 text-zinc-300 ring-1 ring-zinc-200 ${s.is_active ? '' : 'opacity-40'}`}>
                    <ImagePlus size={18} />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-zinc-900/0 text-transparent transition group-hover:bg-zinc-900/40 group-hover:text-white">
                  {uploadingSupplementPhoto === s.id ? <span className="text-[9px] font-bold">…</span> : <Pencil size={13} />}
                </div>
                <input
                  type="file"
                  accept="image/*,.heic,.heif,.avif,.svg,.webp,.gif,.bmp,.tiff"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadSupplementPhoto(e.target.files[0], s.id)}
                />
              </label>
              <p className="truncate text-[11px] font-bold text-zinc-700">{s.name}</p>
              {s.price > 0 && <p className="-mt-1 text-[10px] text-zinc-400">+{money(s.price)}</p>}
              <button onClick={() => toggleSupplementActive(s)} title={s.is_active ? t('menu.hide_from_menu') : t('menu.show_on_menu')} className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${s.is_active ? 'bg-brand-50 text-brand-700' : 'bg-zinc-100 text-zinc-400'}`}>
                {s.is_active ? t('menu.visible') : t('menu.hidden')}
              </button>
              <button onClick={() => removeSupplement(s)} className="text-zinc-300 hover:text-red-500"><Trash2 size={11} /></button>
            </div>
          ))}
          {supplements.length === 0 && <p className="text-xs text-zinc-400">{t('menu.no_supplements')}</p>}
        </div>

        <div className="mt-4 flex items-end gap-2 border-t border-zinc-50 pt-3">
          <label className="group relative h-12 w-12 shrink-0 cursor-pointer">
            {newSupplement.image_url ? (
              <img src={newSupplement.image_url} alt="" className="h-12 w-12 rounded-full object-cover ring-1 ring-zinc-200" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-zinc-300 bg-zinc-50 text-zinc-300">
                <ImagePlus size={16} />
              </div>
            )}
            <input
              type="file"
              accept="image/*,.heic,.heif,.avif,.svg,.webp,.gif,.bmp,.tiff"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadSupplementPhoto(e.target.files[0], 'new')}
            />
          </label>
          <input value={newSupplement.name} onChange={(e) => setNewSupplement({ ...newSupplement, name: e.target.value })} placeholder={t('menu.new_supplement')} className="w-32 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs outline-none focus:border-brand-400" />
          <input value={newSupplement.price} onChange={(e) => setNewSupplement({ ...newSupplement, price: e.target.value })} type="number" step="0.10" min="0" placeholder={t('menu.extra_price')} className="w-20 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs outline-none focus:border-brand-400" />
          <button onClick={addSupplement} disabled={savingSupplement || uploadingSupplementPhoto === 'new'} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-60">{t('menu.add')}</button>
        </div>
      </div>

      {/* products */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((p) => (
          <div key={p.id} className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-100">
            <img src={p.image_url || '/images/menu/classic-burger.jpg'} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-sm font-bold text-zinc-900">{p.name}</p>
                <span className="shrink-0 font-display text-sm font-bold text-burnt">{money(p.price)}</span>
              </div>
              <p className="text-[11px] text-zinc-400">{catName(p.category_id)} · {t('menu.stock')} {p.stock}</p>
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  onClick={() => toggleAvailable(p)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${p.is_available ? 'bg-brand-50 text-brand-700' : 'bg-zinc-100 text-zinc-400'}`}
                >
                  {p.is_available ? t('menu.available') : t('menu.hidden')}
                </button>
                <button onClick={() => openEdit(p)} className="ms-auto rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-50 hover:text-brand-600"><Pencil size={14} /></button>
                <button onClick={() => removeProduct(p)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* product modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? t('menu.edit_product') : t('menu.new_product')}>
        <div className="space-y-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('menu.product_name')} className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t('menu.description')} rows={2} className="w-full resize-none rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">{t('menu.price')}</label>
              <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} type="number" step="0.10" min="0" className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">{t('menu.stock_label')}</label>
              <input value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} type="number" min="0" className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">{t('menu.category')}</label>
              <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="w-full rounded-xl border border-zinc-200 bg-white px-2 py-2.5 text-sm outline-none focus:border-brand-400">
                <option value="">{t('menu.none')}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">{t('menu.photo')}</label>
            <input
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              placeholder={t('menu.photo.placeholder')}
              className="mb-2 w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <div className="flex items-center gap-3">
              {form.image_url ? (
                <img src={form.image_url} alt="" className="h-14 w-14 rounded-xl object-cover ring-1 ring-zinc-200" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-50 text-zinc-300"><ImagePlus size={20} /></div>
              )}
              <label className="cursor-pointer rounded-xl border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-50">
                {uploading ? t('menu.uploading') : t('menu.upload_image')}
                <input type="file" accept="image/*,.heic,.heif,.avif,.svg,.webp,.gif,.bmp,.tiff" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
              </label>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">{t('menu.gallery')}</label>
            <div className="flex flex-wrap items-center gap-2">
              {gallery.map((img) => (
                <div key={img.id} className="group relative h-16 w-16 shrink-0">
                  <img src={img.url} alt="" className="h-16 w-16 rounded-xl object-cover ring-1 ring-zinc-200" />
                  <button
                    onClick={() => removeGalleryImage(img)}
                    className="absolute -end-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-white shadow"
                    aria-label={t('menu.remove_photo')}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
              {pendingGallery.map((url) => (
                <div key={url} className="group relative h-16 w-16 shrink-0">
                  <img src={url} alt="" className="h-16 w-16 rounded-xl object-cover ring-1 ring-zinc-200" />
                  <button
                    onClick={() => removePendingGallery(url)}
                    className="absolute -end-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-white shadow"
                    aria-label={t('menu.remove_photo')}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
              <label className="flex h-16 w-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-zinc-300 text-zinc-400 hover:bg-zinc-50">
                <ImagePlus size={16} />
                <span className="text-[9px] font-bold">{galleryUploading ? '…' : t('menu.add')}</span>
                <input
                  type="file"
                  accept="image/*,.heic,.heif,.avif,.svg,.webp,.gif,.bmp,.tiff"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files?.length && addGalleryFiles(e.target.files)}
                />
              </label>
            </div>
            <p className="mt-1.5 text-[10px] text-zinc-400">{t('menu.gallery.desc')}</p>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">{t('menu.sauces_offered')}</label>
            {sauces.length === 0 ? (
              <p className="text-xs text-zinc-400">{t('menu.no_sauces_catalog')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sauces.map((s) => {
                  const active = selectedSauceIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleProductSauce(s.id)}
                      title={s.is_active ? undefined : t('menu.hidden_toggle_hint')}
                      className={`flex items-center gap-1.5 rounded-full border-2 py-1.5 ps-1.5 pe-3 text-xs font-bold transition ${
                        active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-zinc-100 bg-white text-zinc-500 hover:border-zinc-200'
                      } ${s.is_active ? '' : 'opacity-50'}`}
                    >
                      {s.image_url ? (
                        <img src={s.image_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-zinc-400"><Droplet size={12} /></span>
                      )}
                      {s.name}{s.price > 0 && <span className="opacity-60">+{money(s.price)}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-1.5 text-[10px] text-zinc-400">{t('menu.sauces_pick_hint')}</p>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">{t('menu.supplements_offered')}</label>
            {supplements.length === 0 ? (
              <p className="text-xs text-zinc-400">{t('menu.no_supplements_catalog')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {supplements.map((s) => {
                  const active = selectedSupplementIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleProductSupplement(s.id)}
                      title={s.is_active ? undefined : t('menu.hidden_toggle_hint')}
                      className={`flex items-center gap-1.5 rounded-full border-2 py-1.5 ps-1.5 pe-3 text-xs font-bold transition ${
                        active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-zinc-100 bg-white text-zinc-500 hover:border-zinc-200'
                      } ${s.is_active ? '' : 'opacity-50'}`}
                    >
                      {s.image_url ? (
                        <img src={s.image_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-zinc-400"><Layers size={12} /></span>
                      )}
                      {s.name}{s.price > 0 && <span className="opacity-60">+{money(s.price)}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-1.5 text-[10px] text-zinc-400">{t('menu.supplements_pick_hint')}</p>
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <input type="checkbox" checked={form.is_available} onChange={(e) => setForm({ ...form, is_available: e.target.checked })} className="h-4 w-4 accent-orange-500" />
            {t('menu.visible_on_menu')}
          </label>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>}

          <button onClick={save} disabled={saving || uploading} className="w-full rounded-xl bg-brand-500 py-3 font-display text-sm font-bold text-white shadow-lg shadow-orange-500/30 hover:bg-brand-600 disabled:opacity-60">
            {saving ? t('common.saving') : editing ? t('common.save') : t('menu.create_product')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
