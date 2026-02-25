'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { KpiCompositionChartConfig } from '@/types';

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

  // Actions
  setDatasetReady: (ready: boolean) => void;
  selectKpi: (kpiName: string) => void;
  clearSelectedKpi: () => void;
  setAvailableSourceNames: (names: string[]) => void;
  setSelectedSegment: (segment: string) => void;
  setAvailableSegments: (segments: string[]) => void;
  setKpiOrder: (order: Record<string, string[]>) => void;
  setCompositionCharts: (charts: KpiCompositionChartConfig[]) => void;
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
    }),
    {
      name: 'axis-kpi-store',
      partialize: (state) => ({
        selectedKpi: state.selectedKpi,
        selectedSegment: state.selectedSegment,
      }),
    }
  )
);
