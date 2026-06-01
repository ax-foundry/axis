'use client';

import { AlertCircle, Database, Link2, Loader2, Server } from 'lucide-react';
import { useEffect, useState } from 'react';

import * as api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useDatabaseStore } from '@/stores/database-store';
import { useUIStore } from '@/stores/ui-store';

import { BigQueryFields } from './BigQueryFields';
import { PostgresFields } from './PostgresFields';

import type { DatabaseType, SSLMode } from '@/stores/database-store';

/**
 * Parse a PostgreSQL connection URL into its components.
 * Supports postgresql://user:pass@host:port/database?sslmode=require
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
    const normalizedUrl = url.trim().replace(/^postgres:\/\//, 'postgresql://');
    if (!normalizedUrl.startsWith('postgresql://')) return null;
    const parsed = new URL(normalizedUrl);
    let sslMode: SSLMode = 'require';
    const sslParam = parsed.searchParams.get('sslmode');
    if (sslParam === 'disable') sslMode = 'disable';
    else if (sslParam === 'require' || sslParam === 'prefer') sslMode = 'require';
    return {
      host: parsed.hostname,
      port: parsed.port || '5432',
      database: parsed.pathname.slice(1),
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      sslMode,
    };
  } catch {
    return null;
  }
}

export function ConnectionForm() {
  const {
    dbType,
    setDbType,
    setHandle,
    setLoading,
    setError,
    setConfigFromDefaults,
    isLoading,
    error,
  } = useDatabaseStore();

  // Postgres state
  const [inputMode, setInputMode] = useState<'url' | 'manual'>('url');
  const [connectionUrl, setConnectionUrl] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('5432');
  const [pgDatabase, setPgDatabase] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [sslMode, setSslMode] = useState<SSLMode>('require');

  // BigQuery state (sa_private_key is intentionally never stored in Zustand)
  const [bqProjectId, setBqProjectId] = useState('');
  const [bqDataset, setBqDataset] = useState('');
  const [bqLocation, setBqLocation] = useState('');
  const [bqSaClientEmail, setBqSaClientEmail] = useState('');
  const [bqSaPrivateKey, setBqSaPrivateKey] = useState('');
  const [hasServerSaCredentials, setHasServerSaCredentials] = useState(false);

  const [loadingDefaults, setLoadingDefaults] = useState(true);
  const { databaseTargetStore } = useUIStore();

  useEffect(() => {
    async function loadDefaults() {
      try {
        const defaults = await api.databaseGetDefaults(databaseTargetStore);

        if (defaults.has_defaults) {
          if (defaults.db_type === 'bigquery') {
            if (defaults.project_id) setBqProjectId(defaults.project_id);
            if (defaults.dataset) setBqDataset(defaults.dataset);
            if (defaults.location) setBqLocation(defaults.location);
            setHasServerSaCredentials(defaults.has_sa_credentials);
          } else {
            setInputMode('manual');
            if (defaults.host) setHost(defaults.host);
            if (defaults.port) setPort(String(defaults.port));
            if (defaults.database) setPgDatabase(defaults.database);
            if (defaults.username) setUsername(defaults.username);
            if (defaults.has_password) setPassword('********');
            if (defaults.ssl_mode) setSslMode(defaults.ssl_mode as SSLMode);
          }
        }

        setConfigFromDefaults({
          db_type: defaults.db_type,
          tables: defaults.tables || [],
          filters: defaults.filters || [],
          column_rename_map: defaults.column_rename_map || {},
          query: defaults.query || null,
        });
      } catch {
        // Ignore errors loading defaults — form will just be empty
      }
      setLoadingDefaults(false);
    }

    loadDefaults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseTargetStore]);

  const handleConnect = async () => {
    setError(null);

    if (dbType === 'bigquery') {
      if (!bqProjectId.trim()) {
        setError('Project ID is required');
        return;
      }
      if (!bqDataset.trim()) {
        setError('Dataset is required');
        return;
      }

      setLoading(true);
      try {
        const response = await api.databaseConnect(
          {
            db_type: 'bigquery',
            project_id: bqProjectId.trim(),
            dataset: bqDataset.trim(),
            location: bqLocation.trim() || undefined,
            sa_client_email: bqSaClientEmail.trim() || undefined,
            sa_private_key: bqSaPrivateKey || null,
          },
          databaseTargetStore
        );
        if (response.success) setHandle(response.handle, response.version);
        else setError(response.message || 'Connection failed');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Connection failed');
      }
      return;
    }

    // Postgres path
    let connHost = host;
    let connPort = port;
    let connDatabase = pgDatabase;
    let connUsername = username;
    let connPassword = password;
    let connSslMode = sslMode;

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
    try {
      const response = await api.databaseConnect(
        {
          db_type: 'postgres',
          host: connHost.trim(),
          port: portNum,
          database: connDatabase.trim(),
          username: connUsername.trim(),
          password: connPassword,
          ssl_mode: connSslMode,
        },
        databaseTargetStore
      );
      if (response.success) setHandle(response.handle, response.version);
      else setError(response.message || 'Connection failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) handleConnect();
  };

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

      {/* Source Type Selector */}
      <div>
        <label className="mb-2 block text-sm font-medium text-text-primary">Source Type</label>
        <div className="flex gap-2">
          {(['postgres', 'bigquery'] as DatabaseType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setDbType(type)}
              disabled={isLoading}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors',
                dbType === type
                  ? 'border-violet-300 bg-violet-50 text-violet-700'
                  : 'border-border bg-surface text-text-secondary hover:border-violet-200 hover:bg-violet-50/50'
              )}
            >
              <Database className="h-4 w-4" />
              {type === 'postgres' ? 'PostgreSQL' : 'BigQuery'}
            </button>
          ))}
        </div>
      </div>

      {/* Postgres: URL/Manual toggle */}
      {dbType === 'postgres' && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setInputMode('url')}
            disabled={isLoading}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors',
              inputMode === 'url'
                ? 'border-violet-300 bg-violet-50 text-violet-700'
                : 'border-border bg-surface text-text-secondary hover:border-violet-200 hover:bg-violet-50/50'
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
                : 'border-border bg-surface text-text-secondary hover:border-violet-200 hover:bg-violet-50/50'
            )}
          >
            <Server className="h-4 w-4" />
            Manual Entry
          </button>
        </div>
      )}

      {/* Postgres: Connection URL */}
      {dbType === 'postgres' && inputMode === 'url' && (
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
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            disabled={isLoading}
          />
          <p className="mt-1.5 text-xs text-text-muted">
            Paste your PostgreSQL connection string (works with Neon, Supabase, Railway, etc.)
          </p>
        </div>
      )}

      {/* Postgres: Manual fields */}
      {dbType === 'postgres' && inputMode === 'manual' && (
        <PostgresFields
          host={host}
          port={port}
          database={pgDatabase}
          username={username}
          password={password}
          sslMode={sslMode}
          onHostChange={setHost}
          onPortChange={setPort}
          onDatabaseChange={setPgDatabase}
          onUsernameChange={setUsername}
          onPasswordChange={setPassword}
          onSslModeChange={setSslMode}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
      )}

      {/* BigQuery fields */}
      {dbType === 'bigquery' && (
        <BigQueryFields
          projectId={bqProjectId}
          dataset={bqDataset}
          location={bqLocation}
          saClientEmail={bqSaClientEmail}
          saPrivateKey={bqSaPrivateKey}
          hasServerSaCredentials={hasServerSaCredentials}
          onProjectIdChange={setBqProjectId}
          onDatasetChange={setBqDataset}
          onLocationChange={setBqLocation}
          onSaClientEmailChange={setBqSaClientEmail}
          onSaPrivateKeyChange={setBqSaPrivateKey}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
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
