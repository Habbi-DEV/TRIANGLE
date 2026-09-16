import { useTheme, type Theme } from '../contexts/ThemeContext';
import { useSettings } from './settings';
import type { Settings } from './types';

/**
 * Logo system — one brand, two files.
 *
 *   settings.light_logo_url → black wordmark, for light backgrounds
 *   settings.dark_logo_url  → white wordmark, for dark backgrounds
 *   settings.logo_url       → the pre-split single logo (legacy)
 *
 * Every surface in the app asks for a *variant* rather than a column, so the
 * "which file goes here" decision lives in this one place:
 *
 *   'auto'  follows the active theme — e-menu header, category rail, login.
 *   'light' always the black one     — printed receipts, the POS rail, any
 *                                      surface that stays white in both themes.
 *   'dark'  always the white one     — the admin sidebar and the driver top
 *                                      bar, which are zinc-950 in both themes.
 */
export type LogoVariant = 'auto' | 'light' | 'dark';

/**
 * Per-surface artwork that takes priority over the restaurant logo, for
 * places that have their own image but still need the light/dark swap —
 * today that's the "Tout" tile in the category rail, whose picture lives in
 * `settings.all_category_image_url`.
 */
export interface LogoSources {
  light?: string | null;
  dark?: string | null;
}

interface ResolveOptions {
  variant?: LogoVariant;
  sources?: LogoSources;
}

/** First non-blank URL in the list, trimmed. */
function firstUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
  }
  return null;
}

/** The side of the pair a variant resolves to under the given theme. */
function sideFor(variant: LogoVariant, theme: Theme): 'light' | 'dark' {
  return variant === 'auto' ? theme : variant;
}

/**
 * Picks the file to paint right now. Returns null while settings are still
 * loading, and null when the restaurant has no logo configured at all (the
 * caller shows its emoji fallback then).
 *
 * Both chains end at the other side of the pair rather than at null: a
 * black logo on a dark header is ugly, but an empty box where the brand
 * should be is worse — and it keeps restaurants that have only ever
 * uploaded one file looking exactly like they did before this system
 * existed, until the admin uploads the second one.
 */
export function resolveLogoSrc(
  settings: Settings | null,
  theme: Theme,
  { variant = 'auto', sources }: ResolveOptions = {},
): string | null {
  if (!settings) return null;

  return sideFor(variant, theme) === 'dark'
    ? firstUrl(sources?.dark, settings.dark_logo_url, sources?.light, settings.light_logo_url, settings.logo_url)
    : firstUrl(sources?.light, settings.light_logo_url, settings.logo_url, sources?.dark, settings.dark_logo_url);
}

/**
 * Reactive version of the above — re-renders on a theme flip *and* on a save
 * from the admin Settings page (useSettings is subscribed to the cache).
 *
 * `alternate` is the file the other theme would show; <AppLogo /> warms the
 * browser cache with it so toggling the theme swaps instantly instead of
 * blinking while the second file downloads. It's null for forced variants,
 * which never flip.
 */
export function useLogoSrc(options: ResolveOptions = {}) {
  const settings = useSettings();
  const { theme } = useTheme();
  const { variant = 'auto' } = options;

  return {
    settings,
    src: resolveLogoSrc(settings, theme, options),
    alternate:
      variant === 'auto'
        ? resolveLogoSrc(settings, theme === 'dark' ? 'light' : 'dark', options)
        : null,
    /** /api/settings hasn't resolved yet on this page load. */
    loading: settings === null,
  };
}
