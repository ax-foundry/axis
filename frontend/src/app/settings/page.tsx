'use client';

import { Database, Palette, Server, Settings, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

import { PageHeader } from '@/components/ui/PageHeader';
import { useDataStore } from '@/stores';
import { useThemeStore } from '@/stores/theme-store';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8500';

function ConnectionStatus() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [version, setVersion] = useState<string | null>(null);

  const checkConnection = async () => {
    setStatus('checking');
    try {
      const res = await fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        setVersion(data.version || null);
        setStatus('connected');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    checkConnection();
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
          {version && <span className="text-xs text-text-muted">v{version}</span>}
        </>
      )}
      {status === 'error' && (
        <>
          <XCircle className="h-4 w-4 text-error" />
          <span className="text-sm text-error">Unreachable</span>
        </>
      )}
      <button
        onClick={checkConnection}
        className="ml-2 rounded px-2 py-0.5 text-xs text-text-muted hover:bg-gray-100 hover:text-text-primary"
      >
        Retry
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { clearData } = useDataStore();
  const { activePaletteName, palette, isLoaded, error: themeError } = useThemeStore();

  const handleClearLocalStorage = () => {
    if (window.confirm('Are you sure you want to clear all local data? This cannot be undone.')) {
      clearData();
      localStorage.clear();
      window.location.reload();
    }
  };

  const handleExportData = () => {
    const exportData = {
      backendUrl: API_BASE_URL,
      theme: {
        activePalette: activePaletteName,
        colors: {
          primary: palette.primary,
          primaryLight: palette.primaryLight,
          primaryDark: palette.primaryDark,
          accentGold: palette.accentGold,
          accentSilver: palette.accentSilver,
        },
      },
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'axis-settings-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Settings}
        title="Settings"
        subtitle="System configuration and status"
        maxWidth="max-w-4xl"
      />

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="space-y-6">
          {/* Backend Connection */}
          <div className="rounded-xl border border-border bg-white p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Server className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-text-primary">Backend Connection</h2>
                <p className="text-sm text-text-muted">API server status and endpoint</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
                <div>
                  <p className="text-xs font-medium text-text-muted">API Endpoint</p>
                  <p className="font-mono text-sm text-text-primary">{API_BASE_URL}</p>
                </div>
                <ConnectionStatus />
              </div>
              <p className="text-xs text-text-muted">
                Set via{' '}
                <code className="rounded bg-gray-100 px-1.5 py-0.5">NEXT_PUBLIC_API_URL</code>{' '}
                environment variable. Defaults to{' '}
                <code className="rounded bg-gray-100 px-1.5 py-0.5">http://localhost:8500</code>.
              </p>
            </div>
          </div>

          {/* Active Theme */}
          <div className="rounded-xl border border-border bg-white p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-gold/10">
                <Palette className="h-5 w-5 text-accent-gold" />
              </div>
              <div>
                <h2 className="font-semibold text-text-primary">Theme</h2>
                <p className="text-sm text-text-muted">
                  Active color palette from backend configuration
                </p>
              </div>
            </div>
            {!isLoaded && !themeError ? (
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading theme...
              </div>
            ) : themeError ? (
              <p className="text-sm text-text-muted">
                Using default palette (backend theme config unavailable)
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
                  <div>
                    <p className="text-xs font-medium text-text-muted">Active Palette</p>
                    <p className="text-sm font-medium text-text-primary">
                      {palette.name || activePaletteName}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-text-muted">Colors</p>
                  <div className="flex gap-2">
                    {[
                      { label: 'Primary', color: palette.primary },
                      { label: 'Light', color: palette.primaryLight },
                      { label: 'Dark', color: palette.primaryDark },
                      { label: 'Soft', color: palette.primarySoft },
                      { label: 'Gold', color: palette.accentGold },
                      { label: 'Silver', color: palette.accentSilver },
                    ].map((swatch) => (
                      <div key={swatch.label} className="text-center">
                        <div
                          className="mx-auto mb-1 h-8 w-8 rounded-lg border border-border"
                          style={{ backgroundColor: swatch.color }}
                          title={swatch.color}
                        />
                        <p className="text-[10px] text-text-muted">{swatch.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-text-muted">
                  Theme is configured via the backend{' '}
                  <code className="rounded bg-gray-100 px-1.5 py-0.5">config.yaml</code> or
                  environment variables. See backend documentation for customization.
                </p>
              </div>
            )}
          </div>

          {/* Data Management */}
          <div className="rounded-xl border border-border bg-white p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="bg-error/10 flex h-10 w-10 items-center justify-center rounded-lg">
                <Database className="h-5 w-5 text-error" />
              </div>
              <div>
                <h2 className="font-semibold text-text-primary">Data Management</h2>
                <p className="text-sm text-text-muted">Local storage and cached data</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-gray-50"
                onClick={handleExportData}
              >
                Export Settings
              </button>
              <button
                className="border-error/30 hover:bg-error/5 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-error transition-colors"
                onClick={handleClearLocalStorage}
              >
                Clear Local Storage
              </button>
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Clearing local storage removes all cached evaluation data, filter preferences, and UI
              state. The page will reload.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
