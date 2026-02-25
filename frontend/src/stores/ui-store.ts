import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_ANNOTATION_TAGS } from '@/types';

import type {
  LearnMainTab,
  WalkthroughType,
  PlaybackSpeed,
  PlaybackState,
  CompareChartType,
  AnnotationScoreMode,
  AnnotationFilter,
  ReportMode,
  ReportType,
  ContextField,
} from '@/types';

export type VisualizeSubTab =
  | 'overview'
  | 'distribution'
  | 'tradeoffs'
  | 'tree'
  | 'response'
  | 'conversation'
  | 'metadata';
export type CompareQuickFilter = 'all' | 'top20' | 'bottom20' | 'highVariance' | 'showDiff';
export type TreeViewMode = 'individual' | 'aggregated';
export type CompareTextMode = 'wrap' | 'clip' | 'full';
export type CaseDiffFilter = 'all' | 'challenger_wins' | 'baseline_wins' | 'significant_diff';

export interface AggregateStats {
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  p25: number;
  p75: number;
  stdDev: number;
  scores: number[]; // For mini distribution visualization
}

export interface SelectedTreeMetric {
  name: string;
  score: number | null;
  weight: number;
  explanation?: string;
  signals?: string[] | string | Record<string, unknown>;
  critique?: string;
  position: { x: number; y: number };
  isAggregated?: boolean;
  aggregateStats?: AggregateStats;
}

interface UIState {
  // Sidebar
  sidebarCollapsed: boolean;
  copilotOpen: boolean;

  // Upload Modal
  uploadModalOpen: boolean;

  // Database Modal
  databaseModalOpen: boolean;
  databaseTargetStore: 'data' | 'monitoring' | 'memory';

  // Filters and selections
  selectedExperiment: string | null;
  selectedExperiments: string[];
  selectedMetrics: string[];
  currentPage: number;
  itemsPerPage: number;

  // View modes
  viewMode: 'table' | 'cards' | 'tree';
  chartType: 'violin' | 'box' | 'radar' | 'scatter' | 'bar' | 'heatmap';

  // Visualize tab state
  visualizeSubTab: VisualizeSubTab;
  selectedTestCaseId: string | null;
  treeViewMode: TreeViewMode;
  distributionChartType: 'violin' | 'box';
  selectedXMetric: string | null;
  selectedYMetric: string | null;
  showTrendline: boolean;
  selectedTreeMetric: SelectedTreeMetric | null;

  // Compare tab state
  compareSearchQuery: string;
  compareQuickFilter: CompareQuickFilter;
  testCaseDetailModalOpen: boolean;
  selectedCompareTestCaseId: string | null;
  compareTextMode: CompareTextMode;
  comparePageSize: number;
  compareSelectedMetrics: string[];
  compareMetadataFilters: Record<string, string[]>;
  compareShowPerformanceSummary: boolean;
  compareDetailCompareMode: boolean;
  compareVisibleFields: string[];

  // Compare charts state
  compareShowCharts: boolean;
  compareChartType: CompareChartType;
  compareDistributionMetric: string | null;
  compareDistributionChartType: 'violin' | 'box';
  compareScatterXMetric: string | null;
  compareScatterYMetric: string | null;
  compareShowTrendline: boolean;
  compareAgreementThreshold: number;

  // Baseline vs Challenger comparison state
  compareBaselineExperiment: string | null;
  compareChallengerExperiment: string | null;
  compareCaseDiffCurrentId: string | null;
  compareCaseDiffFilter: CaseDiffFilter;

  // Analytics chart state
  analyticsResponseMetric: string | null;
  analyticsMetadataGrouping: string | null;
  analyticsPassRateThreshold: number;

  // Learn tab state
  learnMainTab: LearnMainTab;
  learnWalkthroughType: WalkthroughType;
  learnPlaybackState: PlaybackState;
  learnCurrentStep: number;
  learnTotalSteps: number;
  learnPlaybackSpeed: PlaybackSpeed;
  learnExpandedSections: string[];

  // Annotation tab state
  annotateIdColumn: string | null;
  annotateDisplayColumns: string[];
  annotateScoreMode: AnnotationScoreMode;
  annotateCustomScoreRange: [number, number];
  annotateCustomTags: string[];
  annotateFilter: AnnotationFilter;
  annotateShowShortcuts: boolean;
  annotateCurrentIndex: number;

  // Scorecard tab state
  scorecardExpandedNodes: string[];
  scorecardDrilldownMetric: string | null;

  // Report generation state
  reportModalOpen: boolean;
  reportMetricFilter: string | null;
  reportMode: ReportMode;
  reportType: ReportType;
  // Extraction config
  reportScoreThreshold: number;
  reportIncludeNan: boolean;
  reportMetricFilters: string[];
  reportMaxIssues: number;
  reportSampleRate: number;
  reportContextFields: ContextField[];

  // Actions
  toggleSidebar: () => void;
  toggleCopilot: () => void;
  setUploadModalOpen: (open: boolean) => void;
  setDatabaseModalOpen: (open: boolean, targetStore?: 'data' | 'monitoring' | 'memory') => void;
  setSelectedExperiment: (experiment: string | null) => void;
  setSelectedExperiments: (experiments: string[]) => void;
  setSelectedMetrics: (metrics: string[]) => void;
  setCurrentPage: (page: number) => void;
  setItemsPerPage: (count: number) => void;
  setViewMode: (mode: 'table' | 'cards' | 'tree') => void;
  setChartType: (type: UIState['chartType']) => void;

  // Visualize actions
  setVisualizeSubTab: (tab: VisualizeSubTab) => void;
  setSelectedTestCaseId: (id: string | null) => void;
  setTreeViewMode: (mode: TreeViewMode) => void;
  setDistributionChartType: (type: 'violin' | 'box') => void;
  setSelectedXMetric: (metric: string | null) => void;
  setSelectedYMetric: (metric: string | null) => void;
  setShowTrendline: (show: boolean) => void;
  setSelectedTreeMetric: (metric: SelectedTreeMetric | null) => void;
  clearSelectedTreeMetric: () => void;

  // Compare actions
  setCompareSearchQuery: (query: string) => void;
  setCompareQuickFilter: (filter: CompareQuickFilter) => void;
  setTestCaseDetailModalOpen: (open: boolean) => void;
  setSelectedCompareTestCaseId: (id: string | null) => void;
  openTestCaseDetail: (id: string) => void;
  closeTestCaseDetail: () => void;
  setCompareTextMode: (mode: CompareTextMode) => void;
  setComparePageSize: (size: number) => void;
  setCompareSelectedMetrics: (metrics: string[]) => void;
  setCompareMetadataFilter: (key: string, values: string[]) => void;
  clearCompareMetadataFilters: () => void;
  toggleComparePerformanceSummary: () => void;
  setCompareDetailCompareMode: (enabled: boolean) => void;
  setCompareVisibleFields: (fields: string[]) => void;
  toggleCompareVisibleField: (field: string) => void;

  // Compare charts actions
  toggleCompareShowCharts: () => void;
  setCompareChartType: (type: CompareChartType) => void;
  setCompareDistributionMetric: (metric: string | null) => void;
  setCompareDistributionChartType: (type: 'violin' | 'box') => void;
  setCompareScatterXMetric: (metric: string | null) => void;
  setCompareScatterYMetric: (metric: string | null) => void;
  setCompareShowTrendline: (show: boolean) => void;
  setCompareAgreementThreshold: (threshold: number) => void;

  // Baseline vs Challenger actions
  setCompareBaselineExperiment: (experiment: string | null) => void;
  setCompareChallengerExperiment: (experiment: string | null) => void;
  swapBaselineChallenger: () => void;
  setCompareCaseDiffCurrentId: (id: string | null) => void;
  setCompareCaseDiffFilter: (filter: CaseDiffFilter) => void;

  // Analytics chart actions
  setAnalyticsResponseMetric: (metric: string | null) => void;
  setAnalyticsMetadataGrouping: (grouping: string | null) => void;
  setAnalyticsPassRateThreshold: (threshold: number) => void;

  // Learn actions
  setLearnMainTab: (tab: LearnMainTab) => void;
  setLearnWalkthroughType: (type: WalkthroughType) => void;
  setLearnPlaybackState: (state: PlaybackState) => void;
  setLearnCurrentStep: (step: number) => void;
  setLearnTotalSteps: (total: number) => void;
  setLearnPlaybackSpeed: (speed: PlaybackSpeed) => void;
  toggleLearnExpandedSection: (sectionId: string) => void;
  resetLearnPlayback: () => void;
  stepForward: () => void;
  stepBackward: () => void;

  // Annotation actions
  setAnnotateIdColumn: (column: string | null) => void;
  setAnnotateDisplayColumns: (columns: string[]) => void;
  setAnnotateScoreMode: (mode: AnnotationScoreMode) => void;
  setAnnotateCustomScoreRange: (range: [number, number]) => void;
  setAnnotateCustomTags: (tags: string[]) => void;
  addAnnotateCustomTag: (tag: string) => void;
  removeAnnotateCustomTag: (tag: string) => void;
  resetAnnotateTagsToDefault: () => void;
  setAnnotateFilter: (filter: AnnotationFilter) => void;
  toggleAnnotateShowShortcuts: () => void;
  setAnnotateCurrentIndex: (index: number) => void;

  // Scorecard actions
  toggleScorecardNode: (nodeId: string) => void;
  setScorecardDrilldownMetric: (metric: string | null) => void;
  expandAllScorecardNodes: (nodeIds: string[]) => void;
  collapseAllScorecardNodes: () => void;

  // Report generation actions
  openReportModal: (metricFilters?: string[]) => void;
  closeReportModal: () => void;
  setReportMode: (mode: ReportMode) => void;
  setReportType: (type: ReportType) => void;
  setReportScoreThreshold: (threshold: number) => void;
  setReportIncludeNan: (include: boolean) => void;
  setReportMetricFilters: (filters: string[]) => void;
  setReportMaxIssues: (max: number) => void;
  setReportSampleRate: (rate: number) => void;
  setReportContextFields: (fields: ContextField[]) => void;
  toggleReportContextField: (field: ContextField) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Initial state
      sidebarCollapsed: false,
      copilotOpen: false,
      uploadModalOpen: false,
      databaseModalOpen: false,
      databaseTargetStore: 'data',
      selectedExperiment: null,
      selectedExperiments: [],
      selectedMetrics: [],
      currentPage: 1,
      itemsPerPage: 10,
      viewMode: 'table',
      chartType: 'violin',

      // Visualize tab state
      visualizeSubTab: 'overview',
      selectedTestCaseId: null,
      treeViewMode: 'aggregated',
      distributionChartType: 'violin',
      selectedXMetric: null,
      selectedYMetric: null,
      showTrendline: false,
      selectedTreeMetric: null,

      // Compare tab state
      compareSearchQuery: '',
      compareQuickFilter: 'all',
      testCaseDetailModalOpen: false,
      selectedCompareTestCaseId: null,
      compareTextMode: 'clip',
      comparePageSize: 10,
      compareSelectedMetrics: [],
      compareMetadataFilters: {},
      compareShowPerformanceSummary: false,
      compareDetailCompareMode: false,
      compareVisibleFields: ['expected_output'],

      // Compare charts state
      compareShowCharts: false,
      compareChartType: 'distribution',
      compareDistributionMetric: null,
      compareDistributionChartType: 'violin',
      compareScatterXMetric: null,
      compareScatterYMetric: null,
      compareShowTrendline: false,
      compareAgreementThreshold: 0.5,

      // Baseline vs Challenger state
      compareBaselineExperiment: null,
      compareChallengerExperiment: null,
      compareCaseDiffCurrentId: null,
      compareCaseDiffFilter: 'all',

      // Analytics chart state
      analyticsResponseMetric: null,
      analyticsMetadataGrouping: null,
      analyticsPassRateThreshold: 0.5,

      // Learn tab state
      learnMainTab: 'overview',
      learnWalkthroughType: 'single-turn',
      learnPlaybackState: 'stopped',
      learnCurrentStep: 0,
      learnTotalSteps: 0,
      learnPlaybackSpeed: 1,
      learnExpandedSections: [],

      // Annotation tab state
      annotateIdColumn: null,
      annotateDisplayColumns: [],
      annotateScoreMode: 'binary',
      annotateCustomScoreRange: [1, 5],
      annotateCustomTags: [...DEFAULT_ANNOTATION_TAGS],
      annotateFilter: 'all',
      annotateShowShortcuts: true,
      annotateCurrentIndex: 0,

      // Scorecard tab state
      scorecardExpandedNodes: [],
      scorecardDrilldownMetric: null,

      // Report generation state
      reportModalOpen: false,
      reportMetricFilter: null,
      reportMode: 'low' as ReportMode,
      reportType: 'summary' as ReportType,
      // Extraction config
      reportScoreThreshold: 0.5,
      reportIncludeNan: false,
      reportMetricFilters: [],
      reportMaxIssues: 100,
      reportSampleRate: 1.0,
      reportContextFields: [
        'query',
        'actual_output',
        'expected_output',
        'signals',
      ] as ContextField[],

      // Actions
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      toggleCopilot: () => set((state) => ({ copilotOpen: !state.copilotOpen })),

      setUploadModalOpen: (uploadModalOpen) => set({ uploadModalOpen }),

      setDatabaseModalOpen: (databaseModalOpen, targetStore) =>
        set({ databaseModalOpen, ...(targetStore && { databaseTargetStore: targetStore }) }),

      setSelectedExperiment: (selectedExperiment) => set({ selectedExperiment }),

      setSelectedExperiments: (selectedExperiments) => set({ selectedExperiments }),

      setSelectedMetrics: (selectedMetrics) => set({ selectedMetrics }),

      setCurrentPage: (currentPage) => set({ currentPage }),

      setItemsPerPage: (itemsPerPage) => set({ itemsPerPage, currentPage: 1 }),

      setViewMode: (viewMode) => set({ viewMode }),

      setChartType: (chartType) => set({ chartType }),

      // Visualize actions
      setVisualizeSubTab: (visualizeSubTab) => set({ visualizeSubTab }),

      setSelectedTestCaseId: (selectedTestCaseId) => set({ selectedTestCaseId }),

      setTreeViewMode: (treeViewMode) => set({ treeViewMode }),

      setDistributionChartType: (distributionChartType) => set({ distributionChartType }),

      setSelectedXMetric: (selectedXMetric) => set({ selectedXMetric }),

      setSelectedYMetric: (selectedYMetric) => set({ selectedYMetric }),

      setShowTrendline: (showTrendline) => set({ showTrendline }),

      setSelectedTreeMetric: (selectedTreeMetric) => set({ selectedTreeMetric }),

      clearSelectedTreeMetric: () => set({ selectedTreeMetric: null }),

      // Compare actions
      setCompareSearchQuery: (compareSearchQuery) => set({ compareSearchQuery }),

      setCompareQuickFilter: (compareQuickFilter) => set({ compareQuickFilter }),

      setTestCaseDetailModalOpen: (testCaseDetailModalOpen) => set({ testCaseDetailModalOpen }),

      setSelectedCompareTestCaseId: (selectedCompareTestCaseId) =>
        set({ selectedCompareTestCaseId }),

      openTestCaseDetail: (id) =>
        set({ selectedCompareTestCaseId: id, testCaseDetailModalOpen: true }),

      closeTestCaseDetail: () =>
        set({ testCaseDetailModalOpen: false, selectedCompareTestCaseId: null }),

      setCompareTextMode: (compareTextMode) => set({ compareTextMode }),

      setComparePageSize: (comparePageSize) => set({ comparePageSize }),

      setCompareSelectedMetrics: (compareSelectedMetrics) => set({ compareSelectedMetrics }),

      setCompareMetadataFilter: (key, values) =>
        set((state) => ({
          compareMetadataFilters: {
            ...state.compareMetadataFilters,
            [key]: values,
          },
        })),

      clearCompareMetadataFilters: () => set({ compareMetadataFilters: {} }),

      toggleComparePerformanceSummary: () =>
        set((state) => ({ compareShowPerformanceSummary: !state.compareShowPerformanceSummary })),

      setCompareDetailCompareMode: (compareDetailCompareMode) => set({ compareDetailCompareMode }),
      setCompareVisibleFields: (compareVisibleFields) => set({ compareVisibleFields }),
      toggleCompareVisibleField: (field) =>
        set((state) => ({
          compareVisibleFields: state.compareVisibleFields.includes(field)
            ? state.compareVisibleFields.filter((f) => f !== field)
            : [...state.compareVisibleFields, field],
        })),

      // Compare charts actions
      toggleCompareShowCharts: () =>
        set((state) => ({ compareShowCharts: !state.compareShowCharts })),

      setCompareChartType: (compareChartType) => set({ compareChartType }),

      setCompareDistributionMetric: (compareDistributionMetric) =>
        set({ compareDistributionMetric }),

      setCompareDistributionChartType: (compareDistributionChartType) =>
        set({ compareDistributionChartType }),

      setCompareScatterXMetric: (compareScatterXMetric) => set({ compareScatterXMetric }),

      setCompareScatterYMetric: (compareScatterYMetric) => set({ compareScatterYMetric }),

      setCompareShowTrendline: (compareShowTrendline) => set({ compareShowTrendline }),

      setCompareAgreementThreshold: (compareAgreementThreshold) =>
        set({ compareAgreementThreshold }),

      // Baseline vs Challenger actions
      setCompareBaselineExperiment: (compareBaselineExperiment) =>
        set({ compareBaselineExperiment }),

      setCompareChallengerExperiment: (compareChallengerExperiment) =>
        set({ compareChallengerExperiment }),

      swapBaselineChallenger: () =>
        set((state) => ({
          compareBaselineExperiment: state.compareChallengerExperiment,
          compareChallengerExperiment: state.compareBaselineExperiment,
        })),

      setCompareCaseDiffCurrentId: (compareCaseDiffCurrentId) => set({ compareCaseDiffCurrentId }),

      setCompareCaseDiffFilter: (compareCaseDiffFilter) => set({ compareCaseDiffFilter }),

      // Analytics chart actions
      setAnalyticsResponseMetric: (analyticsResponseMetric) => set({ analyticsResponseMetric }),

      setAnalyticsMetadataGrouping: (analyticsMetadataGrouping) =>
        set({ analyticsMetadataGrouping }),

      setAnalyticsPassRateThreshold: (analyticsPassRateThreshold) =>
        set({ analyticsPassRateThreshold }),

      // Learn actions
      setLearnMainTab: (learnMainTab) => set({ learnMainTab }),

      setLearnWalkthroughType: (learnWalkthroughType) =>
        set({
          learnWalkthroughType,
          learnCurrentStep: 0,
          learnPlaybackState: 'stopped',
        }),

      setLearnPlaybackState: (learnPlaybackState) => set({ learnPlaybackState }),

      setLearnCurrentStep: (learnCurrentStep) => set({ learnCurrentStep }),

      setLearnTotalSteps: (learnTotalSteps) => set({ learnTotalSteps }),

      setLearnPlaybackSpeed: (learnPlaybackSpeed) => set({ learnPlaybackSpeed }),

      toggleLearnExpandedSection: (sectionId) =>
        set((state) => ({
          learnExpandedSections: state.learnExpandedSections.includes(sectionId)
            ? state.learnExpandedSections.filter((id) => id !== sectionId)
            : [...state.learnExpandedSections, sectionId],
        })),

      resetLearnPlayback: () =>
        set({
          learnCurrentStep: 0,
          learnPlaybackState: 'stopped',
        }),

      stepForward: () =>
        set((state) => ({
          learnCurrentStep:
            state.learnCurrentStep < state.learnTotalSteps - 1
              ? state.learnCurrentStep + 1
              : state.learnCurrentStep,
        })),

      stepBackward: () =>
        set((state) => ({
          learnCurrentStep:
            state.learnCurrentStep > 0 ? state.learnCurrentStep - 1 : state.learnCurrentStep,
        })),

      // Annotation actions
      setAnnotateIdColumn: (annotateIdColumn) => set({ annotateIdColumn }),

      setAnnotateDisplayColumns: (annotateDisplayColumns) => set({ annotateDisplayColumns }),

      setAnnotateScoreMode: (annotateScoreMode) => set({ annotateScoreMode }),

      setAnnotateCustomScoreRange: (annotateCustomScoreRange) => set({ annotateCustomScoreRange }),

      setAnnotateCustomTags: (annotateCustomTags) => set({ annotateCustomTags }),

      addAnnotateCustomTag: (tag) =>
        set((state) => ({
          annotateCustomTags: state.annotateCustomTags.includes(tag)
            ? state.annotateCustomTags
            : [...state.annotateCustomTags, tag],
        })),

      removeAnnotateCustomTag: (tag) =>
        set((state) => ({
          annotateCustomTags: state.annotateCustomTags.filter((t) => t !== tag),
        })),

      resetAnnotateTagsToDefault: () => set({ annotateCustomTags: [...DEFAULT_ANNOTATION_TAGS] }),

      setAnnotateFilter: (annotateFilter) => set({ annotateFilter }),

      toggleAnnotateShowShortcuts: () =>
        set((state) => ({ annotateShowShortcuts: !state.annotateShowShortcuts })),

      setAnnotateCurrentIndex: (annotateCurrentIndex) => set({ annotateCurrentIndex }),

      // Scorecard actions
      toggleScorecardNode: (nodeId) =>
        set((state) => ({
          scorecardExpandedNodes: state.scorecardExpandedNodes.includes(nodeId)
            ? state.scorecardExpandedNodes.filter((id) => id !== nodeId)
            : [...state.scorecardExpandedNodes, nodeId],
        })),

      setScorecardDrilldownMetric: (scorecardDrilldownMetric) => set({ scorecardDrilldownMetric }),

      expandAllScorecardNodes: (nodeIds) => set({ scorecardExpandedNodes: nodeIds }),

      collapseAllScorecardNodes: () => set({ scorecardExpandedNodes: [] }),

      // Report generation actions
      openReportModal: (metricFilters) =>
        set({
          reportModalOpen: true,
          reportMetricFilter: metricFilters && metricFilters.length > 0 ? metricFilters[0] : null,
          reportMetricFilters: metricFilters || [],
        }),

      closeReportModal: () =>
        set({ reportModalOpen: false, reportMetricFilter: null, reportMetricFilters: [] }),

      setReportMode: (reportMode) => set({ reportMode }),

      setReportType: (reportType) => set({ reportType }),

      setReportScoreThreshold: (reportScoreThreshold) => set({ reportScoreThreshold }),

      setReportIncludeNan: (reportIncludeNan) => set({ reportIncludeNan }),

      setReportMetricFilters: (reportMetricFilters) => set({ reportMetricFilters }),

      setReportMaxIssues: (reportMaxIssues) => set({ reportMaxIssues }),

      setReportSampleRate: (reportSampleRate) => set({ reportSampleRate }),

      setReportContextFields: (reportContextFields) => set({ reportContextFields }),

      toggleReportContextField: (field) =>
        set((state) => ({
          reportContextFields: state.reportContextFields.includes(field)
            ? state.reportContextFields.filter((f) => f !== field)
            : [...state.reportContextFields, field],
        })),
    }),
    {
      name: 'axis-ui-store',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        itemsPerPage: state.itemsPerPage,
        viewMode: state.viewMode,
        chartType: state.chartType,
        visualizeSubTab: state.visualizeSubTab,
        treeViewMode: state.treeViewMode,
        distributionChartType: state.distributionChartType,
        compareTextMode: state.compareTextMode,
        comparePageSize: state.comparePageSize,
        compareShowCharts: state.compareShowCharts,
        compareChartType: state.compareChartType,
        compareDistributionChartType: state.compareDistributionChartType,
        compareVisibleFields: state.compareVisibleFields,
        analyticsPassRateThreshold: state.analyticsPassRateThreshold,
        learnMainTab: state.learnMainTab,
        learnPlaybackSpeed: state.learnPlaybackSpeed,
        // Annotation tab persistence
        annotateIdColumn: state.annotateIdColumn,
        annotateDisplayColumns: state.annotateDisplayColumns,
        annotateScoreMode: state.annotateScoreMode,
        annotateCustomScoreRange: state.annotateCustomScoreRange,
        annotateCustomTags: state.annotateCustomTags,
        annotateShowShortcuts: state.annotateShowShortcuts,
        // Scorecard tab persistence
        scorecardExpandedNodes: state.scorecardExpandedNodes,
        // Report generation persistence
        reportMode: state.reportMode,
        reportType: state.reportType,
        reportScoreThreshold: state.reportScoreThreshold,
        reportIncludeNan: state.reportIncludeNan,
        reportMaxIssues: state.reportMaxIssues,
        reportSampleRate: state.reportSampleRate,
        reportContextFields: state.reportContextFields,
      }),
    }
  )
);
