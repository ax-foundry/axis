'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
  getMonitoringLatencyDist,
  getMonitoringMetricBreakdown,
  getMonitoringTrends,
  getStoreData,
} from '@/lib/api';

import type {
  MonitoringLatencyDistResponse,
  MonitoringSummaryResponse,
  StoreDataResponse,
} from '@/lib/api';
import type {
  MonitoringChartGranularity,
  MonitoringFilters,
  MonitoringGroupBy,
  MonitoringTrendData,
} from '@/types';

// Shared stale time for monitoring queries (30 seconds)
const MONITORING_STALE_TIME = 30_000;

// --------------------------------------------------------------------------
// Helper: build a stable query key from filter primitives
// --------------------------------------------------------------------------
function filterKey(filters: MonitoringFilters): string[] {
  return [
    filters.environment ?? '',
    filters.source_name ?? '',
    filters.source_component ?? '',
    filters.source_type ?? '',
    filters.metric_category ?? '',
    filters.metric_name ?? '',
    filters.time_start ?? '',
    filters.time_end ?? '',
  ];
}

// --------------------------------------------------------------------------
// Score Trend Data
// --------------------------------------------------------------------------
export function useMonitoringTrends(
  filters: MonitoringFilters,
  metricColumns: string[],
  granularity: MonitoringChartGranularity,
  enabled: boolean
) {
  return useQuery<MonitoringTrendData[]>({
    queryKey: ['monitoring-trends', ...filterKey(filters), granularity, metricColumns.join(',')],
    queryFn: async () => {
      const scoreFilters: MonitoringFilters = { ...filters, metric_category: 'SCORE' };
      const res = await getMonitoringTrends(scoreFilters, metricColumns, granularity);
      return res.success ? res.data : [];
    },
    staleTime: MONITORING_STALE_TIME,
    enabled,
  });
}

// --------------------------------------------------------------------------
// Latency Distribution
// --------------------------------------------------------------------------
export function useMonitoringLatencyDist(
  filters: MonitoringFilters,
  bins: number,
  groupBy: MonitoringGroupBy,
  enabled: boolean
) {
  return useQuery<MonitoringLatencyDistResponse>({
    queryKey: ['monitoring-latency', ...filterKey(filters), bins, groupBy ?? ''],
    queryFn: async () => {
      const scoreFilters: MonitoringFilters = { ...filters, metric_category: 'SCORE' };
      return getMonitoringLatencyDist(scoreFilters, bins, groupBy ?? undefined);
    },
    staleTime: MONITORING_STALE_TIME,
    enabled,
  });
}

// --------------------------------------------------------------------------
// Metric Breakdown (pass rates)
// --------------------------------------------------------------------------
export interface MappedBreakdown {
  name: string;
  passRate: number;
  avg: number;
  count: number;
  byGroup?: Record<string, { passRate: number; avg: number; count: number }>;
}

export function useMonitoringMetricBreakdown(
  filters: MonitoringFilters,
  metricColumns: string[],
  groupBy: MonitoringGroupBy,
  enabled: boolean
) {
  return useQuery<MappedBreakdown[]>({
    queryKey: [
      'monitoring-breakdown',
      ...filterKey(filters),
      metricColumns.join(','),
      groupBy ?? '',
    ],
    queryFn: async () => {
      const scoreFilters: MonitoringFilters = { ...filters, metric_category: 'SCORE' };
      const res = await getMonitoringMetricBreakdown(
        scoreFilters,
        metricColumns,
        groupBy ?? undefined
      );
      if (!res.success) return [];
      return res.metrics.map((m) => ({
        name: m.name,
        passRate: m.pass_rate,
        avg: m.avg,
        count: m.count,
        byGroup: m.by_group
          ? Object.fromEntries(
              Object.entries(m.by_group).map(([k, v]) => [
                k,
                { passRate: v.pass_rate, avg: v.avg, count: v.count },
              ])
            )
          : undefined,
      }));
    },
    staleTime: MONITORING_STALE_TIME,
    enabled,
  });
}

// --------------------------------------------------------------------------
// Server-side Traces (paginated)
// --------------------------------------------------------------------------
export function useMonitoringTraces(
  filters: MonitoringFilters,
  page: number,
  pageSize: number,
  sortBy: string,
  sortDir: 'asc' | 'desc',
  search: string,
  metricFilter: string,
  enabled: boolean
) {
  return useQuery<StoreDataResponse>({
    queryKey: [
      'monitoring-traces',
      ...filterKey(filters),
      page,
      pageSize,
      sortBy,
      sortDir,
      search,
      metricFilter,
    ],
    queryFn: () =>
      getStoreData('monitoring', {
        page,
        page_size: pageSize,
        sort_by: sortBy === 'score' ? 'metric_score' : 'timestamp',
        sort_dir: sortDir,
        metric_category: 'SCORE',
        metric_name: metricFilter || undefined,
        search: search || undefined,
        ...filters,
      }),
    staleTime: MONITORING_STALE_TIME,
    placeholderData: keepPreviousData,
    enabled,
  });
}

// --------------------------------------------------------------------------
// Server-side Failing Outputs
// --------------------------------------------------------------------------
export function useMonitoringFailingOutputs(filters: MonitoringFilters, enabled: boolean) {
  return useQuery<StoreDataResponse>({
    queryKey: ['monitoring-failing', ...filterKey(filters)],
    queryFn: () =>
      getStoreData('monitoring', {
        sort_by: 'metric_score',
        sort_dir: 'asc',
        page_size: 50,
        metric_category: 'SCORE',
        ...filters,
      }),
    staleTime: MONITORING_STALE_TIME,
    enabled,
  });
}

// --------------------------------------------------------------------------
// Lightweight Summary KPIs
// --------------------------------------------------------------------------
export function useMonitoringSummary(filters: MonitoringFilters, enabled: boolean) {
  return useQuery<MonitoringSummaryResponse>({
    queryKey: ['monitoring-summary', ...filterKey(filters)],
    queryFn: async () => {
      const { getMonitoringSummary } = await import('@/lib/api');
      return getMonitoringSummary(filters);
    },
    staleTime: MONITORING_STALE_TIME,
    enabled,
  });
}
