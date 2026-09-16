import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { useLogoSrc, type LogoSources, type LogoVariant } from '../lib/logo';

interface AppLogoProps {
  /** 'auto' (default) follows the active theme. See lib/logo.ts for when to
   *  force 'light' or 'dark' instead. */
  variant?: LogoVariant;
  /** Surface-specific artwork that wins over the restaurant logo — used by
   *  the "Tout" tile, which has its own picture. */
  sources?: LogoSources;
  /** Size and shape of the box. Always applied, in every state, so the
   *  layout never shifts between loading / logo / fallback. */
  className?: string;
  /** Added to the box *only* when the emoji fallback shows, so a brand-colored
   *  tile never frames a real (usually transparent) logo. */
  fallbackClassName?: string;
  imgClassName?: string;
  imgStyle?: CSSProperties;
  /** Shown when the restaurant has no logo configured at all. */
  fallback?: ReactNode;
  /** Leave empty for decorative use (the restaurant name is always next to
   *  it); set it where the logo is the only thing identifying the brand. */
  alt?: string;
}

/**
 * The one place the app renders the restaurant logo.
 *
 *   <AppLogo />                     → swaps with the theme
 *   <AppLogo variant="dark" />      → always the white file (dark sidebars)
 *   <AppLogo variant="light" />     → always the black file (print, POS)
 *
 * Sizing stays with the caller (className) because every surface wants a
 * different box; only the "which file, which state" logic lives here.
 */
export default function AppLogo({
  variant = 'auto',
  sources,
  className = '',
  fallbackClassName = '',
  imgClassName = 'h-full w-full object-contain',
  imgStyle,
  fallback = '🍽️',
  alt = '',
}: AppLogoProps) {
  const { src, alternate, loading } = useLogoSrc({ variant, sources });

  // Warm the cache with the file the other theme uses, so flipping the
  // toggle swaps the wordmark on the same frame as the background.
  useEffect(() => {
    if (!alternate || alternate === src) return;
    const img = new Image();
    img.src = alternate;
  }, [alternate, src]);

  // Settings are still in flight: hold the space, but draw nothing. Showing
  // the placeholder emoji here and replacing it a moment later reads as a
  // flash of the wrong brand.
  if (loading) return <span className={className} aria-hidden="true" />;

  if (!src) {
    return (
      <span className={`${className} ${fallbackClassName}`.trim()} aria-hidden="true">
        {fallback}
      </span>
    );
  }

  return (
    <span className={className}>
      <img
        src={src}
        alt={alt}
        className={imgClassName}
        style={imgStyle}
        draggable={false}
      />
    </span>
  );
}
