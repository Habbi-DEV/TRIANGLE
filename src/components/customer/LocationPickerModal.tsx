import { useEffect, useState } from 'react';
import { Crosshair, Loader2, MapPin } from 'lucide-react';
import Modal from '../ui/Modal';
import LeafletMap from '../shared/LeafletMap';
import { useLang } from '../../lib/i18n';
import { reverseGeocode } from '../../lib/geocode';

// Fallback map center (Algiers) used until geolocation resolves or the
// customer taps the map themselves — this app is Algeria-only (cash-only
// payment, etc.), so a national capital is a reasonable default zoom target
// rather than centering on nothing.
const DEFAULT_CENTER: [number, number] = [36.7538, 3.0588];

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (lat: number, lng: number, addressGuess: string | null) => void;
  initial?: { lat: number; lng: number } | null;
}

export default function LocationPickerModal({ open, onClose, onConfirm, initial }: Props) {
  const { t, lang } = useLang();
  const [position, setPosition] = useState<[number, number]>(
    initial ? [initial.lat, initial.lng] : DEFAULT_CENTER,
  );
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  // On open: keep an explicit pin if the customer already picked one
  // earlier in this checkout, otherwise try to center on their current
  // position (best-effort — a denied/failed permission just leaves the
  // default center, still fully usable via drag).
  useEffect(() => {
    if (!open) return;
    setError('');
    if (initial) {
      setPosition([initial.lat, initial.lng]);
      return;
    }
    if (!('geolocation' in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition([pos.coords.latitude, pos.coords.longitude]);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setError(t('cart.pick_on_map.geolocation_error'));
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition([pos.coords.latitude, pos.coords.longitude]);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError(t('cart.pick_on_map.geolocation_error'));
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const confirm = async () => {
    setConfirming(true);
    const guess = await reverseGeocode(position[0], position[1], lang);
    setConfirming(false);
    onConfirm(position[0], position[1], guess);
  };

  return (
    <Modal open={open} onClose={onClose} title={t('cart.pick_on_map.title')}>
      <div className="space-y-3">
        <p className="text-xs text-zinc-500">{t('cart.pick_on_map.hint')}</p>

        <div className="relative h-64 w-full overflow-hidden rounded-2xl ring-1 ring-zinc-200">
          <LeafletMap
            center={position}
            zoom={16}
            markers={[{
              id: 'pin',
              lat: position[0],
              lng: position[1],
              color: '#f97316',
              draggable: true,
              onDragEnd: (lat, lng) => setPosition([lat, lng]),
            }]}
            onMapClick={(lat, lng) => setPosition([lat, lng])}
            className="h-full w-full"
            onLoadError={() => setError(t('cart.pick_on_map.load_error'))}
          />
        </div>

        {error && <p className="text-xs font-medium text-red-500">{error}</p>}

        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 py-3 text-sm font-bold text-zinc-700 transition active:scale-[0.98] disabled:opacity-60"
        >
          {locating ? <Loader2 size={16} className="animate-spin" /> : <Crosshair size={16} />}
          {locating ? t('cart.pick_on_map.locating') : t('cart.pick_on_map.use_my_location')}
        </button>

        <button
          type="button"
          onClick={confirm}
          disabled={confirming}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-500/30 transition active:scale-[0.98] disabled:opacity-60"
        >
          {confirming ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
          {t('cart.pick_on_map.confirm')}
        </button>
      </div>
    </Modal>
  );
}
