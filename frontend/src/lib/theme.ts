import { useThemeStore } from '@/stores/theme-store';
import { DefaultColors } from '@/types';

import type { BrandingConfig, ThemePalette } from '@/types';

/**
 * Hook to get current theme colors and branding.
 * Returns the active palette colors from the theme store.
 */
export function useColors(): ThemePalette & {
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  success: string;
  warning: string;
  error: string;
} {
  const { palette } = useThemeStore();

  return {
    ...palette,
    // These colors don't change with theme
    textPrimary: DefaultColors.textPrimary,
    textSecondary: DefaultColors.textSecondary,
    textMuted: DefaultColors.textMuted,
    success: DefaultColors.success,
    warning: DefaultColors.warning,
    error: DefaultColors.error,
  };
}

/**
 * Hook to get hero image URL from current theme.
 * Returns null if no custom hero image is set.
 */
export function useHeroImage(): string | null {
  const { palette } = useThemeStore();
  return palette.heroImage || '/images/hero.jpg';
}

/**
 * Hook to get logo URL from current theme.
 * Returns null if no custom logo is set.
 */
export function useLogoUrl(): string | null {
  const { palette } = useThemeStore();
  return palette.logoUrl || null;
}

/**
 * Hook to get favicon URL from current theme.
 * Returns null if no custom favicon is set.
 */
export function useFaviconUrl(): string | null {
  const { palette } = useThemeStore();
  return palette.faviconUrl || null;
}

/**
 * Hook to get app icon URL from current theme.
 * Returns null if no custom app icon is set (falls back to default).
 */
export function useAppIconUrl(): string | null {
  const { palette } = useThemeStore();
  return palette.appIconUrl || null;
}

/**
 * Hero image filter configuration.
 */
export interface HeroFilter {
  contrast: number | null;
  saturation: number | null;
  brightness: number | null;
  opacity: number | null;
  /** Pre-computed CSS filter string (e.g., "contrast(0.8) saturate(0.8)") */
  filterString: string | null;
}

/**
 * Hook to get branding configuration from current theme.
 * Returns app name, tagline, subtitle, description, and report footer.
 */
export function useBranding(): BrandingConfig {
  return useThemeStore((s) => s.branding);
}

/**
 * Hook to get hero mode from current theme.
 * Returns 'dark' (default) or 'light'.
 */
export function useHeroMode(): 'dark' | 'light' {
  const { palette } = useThemeStore();
  return palette.heroMode === 'dark' ? 'dark' : 'light';
}

/**
 * Hook to check if shimmer is enabled (both colors configured).
 */
export function useHasShimmer(): boolean {
  const { palette } = useThemeStore();
  return Boolean(palette.shimmerFrom && palette.shimmerTo);
}

/**
 * Hook to get hero image filter settings from current theme.
 * Returns filter values and a pre-computed CSS filter string.
 */
export function useHeroFilter(): HeroFilter {
  const { palette } = useThemeStore();

  const filterParts: string[] = [];
  if (palette.heroContrast != null) {
    filterParts.push(`contrast(${palette.heroContrast})`);
  }
  if (palette.heroSaturation != null) {
    filterParts.push(`saturate(${palette.heroSaturation})`);
  }
  if (palette.heroBrightness != null) {
    filterParts.push(`brightness(${palette.heroBrightness})`);
  }

  return {
    contrast: palette.heroContrast ?? null,
    saturation: palette.heroSaturation ?? null,
    brightness: palette.heroBrightness ?? null,
    opacity: palette.heroOpacity ?? null,
    filterString: filterParts.length > 0 ? filterParts.join(' ') : null,
  };
}

/**
 * Get chart colors array based on current theme.
 * Useful for Plotly charts and other multi-series visualizations.
 */
export function useChartColors(): string[] {
  const { palette } = useThemeStore();

  return [
    palette.primary,
    palette.primaryLight,
    palette.primaryDark,
    palette.primarySoft,
    palette.accentGold,
    palette.accentSilver,
    palette.primaryPale,
    '#1f77b4', // Additional standard colors
    '#ff7f0e',
    '#2ca02c',
  ];
}

// Color-only keys from ThemePalette (excluding heroImage, logoUrl)
type ThemeColorKey =
  | 'primary'
  | 'primaryLight'
  | 'primaryDark'
  | 'primarySoft'
  | 'primaryPale'
  | 'accentGold'
  | 'accentSilver';

/**
 * Get a specific color from the current theme palette.
 */
export function useThemeColor(
  colorName:
    | ThemeColorKey
    | 'textPrimary'
    | 'textSecondary'
    | 'textMuted'
    | 'success'
    | 'warning'
    | 'error'
): string {
  const colors = useColors();

  if (colorName in colors) {
    const value = colors[colorName as keyof typeof colors];
    if (typeof value === 'string') {
      return value;
    }
  }

  // Fallback
  return DefaultColors.primary;
}

/**
 * Non-hook version for use outside React components.
 * Gets current theme colors directly from store state.
 */
export function getThemeColors(): ThemePalette {
  return useThemeStore.getState().palette;
}

/**
 * Non-hook version for chart colors.
 * Gets current chart colors directly from store state.
 */
export function getChartColors(): string[] {
  const palette = useThemeStore.getState().palette;

  return [
    palette.primary,
    palette.primaryLight,
    palette.primaryDark,
    palette.primarySoft,
    palette.accentGold,
    palette.accentSilver,
    palette.primaryPale,
    '#1f77b4',
    '#ff7f0e',
    '#2ca02c',
  ];
}
