'use client';

import { type ReactNode, useEffect, useRef } from 'react';

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
 * - Checks monitoring DB config on mount
 * - If auto_load is enabled and no data exists, triggers import
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

  useEffect(() => {
    // Skip if:
    // - Config is still loading
    // - Config fetch failed (backend not available)
    // - Already attempted import
    // - User already has data loaded
    // - Auto-load is not enabled
    // - Database is not configured
    // - Currently importing
    if (
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
  }, [config, configLoading, configError, existingData.length, autoImport, isImporting]);

  // Always render children - auto-import happens in background
  return <>{children}</>;
}
