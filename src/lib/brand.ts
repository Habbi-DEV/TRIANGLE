/**
 * Brand colour engine.
 *
 * Black and white never change. The only thing that varies from one
 * restaurant to the next is the brand colour (orange for Triangle, yellow
 * for Chilly's…), and sometimes a second brand colour. The owner sets them in
 * Settings; this file turns "one or two hex codes" into the full set of CSS
 * variables the UI reads, so the whole app re-colours with no rebuild.
 *
 * The ORIGINAL orange look is the default and is never regenerated: when the
 * chosen colour is the default orange (and there is no second colour),
 * buildBrandTheme() returns null, nothing is overridden, and the app renders
 * exactly the CSS in index.css.
 */

export const DEFAULT_BRAND = '#f97316';
const STORAGE_KEY = 'triangle_brand';
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

type RGB = [number, number, number];
type HSL = [number, number, number]; // h 0-360, s 0-100, l 0-100

export interface BrandTheme {
  /** CSS custom properties to set on <html>. */
  vars: Record<string, string>;
  /** A light colour (yellow, lime…): text ON it must be dark, and colour
   *  used AS text on white must be a much deeper shade. */
  light: boolean;
}

export interface BrandPreset {
  id: string;
  name: string;
  primary: string;
  secondary: string | null;
}

/** Ready-made starting points shown in Settings. */
export const BRAND_PRESETS: BrandPreset[] = [
  { id: 'orange', name: 'Orange', primary: DEFAULT_BRAND, secondary: null },
  { id: 'yellow', name: 'Jaune', primary: '#fad905', secondary: '#eaa605' },
  { id: 'red', name: 'Rouge', primary: '#dc2626', secondary: null },
  { id: 'green', name: 'Vert', primary: '#16a34a', secondary: null },
  { id: 'blue', name: 'Bleu', primary: '#2563eb', secondary: null },
  { id: 'purple', name: 'Violet', primary: '#7c3aed', secondary: null },
  { id: 'pink', name: 'Rose', primary: '#db2777', secondary: null },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const isHexColor = (v: unknown): v is string => typeof v === 'string' && HEX_RE.test(v);

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function rgbToHsl([r, g, b]: RGB): HSL {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [((h * 60) + 360) % 360, s * 100, l * 100];
}

function hslToHex([h, s, l]: HSL): string {
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = ln - c / 2;
  return rgbToHex([(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]);
}

/** WCAG relative luminance, 0 (black) … 1 (white). */
function luminance([r, g, b]: RGB): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Above this the colour is "light": the default orange is ~0.32, a typical
 *  yellow ~0.7, amber/gold ~0.45. */
const LIGHT_THRESHOLD = 0.4;
export const isLightColor = (hex: string): boolean => luminance(hexToRgb(hex)) >= LIGHT_THRESHOLD;

/**
 * Builds the CSS variables for a brand. Returns null for "the default
 * orange, nothing else" — the signal to leave index.css untouched.
 */
export function buildBrandTheme(primary?: string | null, secondary?: string | null): BrandTheme | null {
  const p = isHexColor(primary) ? primary.toLowerCase() : DEFAULT_BRAND;
  const s2 = isHexColor(secondary) ? secondary.toLowerCase() : null;
  if (p === DEFAULT_BRAND && !s2) return null;

  const rgb = hexToRgb(p);
  const [h, s, l] = rgbToHsl(rgb);
  const light = luminance(rgb) >= LIGHT_THRESHOLD;

  // Tints (50–400) go lighter than the colour; shades (600–900) go darker.
  // For a LIGHT colour the shades are fixed and deep: they're what text-brand-600
  // etc. use on white, where a pale yellow would be invisible.
  const l400 = l >= 76 ? l : (76 + l) / 2;
  const lightness: Record<number, number> = {
    50: 97, 100: 93, 200: 86, 300: 76, 400: l400,
    600: light ? 40 : l * 0.9,
    700: light ? 32 : l * 0.77,
    800: light ? 25 : l * 0.64,
    900: light ? 18 : l * 0.5,
  };

  const vars: Record<string, string> = {};
  for (const step of STEPS) {
    const hex = step === 500 ? p : hslToHex([h, s, lightness[step]]);
    vars[`--color-brand-${step}`] = hex;
    // Tailwind's orange-* utilities are used in the UI as brand accents
    // (shadows, tints), so they follow the brand too.
    vars[`--color-orange-${step}`] = hex;
  }
  const brand600 = vars['--color-brand-600'];
  vars['--color-burnt'] = light ? '#18181b' : brand600;
  // Gradient end of the buttons: the 2nd brand colour when there is one,
  // otherwise a slightly deeper/warmer version of the main colour.
  vars['--color-brand-grad'] = s2 ?? (light ? hslToHex([Math.max(0, h - 8), s, l - 8]) : brand600);
  const triplet = rgb.join(', ');
  vars['--brand-rgb'] = triplet;
  vars['--brand-glow-rgb'] = triplet;
  vars['--brand-on'] = light ? '#111111' : '#ffffff';
  vars['--brand-hex'] = p;
  return { vars, light };
}

let applied: string[] = [];

/** Puts a theme on <html> (or removes any previous one when null). */
export function applyBrandTheme(theme: BrandTheme | null): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const k of applied) root.style.removeProperty(k);
  applied = [];
  root.removeAttribute('data-brand-light');
  if (!theme) return;
  for (const [k, v] of Object.entries(theme.vars)) {
    root.style.setProperty(k, v);
    applied.push(k);
  }
  if (theme.light) root.setAttribute('data-brand-light', '');
}

/** Remembers the theme so the NEXT page load can apply it before first paint
 *  (see the inline script in index.html) instead of flashing orange first. */
export function saveBrandTheme(theme: BrandTheme | null): void {
  try {
    if (theme) localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode — only costs a brief flash on the next load */
  }
}

/** The current main brand colour as hex (map markers and other JS-drawn
 *  things that can't use a CSS variable). */
export function brandHex(): string {
  if (typeof document === 'undefined') return DEFAULT_BRAND;
  return document.documentElement.style.getPropertyValue('--brand-hex').trim() || DEFAULT_BRAND;
}
