'use client';

import { Info } from 'lucide-react';
import { signIn } from 'next-auth/react';

import { useAppIconUrl, useBranding } from '@/lib/theme';
import { useThemeStore } from '@/stores/theme-store';

export default function SignInPage() {
  const branding = useBranding();
  const appIconUrl = useAppIconUrl();
  const heroImage = useThemeStore((s) => s.palette.heroImage);

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* ── Left: brand panel ─────────────────────────────────── */}
      <div
        className="relative hidden w-[45%] flex-col overflow-hidden lg:flex"
        style={{ backgroundColor: 'color-mix(in srgb, var(--primary-dark) 85%, #000 15%)' }}
      >
        {/* Hero image texture */}
        {heroImage && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-[0.08]"
            style={{ backgroundImage: `url(${heroImage})` }}
          />
        )}

        {/* Decorative blobs */}
        <div className="absolute right-[-80px] top-[-80px] h-80 w-80 rounded-full bg-white/[0.04] blur-3xl" />
        <div className="absolute bottom-[8%] right-[5%] h-96 w-96 rounded-full bg-white/[0.03] blur-3xl" />
        <div className="absolute left-[-60px] top-[35%] h-64 w-64 rounded-full bg-white/[0.03] blur-2xl" />

        {/* Brand composition — vertically centered, left-aligned */}
        <div className="relative z-10 flex flex-1 flex-col justify-center px-10">
          <div className="space-y-4">
            {/* Wordmark */}
            <div className="mb-6 flex items-center gap-3">
              {appIconUrl ? (
                <img
                  src={appIconUrl}
                  alt={branding.app_name}
                  className="h-[52px] w-[52px] rounded-2xl object-contain shadow-xl ring-2 ring-white/15"
                />
              ) : (
                <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-white/10 shadow-xl ring-2 ring-white/15">
                  <span className="text-xl font-bold text-white">
                    {branding.app_name.trim().charAt(0)}
                  </span>
                </div>
              )}
              <span className="text-[26px] font-bold tracking-tight text-white/80">
                {branding.app_name}
              </span>
            </div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white/35">
              {branding.subtitle}
            </p>
            <h2 className="text-[2.75rem] font-bold leading-[1.1] tracking-tight text-white">
              {branding.tagline}
            </h2>
            <p className="max-w-[360px] text-[15px] leading-relaxed text-white/45">
              {branding.description}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 px-10 pb-8">
          <p className="text-xs text-white/20">{branding.footer_name || branding.app_name}</p>
        </div>
      </div>

      {/* ── Right: sign-in panel ───────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-surface px-8">
        {/* Mobile wordmark (hidden on lg+) */}
        <div className="mb-10 flex items-center gap-2.5 lg:hidden">
          {appIconUrl && (
            <img
              src={appIconUrl}
              alt={branding.app_name}
              className="h-8 w-8 rounded-lg object-contain"
            />
          )}
          <span className="text-base font-semibold text-text-primary">{branding.app_name}</span>
        </div>

        {/* Animated content */}
        <div className="animate-signin-up w-full max-w-[340px]">
          {/* Heading */}
          <div className="mb-8 space-y-1.5 text-center">
            <h1 className="text-[1.85rem] font-bold tracking-tight text-text-primary">
              Welcome back
            </h1>
            <p className="text-sm text-text-muted">Sign in to your workspace to continue.</p>
          </div>

          {/* Google button */}
          <button
            onClick={() => signIn('google', { callbackUrl: '/' })}
            className="mb-3 flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 text-sm font-medium text-text-primary shadow-sm transition-all hover:-translate-y-px hover:border-border hover:shadow-md active:translate-y-0 active:shadow-sm"
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] flex-shrink-0" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </button>

          {/* Domain restriction */}
          {process.env.NEXT_PUBLIC_AUTH_DOMAIN && (
            <p className="mb-8 text-center text-xs text-text-muted">
              Restricted to{' '}
              <span className="font-medium text-text-secondary">
                @{process.env.NEXT_PUBLIC_AUTH_DOMAIN}
              </span>{' '}
              accounts
            </p>
          )}

          {/* Divider */}
          <div className="mb-6 border-t border-border" />

          {/* Access note */}
          <div className="flex items-start gap-2.5">
            <Info className="text-text-muted/60 mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <p className="text-text-muted/70 text-xs leading-relaxed">
              Access is restricted to authorized users. Contact your administrator if you need
              access.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
