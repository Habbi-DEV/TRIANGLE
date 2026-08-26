import { useEffect, useState } from 'react';
import type { Settings } from './types';

// In-memory cache of the single `settings` row, loaded once (from App.tsx)
// and kept fresh whenever the admin Settings page saves changes. Read
// synchronously by money() in format.ts — see getCachedSettings() — and
// reactively by any component via useSettings() below (e.g. the header
// logo/restaurant name on the customer menu and in the admin sidebar).
let cached: Settings | null = null;

// Components that want to re-render when settings change (not just read
// them once) subscribe here. setCachedSettings() notifies every listener,
// so saving on the Settings page updates the logo/name everywhere live —
// no reload needed.
const listeners = new Set<(s: Settings) => void>();

export function getCachedSettings(): Settings | null {
  return cached;
}

export function setCachedSettings(settings: Settings): void {
  cached = settings;
  listeners.forEach((fn) => fn(settings));
}

/** Fetches /api/settings (public endpoint) and populates the cache. */
export async function loadSettings(): Promise<Settings | null> {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return null;
    const data = (await res.json()) as Settings;
    setCachedSettings(data);
    return data;
  } catch (err) {
    console.error('Failed to load settings:', err);
    return null;
  }
}

/**
 * Reactive read of the settings row — e.g. `useSettings()?.restaurant_name`
 * or `?.logo_url` for branding. Returns null until the first load resolves
 * (callers should fall back to a default in the meantime) and updates
 * automatically after a save on the admin Settings page. Triggers its own
 * fetch on mount if nothing has loaded yet, so it works even if this is
 * the very first thing on the page to need settings.
 */
export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(cached);
  useEffect(() => {
    if (!cached) loadSettings();
    listeners.add(setSettings);
    return () => {
      listeners.delete(setSettings);
    };
  }, []);
  return settings;
}
