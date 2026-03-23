'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

import { getStoreStatus } from '@/lib/api';
import { MAX_STORE_STATUS_POLLS } from '@/lib/hooks/sync-retry';
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
  const setSyncStatus = useHumanSignalsStore((s) => s.setSyncStatus);
  const { data: config, isLoading: configLoading, error: configError } = useHumanSignalsDBConfig();
  const { mutate: autoImport, isPending: isImporting } = useHumanSignalsAutoImport();

  // Track if we've already attempted auto-import to prevent multiple attempts
  const hasAttemptedImport = useRef(false);

  // Check DuckDB status on mount to set datasetReady for UX
  const [duckdbChecked, setDuckdbChecked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    let pollCount = 0;

    const poll = async () => {
      try {
        const status = await getStoreStatus();
        if (cancelled) return;
        const ds = status.datasets?.human_signals_data;

        if (ds && ds.state === 'ready' && ds.rows > 0) {
          console.log(
            `[HumanSignalsDataInitializer] DuckDB has ${ds.rows} rows in human_signals_data`
          );
          setSyncStatus(ds);
        } else if (
          (ds?.state === 'syncing' || ds?.state === 'not_synced') &&
          ++pollCount < MAX_STORE_STATUS_POLLS
        ) {
          timeoutId = setTimeout(poll, 5000);
          if (!duckdbChecked) setDuckdbChecked(true);
          return;
        }
      } catch {
        // Store not available — fallback
      }
      if (!cancelled) setDuckdbChecked(true);
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      !duckdbChecked ||
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
  }, [duckdbChecked, config, configLoading, configError, cases.length, autoImport, isImporting]);

  return <>{children}</>;
}
