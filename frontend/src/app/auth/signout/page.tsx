'use client';

import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';

import { useAppIconUrl, useBranding } from '@/lib/theme';
import { useThemeStore } from '@/stores/theme-store';

export default function SignOutPage() {
  const branding = useBranding();
  const appIconUrl = useAppIconUrl();
  const heroImage = useThemeStore((s) => s.palette.heroImage);
  const router = useRouter();

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ backgroundColor: 'color-mix(in srgb, var(--primary-dark) 85%, #000 15%)' }}
    >
      {/* Hero image background */}
      {heroImage && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-[0.08]"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
      )}

      {/* Decorative blobs */}
      <div className="absolute right-[-80px] top-[-80px] h-80 w-80 rounded-full bg-white/[0.04] blur-3xl" />
      <div className="absolute bottom-[8%] left-[5%] h-96 w-96 rounded-full bg-white/[0.03] blur-3xl" />
      <div className="absolute left-[-60px] top-[35%] h-64 w-64 rounded-full bg-white/[0.03] blur-2xl" />

      {/* Card */}
      <div className="animate-signin-up relative z-10 flex w-full max-w-[380px] flex-col items-center rounded-2xl border border-white/10 bg-white/[0.06] px-10 py-10 text-center shadow-2xl backdrop-blur-sm">
        {/* Icon */}
        {appIconUrl ? (
          <img
            src={appIconUrl}
            alt={branding.app_name}
            className="mb-4 h-14 w-14 rounded-2xl object-contain ring-2 ring-white/15"
          />
        ) : (
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-2 ring-white/15">
            <span className="text-xl font-bold text-white">
              {branding.app_name.trim().charAt(0)}
            </span>
          </div>
        )}

        <p className="mb-6 text-[15px] font-semibold tracking-tight text-white/70">
          {branding.app_name}
        </p>

        <h1 className="mb-2 text-[1.5rem] font-bold tracking-tight text-white">Sign out?</h1>
        <p className="mb-8 text-sm leading-relaxed text-white/45">
          You&apos;ll need to sign in again to access your workspace.
        </p>

        {/* Actions */}
        <div className="flex w-full flex-col gap-2.5">
          <button
            onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            className="w-full rounded-xl bg-surface px-4 py-3 text-sm font-semibold text-text-primary shadow-sm transition-all hover:-translate-y-px hover:shadow-md active:translate-y-0"
          >
            Sign out
          </button>
          <button
            onClick={() => router.back()}
            className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-white/60 transition-all hover:border-white/20 hover:text-white/80"
          >
            Stay signed in
          </button>
        </div>
      </div>

      {/* Footer */}
      <p className="relative z-10 mt-8 text-xs text-white/20">
        {branding.footer_name || branding.app_name}
      </p>
    </div>
  );
}
