'use client';

import { useEffect } from 'react';

import { useFaviconUrl } from '@/lib/theme';

/**
 * FaviconManager - Dynamically updates the favicon based on theme configuration.
 * This component should be mounted once in the app layout.
 * When a custom faviconUrl is set in the theme, it updates the document's favicon.
 */
export function FaviconManager() {
  const faviconUrl = useFaviconUrl();

  useEffect(() => {
    if (!faviconUrl) return;

    // Find existing favicon links
    const existingFavicons = document.querySelectorAll(
      'link[rel="icon"], link[rel="shortcut icon"]'
    );

    // Update existing favicons or create new one
    if (existingFavicons.length > 0) {
      existingFavicons.forEach((link) => {
        (link as HTMLLinkElement).href = faviconUrl;
      });
    } else {
      // Create new favicon link if none exists
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = faviconUrl;
      document.head.appendChild(link);
    }

    // Also update apple-touch-icon if present
    const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (appleTouchIcon) {
      (appleTouchIcon as HTMLLinkElement).href = faviconUrl;
    }
  }, [faviconUrl]);

  // This component doesn't render anything
  return null;
}
