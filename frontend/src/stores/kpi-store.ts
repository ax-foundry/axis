'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { formatLocalDate } from '@/lib/utils';

import type { KpiCompositionChartConfig } from '@/types';

function getKpiDateRange(preset: string): { start: string | null; end: string | null } {
  if (preset === 'all') return { start: null, end: null };
  const end = new Date();
  const start = new Date();
  const days: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
  if (days[preset]) start.setDate(start.getDate() - days[preset]);
  return { start: formatLocalDate(start), end: formatLocalDate(end) };
}

interface KpiStoreState {
  /** Whether kpi_data is synced and available in DuckDB */
  datasetReady: boolean;
  /** The kpi_name whose trend chart is currently expanded (null = none) */
  selectedKpi: string | null;
  /** Available source names from KPI data */
  availableSourceNames: string[];
  /** Currently selected segment filter (empty string = all) */
  selectedSegment: string;
  /** Available segments from KPI data */
  availableSegments: string[];
  /** Config-defined KPI ordering: { _default: [...], source_name: [...] } */
  kpiOrder: Record<string, string[]>;
  /** Composition chart configs from YAML */
  compositionCharts: KpiCompositionChartConfig[];
  /** Whether the backend has sankey_charts configured */
  hasSankeyCharts: boolean;
  /** KPI names hidden from card grid (still used by composition/sankey charts) */
  cardHiddenKpiNames: Set<string>;

  /** Time range preset: 'all' | '7d' | '30d' | '90d' | 'custom' */
  kpiTimePreset: string;
  /** YYYY-MM-DD or null (= no filter) */
  kpiTimeStart: string | null;
  /** YYYY-MM-DD or null (= no filter) */
  kpiTimeEnd: string | null;

  // Actions
  setDatasetReady: (ready: boolean) => void;
  selectKpi: (kpiName: string) => void;
  clearSelectedKpi: () => void;
  setAvailableSourceNames: (names: string[]) => void;
  setSelectedSegment: (segment: string) => void;
  setAvailableSegments: (segments: string[]) => void;
  setKpiOrder: (order: Record<string, string[]>) => void;
  setCompositionCharts: (charts: KpiCompositionChartConfig[]) => void;
  setHasSankeyCharts: (has: boolean) => void;
  setCardHiddenKpiNames: (names: string[]) => void;
  setKpiTimePreset: (preset: string) => void;
  setKpiTimeRange: (start: string, end: string) => void;
}

export const useKpiStore = create<KpiStoreState>()(
  persist(
    (set) => ({
      datasetReady: false,
      selectedKpi: null,
      availableSourceNames: [],
      selectedSegment: '',
      availableSegments: [],
      kpiOrder: {},
      compositionCharts: [],
      hasSankeyCharts: false,
      cardHiddenKpiNames: new Set<string>(),
      kpiTimePreset: 'all',
      kpiTimeStart: null,
      kpiTimeEnd: null,

      setDatasetReady: (ready) => set({ datasetReady: ready }),

      selectKpi: (kpiName) =>
        set((state) => ({
          selectedKpi: state.selectedKpi === kpiName ? null : kpiName,
        })),

      clearSelectedKpi: () => set({ selectedKpi: null }),

      setAvailableSourceNames: (names) => set({ availableSourceNames: names }),

      setSelectedSegment: (segment) => set({ selectedSegment: segment }),

      setAvailableSegments: (segments) => set({ availableSegments: segments }),

      setKpiOrder: (order) => set({ kpiOrder: order }),

      setCompositionCharts: (charts) => set({ compositionCharts: charts }),

      setHasSankeyCharts: (has) => set({ hasSankeyCharts: has }),

      setCardHiddenKpiNames: (names) => set({ cardHiddenKpiNames: new Set(names) }),

      setKpiTimePreset: (preset) => {
        const { start, end } = getKpiDateRange(preset);
        set({ kpiTimePreset: preset, kpiTimeStart: start, kpiTimeEnd: end });
      },

      setKpiTimeRange: (start, end) =>
        set({ kpiTimePreset: 'custom', kpiTimeStart: start, kpiTimeEnd: end }),
    }),
    {
      name: 'axis-kpi-store',
      partialize: (state) => ({
        selectedKpi: state.selectedKpi,
        selectedSegment: state.selectedSegment,
        kpiTimePreset: state.kpiTimePreset,
        kpiTimeStart: state.kpiTimeStart,
        kpiTimeEnd: state.kpiTimeEnd,
      }),
    }
  )
);
