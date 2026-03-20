'use client';

import { type ReactNode, useEffect } from 'react';

import { setAgentRegistry } from '@/config/agents';
import { getAgentsConfig, getThemeConfig } from '@/lib/api';
import { useThemeStore } from '@/stores/theme-store';

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * ThemeProvider fetches theme and agent configuration from the backend on mount
 * and applies CSS variables to :root for runtime theming.
 *
 * Wrap your app with this provider to enable dynamic theming and agent loading.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const { isLoaded, error, setTheme, setLoading, setError } = useThemeStore();

  // Re-apply palette when OS dark/light preference changes (only when heroMode isn't forced)
  useEffect(() => {
    if (!isLoaded) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const { palette, applyPalette } = useThemeStore.getState();
      if (palette.heroMode !== 'dark' && palette.heroMode !== 'light') {
        applyPalette(palette);
      }
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, [isLoaded]);

  useEffect(() => {
    // Only fetch once
    if (isLoaded) return;

    const loadConfig = async () => {
      setLoading(true);

      // Fetch theme and agents in parallel
      const [themeResult, agentsResult] = await Promise.allSettled([
        getThemeConfig(),
        getAgentsConfig(),
      ]);

      // Apply theme
      if (themeResult.status === 'fulfilled' && themeResult.value.success) {
        setTheme(
          themeResult.value.active,
          themeResult.value.activePalette,
          themeResult.value.palettes,
          themeResult.value.branding
        );
        // Apply user's saved color scheme override (from Settings page)
        const saved = localStorage.getItem('axis-color-scheme');
        if (saved === 'dark' || saved === 'light') {
          const current = useThemeStore.getState().palette;
          useThemeStore.getState().applyPalette({ ...current, heroMode: saved });
        }
      } else {
        const reason =
          themeResult.status === 'rejected'
            ? themeResult.reason instanceof Error
              ? themeResult.reason.message
              : 'Unknown error'
            : 'Failed to load theme configuration';
        console.warn('Failed to fetch theme config, using defaults:', reason);
        // Apply default palette so dark mode CSS vars + class are set from OS preference
        useThemeStore.getState().applyPalette(useThemeStore.getState().palette);
        setError(reason);
      }

      // Apply agents
      if (agentsResult.status === 'fulfilled' && agentsResult.value.success) {
        setAgentRegistry(agentsResult.value.agents);
      } else {
        console.warn('Failed to fetch agents config, using empty registry');
      }
    };

    loadConfig();
  }, [isLoaded, setTheme, setLoading, setError]);

  // Wait for theme to load before rendering to prevent flash of default branding.
  // Fall through on error so the app still renders with defaults.
  if (!isLoaded && !error) {
    return null;
  }

  return <>{children}</>;
}
