import { useEffect, useState } from 'react';

/**
 * Watches the browser's geolocation and returns the driver's own current
 * [lat, lng] — used to show a rough "~X km away" distance on each available
 * order (see lib/geo.ts) without duplicating a geolocation watcher per
 * card. Silently returns null if permission is denied or unsupported; every
 * caller already treats a missing position as "distance unknown" rather
 * than an error.
 */
export default function useMyPosition(enabled: boolean) {
  const [pos, setPos] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!enabled || !('geolocation' in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (p) => setPos([p.coords.latitude, p.coords.longitude]),
      () => {},
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  return pos;
}
