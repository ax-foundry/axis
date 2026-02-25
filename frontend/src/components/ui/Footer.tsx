'use client';

import { BookOpen, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

import { useAppIconUrl, useBranding } from '@/lib/theme';

export function Footer() {
  const pathname = usePathname();
  const branding = useBranding();
  const appIconUrl = useAppIconUrl();
  const footerIcon = branding.footer_icon || appIconUrl;
  const year = new Date().getFullYear();

  // Home page has its own themed footer
  if (pathname === '/') return null;

  return (
    <footer className="border-t border-border bg-white px-6 py-4">
      <div className="flex flex-col items-center justify-between gap-3 md:flex-row">
        {/* Left: App icon + name + year */}
        <div className="flex items-center gap-2">
          {footerIcon && (
            <Image
              src={footerIcon}
              alt={branding.footer_name}
              width={16}
              height={16}
              className="h-4 w-4 object-contain"
              unoptimized
            />
          )}
          <span className="text-xs font-semibold text-text-muted">{branding.footer_name}</span>
          <span className="text-text-muted/50 text-xs">&middot; &copy; {year}</span>
        </div>

        {/* Right: Documentation + Powered by */}
        <div className="flex items-center gap-3 text-xs text-text-muted">
          {branding.docs_url && (
            <>
              <a
                href={branding.docs_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-primary"
              >
                <BookOpen className="h-3 w-3" />
                Documentation
                <ExternalLink className="h-3 w-3" />
              </a>
              <span className="text-text-muted/30">&middot;</span>
            </>
          )}
          <a
            href="https://github.com/ax-foundry/axion"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-primary"
          >
            Powered by Axion
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </footer>
  );
}
