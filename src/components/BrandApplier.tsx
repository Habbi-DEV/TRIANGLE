import { useEffect } from 'react';
import { applyBrandTheme, buildBrandTheme, saveBrandTheme } from '../lib/brand';
import { useSettings } from '../lib/settings';
import { useTheme } from '../contexts/ThemeContext';

/** Renders nothing. Whenever the restaurant settings load or change, it
 *  (1) re-colours the whole app with the brand colour(s) and caches them for
 *  the next load, and (2) applies the restaurant's default theme for visitors
 *  who haven't picked one. */
export default function BrandApplier() {
  const settings = useSettings();
  const { applyDefault } = useTheme();
  const primary = settings?.brand_color;
  const secondary = settings?.brand_color_2;
  const defaultTheme = settings?.default_theme;

  useEffect(() => {
    if (!settings) return;
    const theme = buildBrandTheme(primary, secondary);
    applyBrandTheme(theme);
    saveBrandTheme(theme);
  }, [settings, primary, secondary]);

  useEffect(() => {
    if (settings) applyDefault(defaultTheme ?? 'system');
    // applyDefault is recreated each render; only the setting matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, defaultTheme]);

  return null;
}
