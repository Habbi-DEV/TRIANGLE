/**
 * Reverse-geocodes a lat/lng into a human-readable address using OSM's free
 * Nominatim API — no API key needed. Best-effort only: when the customer
 * confirms a spot on the map, the result replaces whatever is in the
 * address field (the map pick is their latest explicit choice). Returns null on
 * any failure (offline, rate-limited, no result) rather than throwing, so
 * callers can silently fall back to "let the customer type it themselves".
 */
export async function reverseGeocode(lat: number, lng: number, lang: 'fr' | 'ar'): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=${lang}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.display_name === 'string' ? data.display_name : null;
  } catch {
    return null;
  }
}
