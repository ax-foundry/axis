'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { getStoreData } from '@/lib/api';
import { computeKPIs } from '@/lib/human-signals-utils';
import { useHumanSignalsStore, useMonitoringStore } from '@/stores';

import type { MonitoringRecord, MonitoringSummaryMetrics, SignalsKPIResult } from '@/types';

export interface ProductionOverviewData {
  technicalMetrics: MonitoringSummaryMetrics | null;
  signalsKPIs: SignalsKPIResult[];
  signalsCaseCount: number;
  alertCount: number;
  hasMonitoringData: boolean;
  hasSignalsData: boolean;
  isLoading: boolean;
  monitoringData: MonitoringRecord[];
}

/** Columns the executive summary actually needs (keeps payload small). */
const SUMMARY_COLUMNS =
  'source_name,source_component,metric_name,metric_score,metric_category,timestamp';

export function useProductionOverview(): ProductionOverviewData {
  const monitoringStore = useMonitoringStore();
  const humanSignalsStore = useHumanSignalsStore();
  const selectedSourceName = useMonitoringStore((s) => s.selectedSourceName);
  const datasetReady = monitoringStore.datasetReady;

  // ── Fetch monitoring data from DuckDB when ready ─────────────────
  const duckdbQuery = useQuery({
    queryKey: ['production-monitoring-summary', selectedSourceName],
    queryFn: () =>
      getStoreData('monitoring', {
        page_size: 10000,
        source_name: selectedSourceName || undefined,
        columns: SUMMARY_COLUMNS,
      }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: datasetReady,
  });

  const duckdbData = useMemo(
    () => (duckdbQuery.data?.data ?? []) as unknown as MonitoringRecord[],
    [duckdbQuery.data]
  );

  // ── Resolve monitoring data: DuckDB first, fallback to in-memory ──
  const monitoringData = useMemo(() => {
    // DuckDB mode: use server-fetched data
    if (datasetReady) return duckdbData;
    // CSV mode: filter in-memory store
    if (!selectedSourceName) return monitoringStore.data;
    return monitoringStore.data.filter((r) => r.source_name === selectedSourceName);
  }, [datasetReady, duckdbData, monitoringStore.data, selectedSourceName]);

  // ── Filter signals cases by selected source ──────────────────────
  const filteredSignalsCases = useMemo(() => {
    if (!selectedSourceName) return humanSignalsStore.cases;
    return humanSignalsStore.cases.filter((r) => r.source_name === selectedSourceName);
  }, [humanSignalsStore.cases, selectedSourceName]);

  const signalsKPIs = useMemo(() => {
    if (filteredSignalsCases.length === 0 || !humanSignalsStore.displayConfig) return [];
    return computeKPIs(filteredSignalsCases, humanSignalsStore.displayConfig.kpi_strip);
  }, [filteredSignalsCases, humanSignalsStore.displayConfig]);

  return useMemo(
    () => ({
      technicalMetrics: monitoringStore.summaryMetrics,
      signalsKPIs,
      signalsCaseCount: filteredSignalsCases.length,
      alertCount: selectedSourceName
        ? (monitoringStore.alerts?.filter((a) => a.source_name === selectedSourceName).length ?? 0)
        : (monitoringStore.alerts?.length ?? 0),
      hasMonitoringData: monitoringStore.data.length > 0 || datasetReady,
      hasSignalsData: filteredSignalsCases.length > 0,
      isLoading:
        monitoringStore.isLoading || humanSignalsStore.isLoading || duckdbQuery.isLoading,
      monitoringData,
    }),
    [
      monitoringStore.summaryMetrics,
      monitoringStore.alerts,
      monitoringStore.data,
      datasetReady,
      monitoringStore.isLoading,
      selectedSourceName,
      filteredSignalsCases.length,
      humanSignalsStore.isLoading,
      signalsKPIs,
      monitoringData,
      duckdbQuery.isLoading,
    ]
  );
}
