import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type {
  DatasetMetadata,
  DatasetSyncStatus,
  SignalsCaseRecord,
  SignalsDisplayConfig,
  SignalsMetricSchema,
} from '@/types';

// Data format for human signals
export type HumanSignalsDataFormat = 'hitl_feedback' | null;

// Time range presets
export type HumanSignalsTimeRangePreset = '7d' | '30d' | '90d' | '6m' | '1y' | 'custom';

export interface HumanSignalsTimeRange {
  preset: HumanSignalsTimeRangePreset;
  startDate: string;
  endDate: string;
}

function getDateRangeFromPreset(preset: HumanSignalsTimeRangePreset): {
  startDate: string;
  endDate: string;
} {
  const endDate = new Date();
  const startDate = new Date();

  switch (preset) {
    case '7d':
      startDate.setDate(endDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(endDate.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(endDate.getDate() - 90);
      break;
    case '6m':
      startDate.setMonth(endDate.getMonth() - 6);
      break;
    case '1y':
      startDate.setFullYear(endDate.getFullYear() - 1);
      break;
    case 'custom':
      startDate.setDate(endDate.getDate() - 30);
      break;
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
}

const defaultTimeRange: HumanSignalsTimeRange = {
  preset: '30d',
  ...getDateRangeFromPreset('30d'),
};

interface HumanSignalsState {
  // Data
  format: HumanSignalsDataFormat;
  columns: string[];
  fileName: string | null;
  uploadedAt: string | null;
  rowCount: number;
  error: string | null;
  isLoading: boolean;

  // Case data
  cases: SignalsCaseRecord[];

  // Schema & display config
  metricSchema: SignalsMetricSchema | null;
  displayConfig: SignalsDisplayConfig | null;

  // Source filters (monitoring-style)
  selectedSourceName: string;
  selectedSourceComponent: string;
  selectedEnvironment: string;
  availableSourceNames: string[];
  availableSourceComponents: string[];
  availableEnvironments: string[];

  // DuckDB store status
  syncStatus: DatasetSyncStatus | null;
  metadata: DatasetMetadata | null;
  datasetReady: boolean;

  // Dynamic metric filters: keyed by "{metric}__{signal}"
  metricFilters: Record<string, string[]>;

  // Time range
  timeRange: HumanSignalsTimeRange;

  // KPI selection (click-to-expand trend)
  selectedSignalKpi: string | null;

  // Table UI
  selectedCaseId: string | null;
  caseDetailModalOpen: boolean;
  currentPage: number;
  pageSize: number;
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc' | null;
  visibleColumns: string[] | null; // null = use defaults from displayConfig

  // Actions
  setData: (
    cases: SignalsCaseRecord[],
    format: HumanSignalsDataFormat,
    columns: string[],
    metricSchema: SignalsMetricSchema | null,
    displayConfig: SignalsDisplayConfig | null,
    fileName?: string
  ) => void;
  clearData: () => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setSelectedSourceName: (name: string) => void;
  setSelectedSourceComponent: (component: string) => void;
  setSelectedEnvironment: (env: string) => void;
  setMetricFilter: (key: string, values: string[]) => void;
  clearFilters: () => void;
  setTimeRange: (timeRange: HumanSignalsTimeRange) => void;
  setTimeRangePreset: (preset: HumanSignalsTimeRangePreset) => void;
  selectSignalKpi: (key: string) => void;
  openCaseDetail: (caseId: string) => void;
  closeCaseDetail: () => void;
  setSort: (column: string | null, direction: 'asc' | 'desc' | null) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setVisibleColumns: (columns: string[]) => void;
  toggleColumn: (columnKey: string) => void;

  // DuckDB store actions
  setSyncStatus: (status: DatasetSyncStatus | null) => void;
  setMetadata: (metadata: DatasetMetadata | null) => void;
  setDatasetReady: (ready: boolean) => void;
}

export const useHumanSignalsStore = create<HumanSignalsState>()(
  persist(
    (set) => ({
      format: null,
      columns: [],
      fileName: null,
      uploadedAt: null,
      rowCount: 0,
      error: null,
      isLoading: false,

      cases: [],
      metricSchema: null,
      displayConfig: null,

      syncStatus: null,
      metadata: null,
      datasetReady: false,

      selectedSourceName: '',
      selectedSourceComponent: '',
      selectedEnvironment: '',
      availableSourceNames: [],
      availableSourceComponents: [],
      availableEnvironments: [],

      metricFilters: {},

      timeRange: defaultTimeRange,

      selectedSignalKpi: null,

      selectedCaseId: null,
      caseDetailModalOpen: false,
      currentPage: 1,
      pageSize: 10,
      sortColumn: null,
      sortDirection: null,
      visibleColumns: null,

      setData: (cases, format, columns, metricSchema, displayConfig, fileName) => {
        const extractUnique = (key: string): string[] => {
          const values = new Set(
            cases
              .map((d) => d[key])
              .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
          );
          return Array.from(values).sort();
        };

        const sourceNames = extractUnique('source_name');
        const sourceComponents = extractUnique('source_component');
        const environments = extractUnique('environment');

        // Calculate time range from data
        const timestamps = cases
          .map((d) => d.Timestamp)
          .filter((t): t is string => Boolean(t))
          .map((t) => new Date(t).getTime())
          .filter((t) => !isNaN(t));

        let timeRange: HumanSignalsTimeRange;
        if (timestamps.length > 0) {
          const minTime = Math.min(...timestamps);
          const maxTime = Math.max(...timestamps);
          const startDate = new Date(minTime - 60 * 60 * 1000);
          const endDate = new Date(maxTime + 60 * 60 * 1000);
          timeRange = {
            preset: 'custom',
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
          };
        } else {
          timeRange = { preset: '30d', ...getDateRangeFromPreset('30d') };
        }

        set({
          cases,
          format,
          columns,
          metricSchema,
          displayConfig,
          rowCount: cases.length,
          fileName: fileName ?? null,
          uploadedAt: new Date().toISOString(),
          error: null,
          availableSourceNames: sourceNames,
          availableSourceComponents: sourceComponents,
          availableEnvironments: environments,
          selectedSourceName: '',
          selectedSourceComponent: '',
          selectedEnvironment: '',
          metricFilters: {},
          timeRange,
        });
      },

      clearData: () =>
        set({
          cases: [],
          format: null,
          columns: [],
          metricSchema: null,
          displayConfig: null,
          rowCount: 0,
          fileName: null,
          uploadedAt: null,
          error: null,
          availableSourceNames: [],
          availableSourceComponents: [],
          availableEnvironments: [],
          selectedSourceName: '',
          selectedSourceComponent: '',
          selectedEnvironment: '',
          metricFilters: {},
        }),

      setError: (error) => set({ error, isLoading: false }),
      setLoading: (loading) => set({ isLoading: loading }),

      setSelectedSourceName: (name) => set({ selectedSourceName: name, currentPage: 1 }),
      setSelectedSourceComponent: (component) =>
        set({ selectedSourceComponent: component, currentPage: 1 }),
      setSelectedEnvironment: (env) => set({ selectedEnvironment: env, currentPage: 1 }),

      setMetricFilter: (key, values) =>
        set((state) => ({
          metricFilters: { ...state.metricFilters, [key]: values },
          currentPage: 1,
        })),

      clearFilters: () =>
        set({
          selectedSourceName: '',
          selectedSourceComponent: '',
          selectedEnvironment: '',
          metricFilters: {},
          currentPage: 1,
        }),

      setTimeRange: (timeRange) => set({ timeRange, currentPage: 1 }),
      setTimeRangePreset: (preset) =>
        set({
          timeRange: { preset, ...getDateRangeFromPreset(preset) },
          currentPage: 1,
        }),

      selectSignalKpi: (key) =>
        set((state) => ({
          selectedSignalKpi: state.selectedSignalKpi === key ? null : key,
        })),

      openCaseDetail: (caseId) => set({ selectedCaseId: caseId, caseDetailModalOpen: true }),
      closeCaseDetail: () => set({ selectedCaseId: null, caseDetailModalOpen: false }),

      setSort: (column, direction) => set({ sortColumn: column, sortDirection: direction }),
      setPage: (page) => set({ currentPage: page }),
      setPageSize: (size) => set({ pageSize: size, currentPage: 1 }),
      setVisibleColumns: (columns) => set({ visibleColumns: columns }),
      toggleColumn: (columnKey) =>
        set((state) => {
          const current = state.visibleColumns || [];
          const next = current.includes(columnKey)
            ? current.filter((k) => k !== columnKey)
            : [...current, columnKey];
          return { visibleColumns: next };
        }),

      // DuckDB store actions
      setSyncStatus: (status) =>
        set({
          syncStatus: status,
          datasetReady: status?.state === 'ready',
        }),

      setMetadata: (metadata) => set({ metadata }),

      setDatasetReady: (ready) => set({ datasetReady: ready }),
    }),
    {
      name: 'axis-human-signals-store',
      partialize: (state) => ({
        format: state.format,
        columns: state.columns,
        rowCount: state.rowCount,
        fileName: state.fileName,
        uploadedAt: state.uploadedAt,
        // Note: available* filter lists are NOT persisted — derived from loaded data.
        selectedSourceName: state.selectedSourceName,
        selectedSourceComponent: state.selectedSourceComponent,
        selectedEnvironment: state.selectedEnvironment,
        timeRange: state.timeRange,
        pageSize: state.pageSize,
        sortColumn: state.sortColumn,
        sortDirection: state.sortDirection,
        visibleColumns: state.visibleColumns,
      }),
    }
  )
);
