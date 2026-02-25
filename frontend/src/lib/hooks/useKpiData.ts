'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import * as api from '@/lib/api';
import { useKpiStore, useMonitoringStore } from '@/stores';

import type { KpiFilters } from '@/types';

/**
 * Build filter params from the shared source selector and segment.
 */
function useKpiFilters(): KpiFilters {
  const selectedSourceName = useMonitoringStore((s) => s.selectedSourceName);
  const selectedSegment = useKpiStore((s) => s.selectedSegment);
  return {
    source_name: selectedSourceName || undefined,
    segment: selectedSegment || undefined,
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
  const setKpiOrder = useKpiStore((s) => s.setKpiOrder);
  const setCompositionCharts = useKpiStore((s) => s.setCompositionCharts);

  const { data, isLoading, error } = useQuery({
    queryKey: ['kpi-categories', filters],
    queryFn: () => api.getKpiCategories(filters),
    staleTime: 60_000,
  });

  // Fetch filter options (source names, segments, etc.) and populate the KPI store
  const { data: filtersData } = useQuery({
    queryKey: ['kpi-filters'],
    queryFn: () => api.getKpiFilters(),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (filtersData?.source_names) {
      setAvailableSourceNames(filtersData.source_names);
    }
    if (filtersData?.segments) {
      setAvailableSegments(filtersData.segments);
    }
    if (filtersData?.kpi_order) {
      setKpiOrder(filtersData.kpi_order);
    }
    if (filtersData?.composition_charts) {
      setCompositionCharts(filtersData.composition_charts);
    }
  }, [
    filtersData,
    setAvailableSourceNames,
    setAvailableSegments,
    setKpiOrder,
    setCompositionCharts,
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
  });
}
