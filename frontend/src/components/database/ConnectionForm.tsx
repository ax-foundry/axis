'use client';

import { AlertCircle, Database, Eye, EyeOff, Link2, Loader2, Server } from 'lucide-react';
import { useEffect, useState } from 'react';

import * as api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useDatabaseStore } from '@/stores/database-store';
import { useUIStore } from '@/stores/ui-store';

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

/**
 * Parse a PostgreSQL connection URL into its components.
 * Supports formats like:
 * - postgresql://user:pass@host:port/database?sslmode=require
 * - postgres://user:pass@host/database
 */
function parseConnectionUrl(url: string): {
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  sslMode: SSLMode;
} | null {
  try {
    // Handle both postgresql:// and postgres:// schemes
    const normalizedUrl = url.trim().replace(/^postgres:\/\//, 'postgresql://');

    if (!normalizedUrl.startsWith('postgresql://')) {
      return null;
    }

    const parsed = new URL(normalizedUrl);

    // Extract SSL mode from query params
    let sslMode: SSLMode = 'require';
    const sslParam = parsed.searchParams.get('sslmode');
    if (sslParam === 'disable') {
      sslMode = 'disable';
    } else if (sslParam === 'require' || sslParam === 'prefer') {
      sslMode = 'require';
    }

    return {
      host: parsed.hostname,
      port: parsed.port || '5432',
      database: parsed.pathname.slice(1), // Remove leading /
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      sslMode,
    };
  } catch {
    return null;
  }
}

export function ConnectionForm() {
  const { setHandle, setLoading, setError, setConfigFromDefaults, isLoading, error } =
    useDatabaseStore();

  const [inputMode, setInputMode] = useState<'url' | 'manual'>('url');
  const [connectionUrl, setConnectionUrl] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('5432');
  const [database, setDatabase] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [sslMode, setSslMode] = useState<SSLMode>('require');
  const [showPassword, setShowPassword] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(true);
  const { databaseTargetStore } = useUIStore();

  // Fetch defaults from backend on mount
  useEffect(() => {
    async function loadDefaults() {
      try {
        const defaults = await api.databaseGetDefaults(databaseTargetStore);

        if (defaults.has_defaults) {
          // Server always provides individual fields (parsed from URL if needed).
          // Default to manual mode so the password stays masked.
          setInputMode('manual');

          if (defaults.host) setHost(defaults.host);
          if (defaults.port) setPort(String(defaults.port));
          if (defaults.database) setDatabase(defaults.database);
          if (defaults.username) setUsername(defaults.username);
          if (defaults.has_password) setPassword('********');
          if (defaults.ssl_mode) setSslMode(defaults.ssl_mode as SSLMode);
        }

        // Bridge wizard config fields to the store
        setConfigFromDefaults({
          tables: defaults.tables || [],
          filters: defaults.filters || [],
          column_rename_map: defaults.column_rename_map || {},
          query: defaults.query || null,
        });
      } catch {
        // Ignore errors loading defaults - form will just be empty
      }
      setLoadingDefaults(false);
    }

    loadDefaults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseTargetStore]);

  const handleConnect = async () => {
    let connHost = host;
    let connPort = port;
    let connDatabase = database;
    let connUsername = username;
    let connPassword = password;
    let connSslMode = sslMode;

    // If URL mode, parse the connection URL
    if (inputMode === 'url') {
      if (!connectionUrl.trim()) {
        setError('Connection URL is required');
        return;
      }

      const parsed = parseConnectionUrl(connectionUrl);
      if (!parsed) {
        setError(
          'Invalid connection URL. Expected format: postgresql://user:password@host:port/database'
        );
        return;
      }

      connHost = parsed.host;
      connPort = parsed.port;
      connDatabase = parsed.database;
      connUsername = parsed.username;
      connPassword = parsed.password;
      connSslMode = parsed.sslMode;
    }

    // Validate required fields
    if (!connHost.trim()) {
      setError('Host is required');
      return;
    }
    if (!connDatabase.trim()) {
      setError('Database name is required');
      return;
    }
    if (!connUsername.trim()) {
      setError('Username is required');
      return;
    }
    if (!connPassword) {
      setError('Password is required');
      return;
    }

    const portNum = parseInt(connPort, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setError('Port must be between 1 and 65535');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.databaseConnect(
        {
          host: connHost.trim(),
          port: portNum,
          database: connDatabase.trim(),
          username: connUsername.trim(),
          password: connPassword,
          ssl_mode: connSslMode,
        },
        databaseTargetStore
      );

      if (response.success) {
        setHandle(response.handle, response.version);
      } else {
        setError(response.message || 'Connection failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleConnect();
    }
  };

  // Show loading state while fetching defaults
  if (loadingDefaults) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Network Topology Warning */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex gap-3">
          <Server className="h-5 w-5 flex-shrink-0 text-amber-600" />
          <div className="text-sm text-amber-800">
            <p className="mb-1 font-medium">Network Requirements</p>
            <p className="text-amber-700">
              The database must be reachable from the AXIS backend server. This typically means:
            </p>
            <ul className="ml-4 mt-1 list-disc text-amber-700">
              <li>Publicly accessible databases with firewall rules</li>
              <li>VPN-connected databases</li>
              <li>Databases in the same cloud VPC</li>
            </ul>
            <p className="mt-2 text-amber-700">
              Local databases on your laptop will not work unless AXIS is also running locally.
            </p>
          </div>
        </div>
      </div>

      {/* Input Mode Toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setInputMode('url')}
          disabled={isLoading}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors',
            inputMode === 'url'
              ? 'border-violet-300 bg-violet-50 text-violet-700'
              : 'border-border bg-white text-text-secondary hover:border-violet-200 hover:bg-violet-50/50'
          )}
        >
          <Link2 className="h-4 w-4" />
          Connection URL
        </button>
        <button
          type="button"
          onClick={() => setInputMode('manual')}
          disabled={isLoading}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors',
            inputMode === 'manual'
              ? 'border-violet-300 bg-violet-50 text-violet-700'
              : 'border-border bg-white text-text-secondary hover:border-violet-200 hover:bg-violet-50/50'
          )}
        >
          <Server className="h-4 w-4" />
          Manual Entry
        </button>
      </div>

      {/* Connection URL Input */}
      {inputMode === 'url' && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-primary">
            Connection URL <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={connectionUrl}
            onChange={(e) => setConnectionUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="postgresql://user:password@host:5432/database?sslmode=require"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 font-mono text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            disabled={isLoading}
          />
          <p className="mt-1.5 text-xs text-text-muted">
            Paste your PostgreSQL connection string (works with Neon, Supabase, Railway, etc.)
          </p>
        </div>
      )}

      {/* Manual Connection Form */}
      {inputMode === 'manual' && (
        <div className="grid grid-cols-2 gap-4">
          {/* Host */}
          <div className="col-span-2 sm:col-span-1">
            <label className="mb-1.5 block text-sm font-medium text-text-primary">
              Host <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="db.example.com"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              disabled={isLoading}
            />
          </div>

          {/* Port */}
          <div className="col-span-2 sm:col-span-1">
            <label className="mb-1.5 block text-sm font-medium text-text-primary">Port</label>
            <input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="5432"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              disabled={isLoading}
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
              onChange={(e) => setDatabase(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="mydb"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              disabled={isLoading}
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
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="postgres"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              disabled={isLoading}
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
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="********"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 pr-10 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                disabled={isLoading}
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
                  onClick={() => setSslMode(mode.value)}
                  disabled={isLoading || mode.value === 'verify-ca' || mode.value === 'verify-full'}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                    sslMode === mode.value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border bg-white text-text-primary hover:border-primary/30',
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
      )}

      {/* Error Message */}
      {error && (
        <div className="border-error/20 bg-error/5 flex items-start gap-2 rounded-lg border p-3 text-sm text-error">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Connect Button */}
      <button
        onClick={handleConnect}
        disabled={isLoading}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-medium text-white transition-all',
          'bg-gradient-to-r from-violet-500 to-violet-600 shadow-lg shadow-violet-500/25',
          'hover:shadow-xl hover:shadow-violet-500/30',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            <Database className="h-4 w-4" />
            Connect to Database
          </>
        )}
      </button>
    </div>
  );
}
