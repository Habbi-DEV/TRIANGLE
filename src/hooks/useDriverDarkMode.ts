import { useEffect, useState } from 'react';

const STORAGE_KEY = 'triangle_driver_dark';

/** Persisted, driver-dashboard-only dark mode preference. See the
 *  `driver-dark:` custom variant in index.css — this hook just owns the
 *  boolean and toggling the `.driver-dark` class lives in DriverLayout. */
export default function useDriverDarkMode() {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, dark ? '1' : '0');
    } catch {
      /* ignore (private browsing, etc.) */
    }
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}
