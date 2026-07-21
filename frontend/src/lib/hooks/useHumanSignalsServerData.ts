'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { getAllHumanSignalsCases } from '@/lib/api';
import { SYNC_RETRY_CONFIG } from '@/lib/hooks/sync-retry';
import { useHumanSignalsStore, type HumanSignalsDataFormat } from '@/stores/human-signals-store';

import type { SignalsCaseRecord } from '@/types';

/**
 * Server-mode loader for human signals cases.
 *
 * When the DuckDB store owns the dataset (`datasetReady`), the cases table is
 * built server-side but never lands in the Zustand store — the legacy
 * client-side auto-import only fires when the store is DISABLED (CSV-only
 * deployments). This hook closes that gap: once the dataset is ready and the
 * store has no cases, it pages through `/api/human-signals/cases` and pushes
 * the merged result through the same `setData` path the upload/import flows
 * use. Mirrors the monitoring server load in `useProductionOverview`.
 *
 * Paging (not one large page_size shot) keeps each response bounded — case
 * rows can be wide, and a single full-table response can exceed a host's
 * response-size limit, which silently drops the page to its empty import-only
 * state.
 */
export function useHumanSignalsServerData(): { isLoading: boolean } {
  const setData = useHumanSignalsStore((s) => s.setData);
  const datasetReady = useHumanSignalsStore((s) => s.datasetReady);
  const hasData = useHumanSignalsStore((s) => s.cases.length > 0);

  const query = useQuery({
    queryKey: ['human-signals-cases'],
    queryFn: () => getAllHumanSignalsCases(),
    enabled: datasetReady && !hasData,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...SYNC_RETRY_CONFIG,
  });

  useEffect(() => {
    if (!query.data) return;
    setData(
      query.data.data as SignalsCaseRecord[],
      query.data.format as HumanSignalsDataFormat,
      query.data.columns,
      query.data.metric_schema ?? null,
      query.data.display_config ?? null,
      'database_store'
    );
  }, [query.data, setData]);

  return { isLoading: query.isLoading };
}
