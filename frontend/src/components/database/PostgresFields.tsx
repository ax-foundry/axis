'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

import type { SSLMode } from '@/stores/database-store';

const SSL_MODES: { value: SSLMode; label: string; description: string }[] = [
  { value: 'require', label: 'Require', description: 'Encrypt connection (recommended)' },
  { value: 'disable', label: 'Disable', description: 'No encryption' },
  {
    value: 'verify-ca',
    label: 'Verify CA',
    description: 'Verify server certificate (coming soon)',
  },
  { value: 'verify-full', label: 'Verify Full', description: 'Full verification (coming soon)' },
];

interface PostgresFieldsProps {
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  sslMode: SSLMode;
  onHostChange: (v: string) => void;
  onPortChange: (v: string) => void;
  onDatabaseChange: (v: string) => void;
  onUsernameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSslModeChange: (v: SSLMode) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  disabled?: boolean;
}

export function PostgresFields({
  host,
  port,
  database,
  username,
  password,
  sslMode,
  onHostChange,
  onPortChange,
  onDatabaseChange,
  onUsernameChange,
  onPasswordChange,
  onSslModeChange,
  onKeyDown,
  disabled = false,
}: PostgresFieldsProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Host */}
      <div className="col-span-2 sm:col-span-1">
        <label className="mb-1.5 block text-sm font-medium text-text-primary">
          Host <span className="text-error">*</span>
        </label>
        <input
          type="text"
          value={host}
          onChange={(e) => onHostChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="db.example.com"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          disabled={disabled}
        />
      </div>

      {/* Port */}
      <div className="col-span-2 sm:col-span-1">
        <label className="mb-1.5 block text-sm font-medium text-text-primary">Port</label>
        <input
          type="text"
          value={port}
          onChange={(e) => onPortChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="5432"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          disabled={disabled}
        />
      </div>

      {/* Database */}
      <div className="col-span-2">
        <label className="mb-1.5 block text-sm font-medium text-text-primary">
          Database <span className="text-error">*</span>
        </label>
        <input
          type="text"
          value={database}
          onChange={(e) => onDatabaseChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="mydb"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          disabled={disabled}
        />
      </div>

      {/* Username */}
      <div className="col-span-2 sm:col-span-1">
        <label className="mb-1.5 block text-sm font-medium text-text-primary">
          Username <span className="text-error">*</span>
        </label>
        <input
          type="text"
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="postgres"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          disabled={disabled}
        />
      </div>

      {/* Password */}
      <div className="col-span-2 sm:col-span-1">
        <label className="mb-1.5 block text-sm font-medium text-text-primary">
          Password <span className="text-error">*</span>
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="********"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 pr-10 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            disabled={disabled}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* SSL Mode */}
      <div className="col-span-2">
        <label className="mb-1.5 block text-sm font-medium text-text-primary">SSL Mode</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SSL_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => onSslModeChange(mode.value)}
              disabled={disabled || mode.value === 'verify-ca' || mode.value === 'verify-full'}
              className={cn(
                'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                sslMode === mode.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border bg-surface text-text-primary hover:border-primary/30',
                (mode.value === 'verify-ca' || mode.value === 'verify-full') &&
                  'cursor-not-allowed opacity-50'
              )}
            >
              <span className="block font-medium">{mode.label}</span>
              <span className="block text-xs text-text-muted">{mode.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
