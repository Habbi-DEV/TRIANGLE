// Frontend security helpers (20y hardened defaults).
// Use everywhere user/admin-controlled URLs or phone numbers are rendered.

export function isSafeImageUrl(u: unknown): boolean {
  if (typeof u !== 'string' || !u.trim()) return true; // empty = cleared, allowed
  const t = u.trim();
  if (t.length > 2000) return false;
  if (/^\s*(javascript|data:text\/html|vbscript|blob|file):/i.test(t)) return false;
  if (t.startsWith('/')) {
    return t.length <= 500 && !t.includes('..') && !/[<>"'\s]/.test(t);
  }
  return /^https:\/\/[^\s<>"']{4,2000}$/.test(t);
}

export function sanitizeImageUrl(u: string, fallback = ''): string {
  return isSafeImageUrl(u) ? u : fallback;
}

export function sanitizeTel(phone: string): string {
  // tel: links can inject pauses/DTMF via , ; — strip to digits/+/space/dash
  const cleaned = String(phone || '').replace(/[^\d+\s-]/g, '').trim().slice(0, 30);
  return cleaned.length >= 6 ? `tel:${cleaned.replace(/\s/g, '')}` : '#';
}

export function sanitizeLatLng(lat: unknown, lng: unknown): [number, number] | null {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a < -90 || a > 90 || b < -180 || b > 180) return null;
  return [a, b];
}

/** Purge all app-cached sensitive data on logout (PII + session). */
export async function secureSignOut(supabase: any): Promise<void> {
  try {
    // Remove known localStorage keys (cart kept? No — purge order tracking keys)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i) || '';
      if (k.startsWith('restolink:lastOrder') || k.startsWith('restolink:pushSubscribed') || k.startsWith('sb-')) {
        // sb-* = Supabase session — removed by signOut itself, but ensure it
        if (!k.startsWith('sb-')) localStorage.removeItem(k);
      }
    }
    // Clear Cache Storage buckets that may hold sensitive API data (legacy installs)
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => /triangle-orders|triangle-stats|triangle-staff/i.test(n))
          .map((n) => caches.delete(n))
      );
    }
  } catch {
    /* best-effort */
  } finally {
    await supabase.auth.signOut();
  }
}
