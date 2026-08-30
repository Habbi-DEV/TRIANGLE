import { useEffect, useState } from 'react';
import { Navigation2, Loader2 } from 'lucide-react';
import LeafletMap from '../shared/LeafletMap';
import { useLang } from '../../lib/i18n';

interface Props {
  destLat?: number | null;
  destLng?: number | null;
  /** Text address shown/used as a fallback when no pin was saved on the
   *  order (older orders, or a customer who skipped the map). */
  destAddress?: string | null;
}

/**
 * Shows the driver where they're going. Turn-by-turn routing needs a paid
 * directions API, so instead of half-building that, this gives:
 *   1. A quick visual — the driver's live position + a straight line to the
 *      destination, updated as they move.
 *   2. A one-tap handoff to Google Maps (already installed on virtually
 *      every driver's phone) for real, spoken, traffic-aware navigation.
 */
export default function RouteMap({ destLat, destLng, destAddress }: Props) {
  const { t } = useLang();
  const [me, setMe] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(true);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setLocating(false);
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setMe([pos.coords.latitude, pos.coords.longitude]);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const hasDest = destLat != null && destLng != null;

  const gmapsUrl = hasDest
    ? `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`
    : destAddress
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destAddress)}&travelmode=driving`
      : null;

  const center: [number, number] = hasDest ? [destLat as number, destLng as number] : (me ?? [36.7538, 3.0588]);

  const markers = [
    ...(hasDest ? [{ id: 'dest', lat: destLat as number, lng: destLng as number, color: '#f97316' }] : []),
    ...(me ? [{ id: 'me', lat: me[0], lng: me[1], color: '#3b82f6' }] : []),
  ];

  return (
    <div className="space-y-2">
      {hasDest ? (
        <div className="h-40 w-full overflow-hidden rounded-xl ring-1 ring-zinc-200">
          <LeafletMap
            center={center}
            zoom={14}
            markers={markers}
            polyline={me && hasDest ? [me, [destLat as number, destLng as number]] : undefined}
            fitToMarkers
            interactive
            className="h-full w-full"
          />
        </div>
      ) : (
        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500 ring-1 ring-zinc-100">
          {t('driver.no_location')}
        </p>
      )}

      {locating && !hasDest && (
        <p className="flex items-center gap-1.5 text-xs text-zinc-400">
          <Loader2 size={12} className="animate-spin" /> {t('driver.locating_you')}
        </p>
      )}

      {gmapsUrl && (
        <a
          href={gmapsUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white transition active:scale-[0.98]"
        >
          <Navigation2 size={16} />
          {t('driver.open_in_maps')}
        </a>
      )}
    </div>
  );
}
