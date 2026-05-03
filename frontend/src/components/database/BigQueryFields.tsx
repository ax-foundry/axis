'use client';

import { AlertTriangle, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

type AuthMode = 'server' | 'paste';

interface BigQueryFieldsProps {
  projectId: string;
  dataset: string;
  location: string;
  saClientEmail: string;
  saPrivateKey: string; // component-local only — never stored in Zustand
  hasServerSaCredentials: boolean; // whether server has SA key configured
  onProjectIdChange: (v: string) => void;
  onDatasetChange: (v: string) => void;
  onLocationChange: (v: string) => void;
  onSaClientEmailChange: (v: string) => void;
  onSaPrivateKeyChange: (v: string) => void; // component-local callback only
  onKeyDown?: (e: React.KeyboardEvent) => void;
  disabled?: boolean;
}

export function BigQueryFields({
  projectId,
  dataset,
  location,
  saClientEmail,
  saPrivateKey,
  hasServerSaCredentials,
  onProjectIdChange,
  onDatasetChange,
  onLocationChange,
  onSaClientEmailChange,
  onSaPrivateKeyChange,
  onKeyDown,
  disabled = false,
}: BigQueryFieldsProps) {
  const [authMode, setAuthMode] = useState<AuthMode>(hasServerSaCredentials ? 'server' : 'server');
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="space-y-4">
      {/* Project ID */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-primary">
          Project ID <span className="text-error">*</span>
        </label>
        <input
          type="text"
          value={projectId}
          onChange={(e) => onProjectIdChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="my-gcp-project"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          disabled={disabled}
        />
      </div>

      {/* Dataset */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-primary">
          Dataset <span className="text-error">*</span>
        </label>
        <input
          type="text"
          value={dataset}
          onChange={(e) => onDatasetChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="my_dataset"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          disabled={disabled}
        />
      </div>

      {/* Location */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-primary">Location</label>
        <input
          type="text"
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="US"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          disabled={disabled}
        />
        <p className="mt-1 text-xs text-text-muted">
          BigQuery processing region, e.g. US, EU, us-central1
        </p>
      </div>

      {/* Auth section */}
      <div>
        <label className="mb-2 block text-sm font-medium text-text-primary">Authentication</label>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setAuthMode('server')}
            disabled={disabled}
            className={cn(
              'flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors',
              authMode === 'server'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/30'
            )}
          >
            <ShieldCheck
              className={cn(
                'mt-0.5 h-4 w-4 flex-shrink-0',
                authMode === 'server' ? 'text-primary' : 'text-text-muted'
              )}
            />
            <div>
              <div className="font-medium text-text-primary">
                Use server-side credentials{' '}
                <span className="text-xs font-normal text-text-muted">(recommended)</span>
              </div>
              <div className="text-xs text-text-muted">
                {hasServerSaCredentials
                  ? 'Service-account key is configured on the server — reconnect without re-pasting.'
                  : 'Uses ADC or GCP_SA_* env vars configured on the AXIS backend server.'}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setAuthMode('paste')}
            disabled={disabled}
            className={cn(
              'flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors',
              authMode === 'paste'
                ? 'border-amber-400 bg-amber-50'
                : 'border-border hover:border-amber-300'
            )}
          >
            <AlertTriangle
              className={cn(
                'mt-0.5 h-4 w-4 flex-shrink-0',
                authMode === 'paste' ? 'text-amber-600' : 'text-text-muted'
              )}
            />
            <div>
              <div className="font-medium text-text-primary">Paste service account key</div>
              <div className="text-xs text-text-muted">
                For one-off sessions. The key is kept in memory only and cleared on page refresh.
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* SA fields shown only when paste mode is selected */}
      {authMode === 'paste' && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-start gap-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>
              <strong>Never paste credentials</strong> into a browser unless you trust the AXIS
              server endpoint. Pasted keys are kept only in memory for this session — they are not
              saved anywhere and will be cleared on page refresh.
            </span>
          </p>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">
              Service Account Email <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={saClientEmail}
              onChange={(e) => onSaClientEmailChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="my-sa@my-project.iam.gserviceaccount.com"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 font-mono text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              disabled={disabled}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">
              Private Key (PEM) <span className="text-error">*</span>
            </label>
            {hasServerSaCredentials && saPrivateKey === '********' ? (
              <p className="text-xs text-text-muted">
                Server-side key is active — reconnect uses
                &#x2731;&#x2731;&#x2731;&#x2731;&#x2731;&#x2731;&#x2731;&#x2731;. To replace it,
                paste a new key below.
              </p>
            ) : null}
            <div className="relative">
              <textarea
                rows={4}
                value={saPrivateKey}
                onChange={(e) => onSaPrivateKeyChange(e.target.value)}
                placeholder={
                  hasServerSaCredentials
                    ? '******** (server-side key active — leave blank to reuse)'
                    : '-----BEGIN RSA PRIVATE KEY-----\n...'
                }
                className="w-full rounded-lg border border-border bg-white px-3 py-2 pr-10 font-mono text-xs transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                disabled={disabled}
                style={{ display: showKey ? 'block' : 'none' }}
              />
              {!showKey && (
                <div className="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2">
                  <span className="font-mono text-xs text-text-muted">
                    {saPrivateKey ? '●●●●●●●●●●●●●●●●●●●●' : '(not set)'}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-2 p-1 text-text-muted hover:text-text-primary"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
