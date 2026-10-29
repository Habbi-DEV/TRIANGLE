import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'triangle_theme';
/** The restaurant's chosen default for NEW visitors (Settings → Thème par
 *  défaut): 'dark' | 'light' | 'system'. Cached here so the very first paint
 *  of a return visit already uses it. A visitor's own toggle always wins. */
const DEFAULT_KEY = 'triangle_default_theme';

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
  /** Applies the restaurant's default theme unless the visitor has already
   *  chosen one. Not persisted as a choice. */
  applyDefault: (def: 'system' | 'dark' | 'light') => void;
}

const ThemeContext = createContext<ThemeCtx>({ theme: 'light', toggle: () => {}, setTheme: () => {}, applyDefault: () => {} });

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
    const def = localStorage.getItem(DEFAULT_KEY);
    if (def === 'light' || def === 'dark') return def;
  } catch {
    /* ignore (private browsing, etc.) */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  // True once the visitor has tapped the toggle. Until then the theme is
  // "automatic" (default theme / phone setting) and is NOT saved as a choice,
  // so the restaurant's default and live OS changes can still apply.
  const userChose = useRef(false);

  // Keep the <html> class and localStorage in sync with state. The inline
  // script in index.html already set the correct class before paint, so
  // this effect is a no-op on first mount and only actually flips the DOM
  // when the user (or a later effect) changes `theme`.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    try {
      // Existing visitors already have a saved choice — keep it in sync.
      // New visitors only get one once they actually choose.
      if (userChose.current || localStorage.getItem(STORAGE_KEY) !== null) localStorage.setItem(STORAGE_KEY, theme);
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

  const setTheme = (t: Theme) => {
    userChose.current = true;
    setThemeState(t);
  };
  const toggle = () => {
    userChose.current = true;
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };
  const applyDefault = (def: 'system' | 'dark' | 'light') => {
    try {
      localStorage.setItem(DEFAULT_KEY, def);
      if (localStorage.getItem(STORAGE_KEY) !== null) return; // the visitor already chose
    } catch {
      /* ignore */
    }
    if (def === 'dark' || def === 'light') setThemeState(def);
    else setThemeState(window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  };

  return <ThemeContext.Provider value={{ theme, toggle, setTheme, applyDefault }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
