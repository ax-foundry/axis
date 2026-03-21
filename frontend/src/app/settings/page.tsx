'use client';

import { CheckCircle, Loader2, Monitor, Moon, Settings, Sun, XCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

import { PageHeader } from '@/components/ui/PageHeader';
import { API_BASE_URL } from '@/lib/api';
import { useBranding } from '@/lib/theme';
import { useThemeStore } from '@/stores/theme-store';

type ColorScheme = 'light' | 'dark' | 'system';

function BackendStatus() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'error'>('checking');

  useEffect(() => {
    const check = async () => {
      try {
        const url = API_BASE_URL ? `${API_BASE_URL}/health` : '/api/config/theme';
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        setStatus(res.ok ? 'connected' : 'error');
      } catch {
        setStatus('error');
      }
    };
    check();
  }, []);

  return (
    <div className="flex items-center gap-2">
      {status === 'checking' && (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
          <span className="text-sm text-text-muted">Checking...</span>
        </>
      )}
      {status === 'connected' && (
        <>
          <CheckCircle className="h-4 w-4 text-success" />
          <span className="text-sm text-success">Connected</span>
        </>
      )}
      {status === 'error' && (
        <>
          <XCircle className="h-4 w-4 text-error" />
          <span className="text-sm text-error">Unreachable</span>
        </>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { palette, applyPalette } = useThemeStore();
  const branding = useBranding();

  const [colorScheme, setColorScheme] = useState<ColorScheme>('system');

  useEffect(() => {
    const saved = localStorage.getItem('axis-color-scheme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      setColorScheme(saved);
    }
  }, []);

  const handleColorSchemeChange = (scheme: ColorScheme) => {
    setColorScheme(scheme);
    localStorage.setItem('axis-color-scheme', scheme);
    applyPalette({
      ...palette,
      heroMode: scheme === 'system' ? null : scheme,
    });
  };

  const schemeOptions: { value: ColorScheme; label: string; Icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', Icon: Sun },
    { value: 'dark', label: 'Dark', Icon: Moon },
    { value: 'system', label: 'System', Icon: Monitor },
  ];

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Settings}
        title="Settings"
        subtitle="Appearance and preferences"
        maxWidth="max-w-4xl"
      />

      <div className="mx-auto max-w-4xl px-6 py-6">
        <div className="space-y-5">
          {/* Appearance */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Sun className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-text-primary">Appearance</h2>
                <p className="text-sm text-text-muted">Choose your preferred color scheme</p>
              </div>
            </div>
            <div className="inline-flex rounded-lg border border-border bg-gray-50 p-1 dark:bg-gray-900">
              {schemeOptions.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  onClick={() => handleColorSchemeChange(value)}
                  className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    colorScheme === value
                      ? 'bg-white text-text-primary shadow-sm dark:bg-gray-800'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* About */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Settings className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-text-primary">About</h2>
                <p className="text-sm text-text-muted">System information</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-900">
                <span className="text-sm text-text-muted">Application</span>
                <span className="text-sm font-medium text-text-primary">{branding.app_name}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-900">
                <span className="text-sm text-text-muted">Backend</span>
                <BackendStatus />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
