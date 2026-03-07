'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

import { getStoreStatus } from '@/lib/api';
import { useMonitoringDBConfig, useMonitoringAutoImport } from '@/lib/hooks/useMonitoringUpload';
import { useMonitoringStore } from '@/stores';

import type { MonitoringUploadResponse } from '@/lib/api';

interface MonitoringDataInitializerProps {
  children: ReactNode;
}

/**
 * MonitoringDataInitializer checks for database auto-load configuration on mount
 * and triggers auto-import if enabled.
 *
 * Behavior:
 * - First checks if DuckDB already has monitoring data (from sync engine)
 * - If DuckDB is ready, skips the legacy import entirely
 * - If no DuckDB data and auto_load is enabled, triggers legacy import
 * - Graceful failure: logs warning and continues without data
 * - Skips if user already has data loaded
 *
 * Wrap your app with this provider to enable auto-loading monitoring data.
 */
export function MonitoringDataInitializer({ children }: MonitoringDataInitializerProps) {
  const { data: existingData } = useMonitoringStore();
  const { data: config, isLoading: configLoading, error: configError } = useMonitoringDBConfig();
  const { mutate: autoImport, isPending: isImporting } = useMonitoringAutoImport();

  // Track if we've already attempted auto-import to prevent multiple attempts
  const hasAttemptedImport = useRef(false);

  // Check DuckDB store status before deciding whether to legacy-import
  const [duckdbChecked, setDuckdbChecked] = useState(false);
  const [duckdbReady, setDuckdbReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getStoreStatus()
      .then((status) => {
        if (cancelled) return;
        const monStatus = status.datasets?.monitoring_data;
        if (monStatus?.state === 'ready' && monStatus.rows > 0) {
          setDuckdbReady(true);
        }
      })
      .catch(() => {
        // Store not available — will fall through to legacy import
      })
      .finally(() => {
        if (!cancelled) setDuckdbChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Skip if:
    // - DuckDB status not checked yet
    // - DuckDB already has the data (sync engine handled it)
    // - Config is still loading
    // - Config fetch failed (backend not available)
    // - Already attempted import
    // - User already has data loaded
    // - Auto-load is not enabled
    // - Database is not configured
    // - Currently importing
    if (
      !duckdbChecked ||
      duckdbReady ||
      configLoading ||
      configError ||
      hasAttemptedImport.current ||
      existingData.length > 0 ||
      !config?.auto_load ||
      !config?.configured ||
      isImporting
    ) {
      return;
    }

    // Mark as attempted before starting import
    hasAttemptedImport.current = true;

    console.log('[MonitoringDataInitializer] Auto-loading monitoring data from database...');

    autoImport(undefined, {
      onSuccess: (response: MonitoringUploadResponse) => {
        console.log(
          `[MonitoringDataInitializer] Successfully loaded ${response.row_count} records from database`
        );
      },
      onError: (error: Error) => {
        // Graceful failure - log warning but don't block the app
        console.warn(
          '[MonitoringDataInitializer] Auto-import failed, continuing without data:',
          error.message
        );
      },
    });
  }, [
    duckdbChecked,
    duckdbReady,
    config,
    configLoading,
    configError,
    existingData.length,
    autoImport,
    isImporting,
  ]);

  // Always render children - auto-import happens in background
  return <>{children}</>;
}
