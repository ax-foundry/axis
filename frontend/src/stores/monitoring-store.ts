import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type {
  DatasetMetadata,
  DatasetSyncStatus,
  MetricCategoryTab,
  MonitoringRecord,
  MonitoringSummaryMetrics,
  MonitoringTrendPoint,
  MonitoringAlert,
  MonitoringChartGranularity,
  MonitoringGroupBy,
} from '@/types';

// Data format for monitoring (matches backend)
export type MonitoringDataFormat = 'monitoring' | null;

// Time range presets
export type MonitoringTimeRangePreset = '1h' | '6h' | '24h' | '7d' | '30d' | 'custom';

export interface MonitoringTimeRange {
  preset: MonitoringTimeRangePreset;
  startDate: string; // ISO date string
  endDate: string; // ISO date string
}

// Helper to calculate date range from preset
function getDateRangeFromPreset(preset: MonitoringTimeRangePreset): {
  startDate: string;
  endDate: string;
} {
  const endDate = new Date();
  const startDate = new Date();

  switch (preset) {
    case '1h':
      startDate.setHours(endDate.getHours() - 1);
      break;
    case '6h':
      startDate.setHours(endDate.getHours() - 6);
      break;
    case '24h':
      startDate.setDate(endDate.getDate() - 1);
      break;
    case '7d':
      startDate.setDate(endDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(endDate.getDate() - 30);
      break;
    case 'custom':
      // For custom, default to last 7 days
      startDate.setDate(endDate.getDate() - 7);
      break;
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

// Default time range (last 24 hours)
const defaultTimeRange: MonitoringTimeRange = {
  preset: '24h',
  ...getDateRangeFromPreset('24h'),
};

interface MonitoringState {
  // Data Management
  format: MonitoringDataFormat;
  columns: string[];
  metricColumns: string[];
  fileName: string | null;
  uploadedAt: string | null;
  rowCount: number;
  error: string | null;

  // DuckDB store status
  syncStatus: DatasetSyncStatus | null;
  metadata: DatasetMetadata | null;
  datasetReady: boolean;

  // Data (kept for CSV upload / legacy fallback)
  data: MonitoringRecord[];
  summaryMetrics: MonitoringSummaryMetrics | null;
  trendData: MonitoringTrendPoint[];
  alerts: MonitoringAlert[];
  isLoading: boolean;

  // Filters
  selectedEnvironment: string;
  selectedSourceName: string;
  selectedSourceComponent: string;
  selectedSourceType: string;
  availableEnvironments: string[];
  availableSourceNames: string[];
  availableSourceComponents: string[];
  availableSourceTypes: string[];
  timeRange: MonitoringTimeRange;

  // Table UI
  currentPage: number;
  pageSize: number;
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc' | null;

  // Chart UI
  chartGranularity: MonitoringChartGranularity;
  selectedChartMetrics: string[];
  distributionGroupBy: MonitoringGroupBy;
  selectedTraceId: string | null;

  // Metric Category Tabs
  activeMetricCategoryTab: MetricCategoryTab;
  selectedClassificationMetric: string | null;
  selectedAnalysisMetric: string | null;
  analysisInsightsPage: number;

  // Executive Summary
  executiveSummaryExpandedNodes: string[];

  // Actions
  setData: (
    data: MonitoringRecord[],
    format: MonitoringDataFormat,
    columns: string[],
    metricColumns: string[],
    fileName?: string
  ) => void;
  clearData: () => void;
  setError: (error: string | null) => void;
  setSummaryMetrics: (metrics: MonitoringSummaryMetrics | null) => void;
  setTrendData: (data: MonitoringTrendPoint[]) => void;
  setAlerts: (alerts: MonitoringAlert[]) => void;
  setLoading: (loading: boolean) => void;
  setSelectedEnvironment: (env: string) => void;
  setSelectedSourceName: (name: string) => void;
  setSelectedSourceComponent: (component: string) => void;
  setSelectedSourceType: (type: string) => void;
  setTimeRange: (timeRange: MonitoringTimeRange) => void;
  setTimeRangePreset: (preset: MonitoringTimeRangePreset) => void;
  setSort: (column: string | null, direction: 'asc' | 'desc' | null) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setChartGranularity: (granularity: MonitoringChartGranularity) => void;
  setSelectedChartMetrics: (metrics: string[]) => void;
  setDistributionGroupBy: (groupBy: MonitoringGroupBy) => void;
  setSelectedTraceId: (traceId: string | null) => void;

  // Metric Category Tab Actions
  setActiveMetricCategoryTab: (tab: MetricCategoryTab) => void;
  setSelectedClassificationMetric: (metric: string | null) => void;
  setSelectedAnalysisMetric: (metric: string | null) => void;
  setAnalysisInsightsPage: (page: number) => void;

  // Executive Summary Actions
  toggleExecutiveSummaryNode: (id: string) => void;
  expandAllExecutiveSummaryNodes: (ids: string[]) => void;
  collapseAllExecutiveSummaryNodes: () => void;

  // DuckDB store actions
  setSyncStatus: (status: DatasetSyncStatus | null) => void;
  setMetadata: (metadata: DatasetMetadata | null) => void;
  setDatasetReady: (ready: boolean) => void;
  populateFiltersFromMetadata: (metadata: DatasetMetadata) => void;
}

export const useMonitoringStore = create<MonitoringState>()(
  persist(
    (set, get) => ({
      // Data Management - Initial state
      format: null,
      columns: [],
      metricColumns: [],
      fileName: null,
      uploadedAt: null,
      rowCount: 0,
      error: null,

      // DuckDB store status
      syncStatus: null,
      metadata: null,
      datasetReady: false,

      // Data - Initial state
      data: [],
      summaryMetrics: null,
      trendData: [],
      alerts: [],
      isLoading: false,

      // Filters
      selectedEnvironment: '',
      selectedSourceName: '',
      selectedSourceComponent: '',
      selectedSourceType: '',
      availableEnvironments: [],
      availableSourceNames: [],
      availableSourceComponents: [],
      availableSourceTypes: [],
      timeRange: defaultTimeRange,

      // Table UI
      currentPage: 1,
      pageSize: 10,
      sortColumn: null,
      sortDirection: null,

      // Chart UI
      chartGranularity: 'daily',
      selectedChartMetrics: [],
      distributionGroupBy: 'environment',
      selectedTraceId: null,

      // Metric Category Tabs
      activeMetricCategoryTab: 'score',
      selectedClassificationMetric: null,
      selectedAnalysisMetric: null,
      analysisInsightsPage: 1,

      // Executive Summary
      executiveSummaryExpandedNodes: [],

      // Actions
      setData: (data, format, columns, metricColumns, fileName) => {
        // Helper to extract unique non-empty string values
        const extractUnique = (key: keyof MonitoringRecord): string[] => {
          const values = new Set(
            data
              .map((d) => d[key])
              .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
          );
          return Array.from(values);
        };

        // Extract unique filter values
        const environments = extractUnique('environment');
        const sourceNames = extractUnique('source_name');
        const sourceComponents = extractUnique('source_component');
        const sourceTypes = extractUnique('source_type');

        // Calculate time range from data to ensure all records are visible
        const timestamps = data
          .map((d) => d.timestamp)
          .filter((t): t is string => Boolean(t))
          .map((t) => new Date(t).getTime())
          .filter((t) => !isNaN(t));

        let timeRange: MonitoringTimeRange;
        if (timestamps.length > 0) {
          const minTime = Math.min(...timestamps);
          const maxTime = Math.max(...timestamps);
          // Add 1 hour buffer on each side
          const startDate = new Date(minTime - 60 * 60 * 1000);
          const endDate = new Date(maxTime + 60 * 60 * 1000);
          timeRange = {
            preset: 'custom',
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          };
        } else {
          // Fallback to default if no valid timestamps
          timeRange = { preset: '24h', ...getDateRangeFromPreset('24h') };
        }

        set({
          data,
          format,
          columns,
          metricColumns,
          rowCount: data.length,
          fileName: fileName ?? null,
          uploadedAt: new Date().toISOString(),
          error: null,
          availableEnvironments: environments,
          availableSourceNames: sourceNames,
          availableSourceComponents: sourceComponents,
          availableSourceTypes: sourceTypes,
          // Auto-select first source; leave other filters open
          selectedEnvironment: '',
          selectedSourceName: sourceNames.length > 0 ? sourceNames[0] : '',
          selectedSourceComponent: '',
          selectedSourceType: '',
          // Set time range to encompass all data
          timeRange,
        });
      },

      clearData: () =>
        set({
          data: [],
          format: null,
          columns: [],
          metricColumns: [],
          rowCount: 0,
          fileName: null,
          uploadedAt: null,
          summaryMetrics: null,
          trendData: [],
          alerts: [],
          error: null,
          availableEnvironments: [],
          availableSourceNames: [],
          availableSourceComponents: [],
          availableSourceTypes: [],
          selectedEnvironment: '',
          selectedSourceName: '',
          selectedSourceComponent: '',
          selectedSourceType: '',
        }),

      setError: (error) => set({ error, isLoading: false }),

      setSummaryMetrics: (metrics) => set({ summaryMetrics: metrics }),

      setTrendData: (data) => set({ trendData: data }),

      setAlerts: (alerts) => set({ alerts }),

      setLoading: (loading) => set({ isLoading: loading }),

      setSelectedEnvironment: (env) => set({ selectedEnvironment: env, currentPage: 1 }),

      setSelectedSourceName: (name) => set({ selectedSourceName: name, currentPage: 1 }),

      setSelectedSourceComponent: (component) =>
        set({ selectedSourceComponent: component, currentPage: 1 }),

      setSelectedSourceType: (type) => set({ selectedSourceType: type, currentPage: 1 }),

      setTimeRange: (timeRange) => set({ timeRange, currentPage: 1 }),

      setTimeRangePreset: (preset) =>
        set({
          timeRange: { preset, ...getDateRangeFromPreset(preset) },
          currentPage: 1,
        }),

      setSort: (column, direction) =>
        set({
          sortColumn: column,
          sortDirection: direction,
        }),

      setPage: (page) => set({ currentPage: page }),

      setPageSize: (size) => set({ pageSize: size, currentPage: 1 }),

      setChartGranularity: (granularity) => set({ chartGranularity: granularity }),

      setSelectedChartMetrics: (metrics) => set({ selectedChartMetrics: metrics }),

      setDistributionGroupBy: (groupBy) => set({ distributionGroupBy: groupBy }),

      setSelectedTraceId: (traceId) => set({ selectedTraceId: traceId }),

      // Metric Category Tab Actions
      setActiveMetricCategoryTab: (tab) => set({ activeMetricCategoryTab: tab }),

      setSelectedClassificationMetric: (metric) => set({ selectedClassificationMetric: metric }),

      setSelectedAnalysisMetric: (metric) =>
        set({ selectedAnalysisMetric: metric, analysisInsightsPage: 1 }),

      setAnalysisInsightsPage: (page) => set({ analysisInsightsPage: page }),

      // Executive Summary Actions
      toggleExecutiveSummaryNode: (id) =>
        set((state) => ({
          executiveSummaryExpandedNodes: state.executiveSummaryExpandedNodes.includes(id)
            ? state.executiveSummaryExpandedNodes.filter((n) => n !== id)
            : [...state.executiveSummaryExpandedNodes, id],
        })),

      expandAllExecutiveSummaryNodes: (ids) => set({ executiveSummaryExpandedNodes: ids }),

      collapseAllExecutiveSummaryNodes: () => set({ executiveSummaryExpandedNodes: [] }),

      // DuckDB store actions
      setSyncStatus: (status) =>
        set({
          syncStatus: status,
          datasetReady: status?.state === 'ready',
        }),

      setMetadata: (metadata) => set({ metadata }),

      setDatasetReady: (ready) => set({ datasetReady: ready }),

      populateFiltersFromMetadata: (metadata) => {
        const fv = metadata.filter_values;
        const sourceNames = fv.source_name || [];
        // Auto-select first source if none currently selected
        const current = get().selectedSourceName;
        const autoSource =
          current && sourceNames.includes(current)
            ? current
            : sourceNames.length > 0
              ? sourceNames[0]
              : '';
        set({
          selectedSourceName: autoSource,
          availableEnvironments: fv.environment || [],
          availableSourceNames: sourceNames,
          availableSourceComponents: fv.source_component || [],
          availableSourceTypes: fv.source_type || [],
          rowCount: metadata.row_count,
          columns: metadata.columns.map((c) => c.column_name),
          // Detect metric columns
          metricColumns: metadata.columns
            .filter((c) => c.column_name === 'metric_score' || c.column_name.endsWith('_score'))
            .map((c) => c.column_name),
          // Set time range from metadata if available
          ...(metadata.time_range
            ? {
                timeRange: {
                  preset: 'custom' as const,
                  startDate: metadata.time_range.min,
                  endDate: metadata.time_range.max,
                },
              }
            : {}),
          metadata,
          datasetReady: true,
          format: 'monitoring',
        });
      },
    }),
    {
      name: 'axis-monitoring-store',
      version: 2,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version < 2) {
          // v1 → v2: executive-summary moved to Production page, reset tab to 'score'
          state.activeMetricCategoryTab = 'score';
        }
        if (!state.executiveSummaryExpandedNodes) {
          state.executiveSummaryExpandedNodes = [];
        }
        return state as unknown as MonitoringState;
      },
      partialize: (state) => ({
        // Data metadata (not the actual data - too large for localStorage)
        format: state.format,
        columns: state.columns,
        metricColumns: state.metricColumns,
        rowCount: state.rowCount,
        fileName: state.fileName,
        uploadedAt: state.uploadedAt,
        // Note: available* filter lists are NOT persisted — they are derived
        // from loaded data and would become stale across sessions.
        // UI preferences
        selectedEnvironment: state.selectedEnvironment,
        selectedSourceName: state.selectedSourceName,
        selectedSourceComponent: state.selectedSourceComponent,
        selectedSourceType: state.selectedSourceType,
        timeRange: state.timeRange,
        pageSize: state.pageSize,
        sortColumn: state.sortColumn,
        sortDirection: state.sortDirection,
        // Chart UI preferences
        chartGranularity: state.chartGranularity,
        distributionGroupBy: state.distributionGroupBy,
        // Metric category tab preferences
        activeMetricCategoryTab: state.activeMetricCategoryTab,
        executiveSummaryExpandedNodes: state.executiveSummaryExpandedNodes,
      }),
    }
  )
);
