'use client';

import { useMemo } from 'react';

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

export function useProductionOverview(): ProductionOverviewData {
  const monitoringStore = useMonitoringStore();
  const humanSignalsStore = useHumanSignalsStore();
  const selectedSourceName = useMonitoringStore((s) => s.selectedSourceName);

  // ── Filter monitoring data by selected source ────────────────────
  const filteredMonitoringData = useMemo(() => {
    if (!selectedSourceName) return monitoringStore.data;
    return monitoringStore.data.filter((r) => r.source_name === selectedSourceName);
  }, [monitoringStore.data, selectedSourceName]);

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
      hasMonitoringData: monitoringStore.data.length > 0 || monitoringStore.datasetReady,
      hasSignalsData: filteredSignalsCases.length > 0,
      isLoading: monitoringStore.isLoading || humanSignalsStore.isLoading,
      monitoringData: filteredMonitoringData,
    }),
    [
      monitoringStore.summaryMetrics,
      monitoringStore.alerts,
      monitoringStore.data,
      monitoringStore.datasetReady,
      monitoringStore.isLoading,
      selectedSourceName,
      filteredSignalsCases.length,
      humanSignalsStore.isLoading,
      signalsKPIs,
      filteredMonitoringData,
    ]
  );
}
