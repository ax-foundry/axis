'use client';

import { type ReactNode, useEffect } from 'react';

import { getStoreStatus } from '@/lib/api';
import { MAX_STORE_STATUS_POLLS } from '@/lib/hooks/sync-retry';
import { useKpiStore } from '@/stores';

interface KpiDataInitializerProps {
  children: ReactNode;
}

/**
 * KpiDataInitializer polls DuckDB store status for kpi_data on mount
 * and writes sync state into the kpi-store.
 *
 * Behavior:
 * - Polls /api/store/status for kpi_data every 5s while syncing
 * - When ready with rows > 0: sets datasetReady(true) + syncStatus
 * - On non-ready outcomes: explicitly sets datasetReady(false)
 * - Always sets storeStatusChecked(true) when polling terminates
 * - Always renders children (non-blocking)
 */
export function KpiDataInitializer({ children }: KpiDataInitializerProps) {
  const setDatasetReady = useKpiStore((s) => s.setDatasetReady);
  const setSyncStatus = useKpiStore((s) => s.setSyncStatus);
  const setStoreStatusChecked = useKpiStore((s) => s.setStoreStatusChecked);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    let pollCount = 0;

    const poll = async () => {
      try {
        const status = await getStoreStatus();
        if (cancelled) return;
        const kpiStatus = status.datasets?.kpi_data;

        if (kpiStatus) {
          setSyncStatus(kpiStatus);
        }

        if (kpiStatus?.state === 'ready' && kpiStatus.rows > 0) {
          setDatasetReady(true);
          setStoreStatusChecked(true);
          return;
        }

        if (
          (kpiStatus?.state === 'syncing' || kpiStatus?.state === 'not_synced') &&
          ++pollCount < MAX_STORE_STATUS_POLLS
        ) {
          timeoutId = setTimeout(poll, 5000);
          return;
        }

        // Poll exhausted, rows === 0, error, or no kpi_data entry
        setDatasetReady(false);
      } catch {
        // Store not available — mark as checked so page can show empty state
        setDatasetReady(false);
      }
      if (!cancelled) setStoreStatusChecked(true);
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [setDatasetReady, setSyncStatus, setStoreStatusChecked]);

  return <>{children}</>;
}
