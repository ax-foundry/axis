'use client';

import { type ReactNode, useEffect, useRef } from 'react';

import {
  useHumanSignalsDBConfig,
  useHumanSignalsAutoImport,
} from '@/lib/hooks/useHumanSignalsUpload';
import { useHumanSignalsStore } from '@/stores/human-signals-store';

import type { HumanSignalsUploadResponse } from '@/lib/api';

interface HumanSignalsDataInitializerProps {
  children: ReactNode;
}

/**
 * HumanSignalsDataInitializer checks for database auto-load configuration on mount
 * and triggers auto-import if enabled.
 *
 * Behavior:
 * - Checks human signals DB config on mount
 * - If auto_load is enabled and no data exists, triggers import
 * - Graceful failure: logs warning and continues without data
 * - Skips if user already has data loaded
 *
 * Wrap your app with this provider to enable auto-loading human signals data.
 */
export function HumanSignalsDataInitializer({ children }: HumanSignalsDataInitializerProps) {
  const cases = useHumanSignalsStore((s) => s.cases);
  const { data: config, isLoading: configLoading, error: configError } = useHumanSignalsDBConfig();
  const { mutate: autoImport, isPending: isImporting } = useHumanSignalsAutoImport();

  // Track if we've already attempted auto-import to prevent multiple attempts
  const hasAttemptedImport = useRef(false);

  useEffect(() => {
    if (
      configLoading ||
      configError ||
      hasAttemptedImport.current ||
      cases.length > 0 ||
      !config?.auto_load ||
      !config?.configured ||
      isImporting
    ) {
      return;
    }

    hasAttemptedImport.current = true;

    console.log('[HumanSignalsDataInitializer] Auto-loading human signals data from database...');

    autoImport(undefined, {
      onSuccess: (response: HumanSignalsUploadResponse) => {
        console.log(
          `[HumanSignalsDataInitializer] Successfully loaded ${response.row_count} records from database`
        );
      },
      onError: (error: Error) => {
        console.warn(
          '[HumanSignalsDataInitializer] Auto-import failed, continuing without data:',
          error.message
        );
      },
    });
  }, [config, configLoading, configError, cases.length, autoImport, isImporting]);

  return <>{children}</>;
}
