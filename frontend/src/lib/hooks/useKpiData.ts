'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import * as api from '@/lib/api';
import { SYNC_RETRY_CONFIG } from '@/lib/hooks/sync-retry';
import { useKpiStore } from '@/stores';

import type { KpiFilters } from '@/types';

/**
 * Build filter params from the kpi store source selector and segment.
 */
function useKpiFilters(): KpiFilters {
  const selectedSourceName = useKpiStore((s) => s.selectedSourceName);
  const selectedSegment = useKpiStore((s) => s.selectedSegment);
  const selectedSourceComponent = useKpiStore((s) => s.selectedSourceComponent);
  const kpiTimeStart = useKpiStore((s) => s.kpiTimeStart);
  const kpiTimeEnd = useKpiStore((s) => s.kpiTimeEnd);
  return {
    source_name: selectedSourceName || undefined,
    segment: selectedSegment || undefined,
    source_component: selectedSourceComponent || undefined,
    time_start: kpiTimeStart || undefined,
    time_end: kpiTimeEnd || undefined,
  };
}

/**
 * Primary hook: fetches /categories on page load.
 * Derives all data needed for the KPI strip and panels.
 * Also fetches /filters to populate kpiStore.availableSourceNames and availableSegments.
 */
export function useKpiData() {
  const filters = useKpiFilters();
  const setAvailableSourceNames = useKpiStore((s) => s.setAvailableSourceNames);
  const setAvailableSegments = useKpiStore((s) => s.setAvailableSegments);
  const setAvailableSourceComponents = useKpiStore((s) => s.setAvailableSourceComponents);
  const setKpiOrder = useKpiStore((s) => s.setKpiOrder);
  const setCompositionCharts = useKpiStore((s) => s.setCompositionCharts);
  const setHasSankeyCharts = useKpiStore((s) => s.setHasSankeyCharts);
  const setCardHiddenKpiNames = useKpiStore((s) => s.setCardHiddenKpiNames);
  const setProductionKpiNames = useKpiStore((s) => s.setProductionKpiNames);

  const { data, isLoading, error } = useQuery({
    queryKey: ['kpi-categories', filters],
    queryFn: () => api.getKpiCategories(filters),
    staleTime: 60_000,
    ...SYNC_RETRY_CONFIG,
  });

  // Fetch filter options (source names, segments, etc.) and populate the KPI store.
  // Pass source_name and source_component to scope results to the active agent.
  const selectedSourceComponent = useKpiStore((s) => s.selectedSourceComponent);
  const selectedSourceName = useKpiStore((s) => s.selectedSourceName);
  const { data: filtersData } = useQuery({
    queryKey: ['kpi-filters', selectedSourceComponent || '', selectedSourceName || ''],
    queryFn: () =>
      api.getKpiFilters(selectedSourceComponent || undefined, selectedSourceName || undefined),
    staleTime: 60_000,
    ...SYNC_RETRY_CONFIG,
  });

  useEffect(() => {
    if (filtersData?.source_names) {
      setAvailableSourceNames(filtersData.source_names);
    }
    if (filtersData?.segments) {
      setAvailableSegments(filtersData.segments);
    }
    if (filtersData?.source_components) {
      setAvailableSourceComponents(filtersData.source_components);
    }
    if (filtersData?.kpi_order) {
      setKpiOrder(filtersData.kpi_order);
    }
    if (filtersData?.composition_charts) {
      setCompositionCharts(filtersData.composition_charts);
    }
    if (filtersData?.has_sankey_charts !== undefined) {
      setHasSankeyCharts(filtersData.has_sankey_charts);
    }
    if (filtersData?.card_hidden_kpi_names) {
      setCardHiddenKpiNames(filtersData.card_hidden_kpi_names);
    }
    if (filtersData?.production_kpi_names) {
      setProductionKpiNames(filtersData.production_kpi_names);
    }
  }, [
    filtersData,
    setAvailableSourceNames,
    setAvailableSegments,
    setAvailableSourceComponents,
    setKpiOrder,
    setCompositionCharts,
    setHasSankeyCharts,
    setCardHiddenKpiNames,
    setProductionKpiNames,
  ]);

  return {
    categories: data?.categories ?? [],
    dateRange: data?.date_range ?? null,
    isLoading,
    error,
  };
}

/**
 * Lazy trend hook: fetches trend data for a single KPI when enabled.
 */
export function useKpiTrends(kpiName: string | null, enabled: boolean) {
  const filters = useKpiFilters();
  const kpiNames = kpiName ? [kpiName] : [];

  return useQuery({
    queryKey: ['kpi-trends', filters, kpiName],
    queryFn: () => api.getKpiTrends(filters, kpiNames),
    enabled: enabled && kpiName !== null,
    staleTime: 60_000,
    ...SYNC_RETRY_CONFIG,
  });
}

/**
 * Sankey chart hook: fetches /sankey when config enables it.
 */
export function useKpiSankey(enabled: boolean) {
  const filters = useKpiFilters();

  return useQuery({
    queryKey: ['kpi-sankey', filters],
    queryFn: () => api.getKpiSankey(filters),
    enabled,
    staleTime: 60_000,
    ...SYNC_RETRY_CONFIG,
  });
}

/**
 * Lazy trend hook for multiple KPIs at once (e.g. composition charts).
 */
export function useKpiTrendsMulti(kpiNames: string[], enabled: boolean) {
  const filters = useKpiFilters();

  return useQuery({
    queryKey: ['kpi-trends-multi', filters, kpiNames],
    queryFn: () => api.getKpiTrends(filters, kpiNames),
    enabled: enabled && kpiNames.length > 0,
    staleTime: 60_000,
    ...SYNC_RETRY_CONFIG,
  });
}

/**
 * Drill-down hook: paginated case-level rows for a single KPI.
 */
export function useKpiDrillDown(
  kpiName: string | null,
  pagination: { page: number; pageSize: number; sortBy: string; sortDir: string },
  dateFilter: string | null,
  valueRange: { min: number; max: number } | null,
  segmentOverride: string | null,
  enabled: boolean
) {
  const filters = useKpiFilters();

  return useQuery({
    queryKey: [
      'kpi-drill-down',
      kpiName,
      filters,
      pagination,
      dateFilter,
      valueRange,
      segmentOverride,
    ],
    queryFn: () =>
      api.getKpiDrillDown({
        kpi_name: kpiName!,
        page: pagination.page,
        page_size: pagination.pageSize,
        sort_by: pagination.sortBy,
        sort_dir: pagination.sortDir,
        date_filter: dateFilter || undefined,
        value_min: valueRange?.min,
        value_max: valueRange?.max,
        segment_override: segmentOverride || undefined,
        filters,
      }),
    enabled: enabled && kpiName !== null,
    staleTime: 30_000,
    ...SYNC_RETRY_CONFIG,
  });
}

/**
 * Case profile hook: all KPI values for a single dataset_id.
 */
export function useKpiCaseProfile(datasetId: string | null, enabled: boolean) {
  const selectedSourceName = useKpiStore((s) => s.selectedSourceName);

  return useQuery({
    queryKey: ['kpi-case-profile', datasetId, selectedSourceName],
    queryFn: () => api.getKpiCaseProfile(datasetId!, selectedSourceName || undefined),
    enabled: enabled && datasetId !== null,
    staleTime: 60_000,
    ...SYNC_RETRY_CONFIG,
  });
}

/**
 * Distribution hook: histogram + percentiles for a single KPI.
 */
export function useKpiDistribution(kpiName: string | null, enabled: boolean) {
  const filters = useKpiFilters();

  return useQuery({
    queryKey: ['kpi-distribution', kpiName, filters],
    queryFn: () => api.getKpiDistribution(kpiName!, filters),
    enabled: enabled && kpiName !== null,
    staleTime: 60_000,
    ...SYNC_RETRY_CONFIG,
  });
}

/**
 * Segment comparison hook: per-segment aggregated values.
 * Query key excludes segment to avoid cache fragmentation.
 */
export function useKpiSegmentComparison(kpiName: string | null, enabled: boolean) {
  const filters = useKpiFilters();
  // Exclude segment from query key — endpoint always compares all segments
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { segment: _, ...filtersWithoutSegment } = filters;

  return useQuery({
    queryKey: ['kpi-segment-comparison', kpiName, filtersWithoutSegment],
    queryFn: () => api.getKpiSegmentComparison(kpiName!, filters),
    enabled: enabled && kpiName !== null,
    staleTime: 60_000,
    ...SYNC_RETRY_CONFIG,
  });
}
