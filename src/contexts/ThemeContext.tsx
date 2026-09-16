import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'triangle_theme';

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeCtx>({ theme: 'light', toggle: () => {}, setTheme: () => {} });

/** Reads the theme exactly the way the inline FOUC-guard script in
 *  index.html does, so the very first React render already matches what's
 *  painted on the <html> element — no flash, no mismatch. Order of
 *  precedence: explicit user choice in localStorage, then the OS-level
 *  `prefers-color-scheme`, then light as the default. */
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* ignore (private browsing, etc.) */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // Keep the <html> class and localStorage in sync with state. The inline
  // script in index.html already set the correct class before paint, so
  // this effect is a no-op on first mount and only actually flips the DOM
  // when the user (or a later effect) changes `theme`.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // Follow the OS preference live, but only for as long as the visitor
  // hasn't made an explicit choice of their own — once they tap the
  // toggle, that choice is sticky (see setTheme) and this listener backs off.
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      let hasExplicitChoice = false;
      try {
        hasExplicitChoice = localStorage.getItem(STORAGE_KEY) !== null;
      } catch {
        /* ignore */
      }
      if (!hasExplicitChoice) setThemeState(e.matches ? 'dark' : 'light');
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggle = () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return <ThemeContext.Provider value={{ theme, toggle, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
