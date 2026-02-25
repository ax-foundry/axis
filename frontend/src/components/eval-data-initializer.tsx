'use client';

import { type ReactNode, useEffect, useRef } from 'react';

import { useEvalDBConfig, useEvalAutoImport } from '@/lib/hooks/useEvalAutoImport';
import { useDataStore } from '@/stores';

import type { UploadResponse } from '@/types';

interface EvalDataInitializerProps {
  children: ReactNode;
}

/**
 * EvalDataInitializer checks for database auto-load configuration on mount
 * and triggers auto-import if enabled.
 *
 * Behavior:
 * - Checks eval DB config on mount
 * - If auto_load is enabled and no data exists, triggers import
 * - Graceful failure: logs warning and continues without data
 * - Skips if user already has data loaded
 *
 * Wrap your app with this provider to enable auto-loading evaluation data.
 */
export function EvalDataInitializer({ children }: EvalDataInitializerProps) {
  const { data: existingData } = useDataStore();
  const { data: config, isLoading: configLoading, error: configError } = useEvalDBConfig();
  const { mutate: autoImport, isPending: isImporting } = useEvalAutoImport();

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

    console.log('[EvalDataInitializer] Auto-loading evaluation data from database...');

    autoImport(undefined, {
      onSuccess: (response: UploadResponse) => {
        console.log(
          `[EvalDataInitializer] Successfully loaded ${response.row_count} records from database`
        );
      },
      onError: (error: Error) => {
        // Graceful failure - log warning but don't block the app
        console.warn(
          '[EvalDataInitializer] Auto-import failed, continuing without data:',
          error.message
        );
      },
    });
  }, [config, configLoading, configError, existingData.length, autoImport, isImporting]);

  // Always render children - auto-import happens in background
  return <>{children}</>;
}
