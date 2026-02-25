'use client';

import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  Eye,
  Loader2,
  RotateCcw,
  Search,
  TrendingDown,
  TrendingUp,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { FileUpload } from '@/components/file-upload';
import {
  AlertsTab,
  AnalysisInsightsTab,
  ClassificationMetricsTab,
  FailingOutputDetailModal,
  LatencyDistributionChart,
  MetricBreakdownChart,
  MetricCategoryTabs,
  ScoreTrendChart,
} from '@/components/monitoring';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { PageHeader } from '@/components/ui/PageHeader';
import { SourceSelector } from '@/components/ui/SourceSelector';
import {
  DEFAULT_ANOMALY_CONFIG,
  detectAnomalies,
  generateThresholdAlerts,
} from '@/lib/anomaly-detection';
import { getDatasetMetadata, getStoreStatus } from '@/lib/api';
import {
  useMonitoringFailingOutputs,
  useMonitoringLatencyDist,
  useMonitoringMetricBreakdown,
  useMonitoringSummary,
  useMonitoringTraces,
  useMonitoringTrends,
} from '@/lib/hooks/useMonitoringData';
import { useMonitoringAutoImport, useMonitoringDBConfig } from '@/lib/hooks/useMonitoringUpload';
import { cn } from '@/lib/utils';
import {
  useMonitoringStore,
  type MonitoringTimeRange,
  type MonitoringTimeRangePreset,
} from '@/stores';

import type { AnomalyDetectionConfig } from '@/lib/anomaly-detection';
import type {
  MonitoringChartGranularity,
  MonitoringFilters,
  MonitoringGroupBy,
  MonitoringRecord,
  MonitoringSummaryMetrics,
} from '@/types';

// Time range preset options
const TIME_RANGE_OPTIONS: { value: MonitoringTimeRangePreset; label: string }[] = [
  { value: '1h', label: 'Last hour' },
  { value: '6h', label: 'Last 6 hours' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
];

// Compute summary metrics from monitoring data
function computeSummaryMetrics(
  records: MonitoringRecord[],
  metricColumns: string[]
): MonitoringSummaryMetrics {
  const total = records.length;
  if (total === 0) {
    return {
      totalRecords: 0,
      avgScore: 0,
      passRate: 0,
      errorRate: 0,
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      activeAlerts: 0,
    };
  }

  // Calculate average score from metric columns
  let totalScore = 0;
  let scoreCount = 0;
  let passingCount = 0;

  records.forEach((record) => {
    metricColumns.forEach((col) => {
      const value = record[col];
      if (typeof value === 'number' && !isNaN(value)) {
        totalScore += value;
        scoreCount++;
        if (value >= 0.5) {
          passingCount++;
        }
      }
    });
  });

  const avgScore = scoreCount > 0 ? totalScore / scoreCount : 0;
  const passRate = scoreCount > 0 ? (passingCount / scoreCount) * 100 : 0;

  // Calculate error rate
  const errorCount = records.filter((r) => r.has_errors).length;
  const errorRate = (errorCount / total) * 100;

  // Calculate latency percentiles
  const latencies = records
    .map((r) => r.latency)
    .filter((l): l is number => typeof l === 'number' && !isNaN(l))
    .sort((a, b) => a - b);

  const avgLatency =
    latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

  const getPercentile = (arr: number[], p: number) => {
    if (arr.length === 0) return 0;
    const idx = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, idx)];
  };

  return {
    totalRecords: total,
    avgScore,
    passRate,
    errorRate,
    avgLatencyMs: avgLatency,
    p50LatencyMs: getPercentile(latencies, 50),
    p95LatencyMs: getPercentile(latencies, 95),
    p99LatencyMs: getPercentile(latencies, 99),
    activeAlerts: 0, // Will be computed from alerts
  };
}

// Resolve thresholds: per_source override > default > hardcoded fallback
function resolveThresholds(
  dbConfig:
    | {
        thresholds?: {
          default: { good: number; pass: number };
          per_source?: Record<string, { good: number; pass: number }>;
        };
      }
    | undefined,
  selectedSourceName: string
): { good: number; pass: number } {
  const fallback = { good: 0.7, pass: 0.5 };
  if (!dbConfig?.thresholds) return fallback;
  if (selectedSourceName && dbConfig.thresholds.per_source?.[selectedSourceName]) {
    return dbConfig.thresholds.per_source[selectedSourceName];
  }
  return dbConfig.thresholds.default ?? fallback;
}

// Time range selector component
function TimeRangeSelector({
  timeRange,
  onPresetChange,
  onCustomChange,
}: {
  timeRange: MonitoringTimeRange;
  onPresetChange: (preset: MonitoringTimeRangePreset) => void;
  onCustomChange: (timeRange: MonitoringTimeRange) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(timeRange.preset === 'custom');
  const [customStart, setCustomStart] = useState(timeRange.startDate.split('T')[0]);
  const [customEnd, setCustomEnd] = useState(timeRange.endDate.split('T')[0]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLabel =
    TIME_RANGE_OPTIONS.find((o) => o.value === timeRange.preset)?.label || 'Select range';

  const handlePresetSelect = (preset: MonitoringTimeRangePreset) => {
    if (preset === 'custom') {
      setShowCustom(true);
    } else {
      setShowCustom(false);
      onPresetChange(preset);
      setIsOpen(false);
    }
  };

  const handleApplyCustom = () => {
    onCustomChange({
      preset: 'custom',
      startDate: new Date(customStart).toISOString(),
      endDate: new Date(customEnd).toISOString(),
    });
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-[34px] items-center gap-2 rounded-lg border border-border bg-white px-3 text-xs font-medium text-text-primary transition-colors hover:bg-gray-50"
      >
        <Calendar className="h-3.5 w-3.5 text-text-muted" />
        <span>{currentLabel}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 text-text-muted transition-transform', isOpen && 'rotate-180')}
        />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border border-border bg-white shadow-lg">
          <div className="py-1">
            {TIME_RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handlePresetSelect(option.value)}
                className={cn(
                  'flex w-full items-center px-4 py-1.5 text-left text-xs transition-colors hover:bg-gray-50',
                  timeRange.preset === option.value && !showCustom
                    ? 'bg-primary/5 font-medium text-primary'
                    : 'text-text-primary'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {showCustom && (
            <div className="border-t border-border p-3">
              <div className="mb-3 space-y-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full rounded border border-border px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">End Date</label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full rounded border border-border px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <button
                onClick={handleApplyCustom}
                className="w-full rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Loading state component for auto-connect
function AutoConnectLoading({ tableName }: { tableName?: string }) {
  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Activity}
        title="Monitor"
        subtitle="Real-time performance monitoring and alerts"
      />
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="card p-8">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
                <Loader2 className="h-7 w-7 animate-spin text-white" />
              </div>
              <h2 className="mb-2 text-lg font-semibold text-text-primary">
                Connecting to Database...
              </h2>
              <p className="max-w-md text-sm text-text-muted">
                {tableName
                  ? `Loading monitoring data from ${tableName}`
                  : 'Auto-importing monitoring data from configured database'}
              </p>
              <div className="mt-4 flex items-center gap-2 text-sm text-primary">
                <Database className="h-4 w-4" />
                <span>Auto-connect enabled</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Empty state component
function EmptyState({
  isAutoConnecting,
  autoConnectError,
  onRetryAutoConnect,
}: {
  isAutoConnecting: boolean;
  autoConnectError: string | null;
  onRetryAutoConnect?: () => void;
}) {
  if (isAutoConnecting) {
    return <AutoConnectLoading />;
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Activity}
        title="Monitor"
        subtitle="Real-time performance monitoring and alerts"
      />
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Auto-connect error banner */}
        {autoConnectError && (
          <div className="mx-auto mb-6 max-w-2xl">
            <div className="border-warning/30 bg-warning/10 flex items-center gap-3 rounded-lg border px-4 py-3">
              <Database className="h-5 w-5 flex-shrink-0 text-warning" />
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">
                  Database auto-connect failed
                </p>
                <p className="text-xs text-text-muted">{autoConnectError}</p>
              </div>
              {onRetryAutoConnect && (
                <button
                  onClick={onRetryAutoConnect}
                  className="bg-warning/20 hover:bg-warning/30 rounded-lg px-3 py-1.5 text-xs font-medium text-warning"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}

        {/* Upload Section */}
        <div className="mx-auto max-w-2xl">
          <div className="card p-8">
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                <Upload className="h-7 w-7 text-primary" />
              </div>
              <h2 className="mb-2 text-lg font-semibold text-text-primary">
                Import Monitoring Data
              </h2>
              <p className="max-w-md text-sm text-text-muted">
                Upload a CSV file with monitoring metrics or connect to a database to track AI agent
                performance and quality metrics over time.
              </p>
            </div>

            <FileUpload targetStore="monitoring" />

            {/* Expected columns hint */}
            <div className="mt-6 rounded-lg border border-border bg-gray-50 p-4">
              <p className="mb-2 text-xs font-medium text-text-muted">Expected columns:</p>
              <div className="flex flex-wrap gap-2">
                {['dataset_id', 'timestamp', 'model_name', 'latency', '*_score'].map((col) => (
                  <span
                    key={col}
                    className="rounded bg-white px-2 py-1 font-mono text-xs text-text-secondary shadow-sm"
                  >
                    {col}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// KPI Card component
function KPICard({
  label,
  value,
  trend,
  trendUp,
  icon: Icon,
  format = 'number',
  isLoading = false,
}: {
  label: string;
  value: number;
  trend?: string;
  trendUp?: boolean;
  icon: React.ElementType;
  format?: 'number' | 'percent' | 'ms';
  isLoading?: boolean;
}) {
  const formatValue = () => {
    switch (format) {
      case 'percent':
        return `${value.toFixed(1)}%`;
      case 'ms':
        return `${value.toFixed(1)}s`;
      default:
        return value >= 1 ? value.toFixed(2) : value.toFixed(3);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-white px-4 py-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</span>
        {trendUp !== undefined ? (
          trendUp ? (
            <TrendingUp className="h-3.5 w-3.5 text-success" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 text-error" />
          )
        ) : (
          <Icon className="h-3.5 w-3.5 text-text-muted" />
        )}
      </div>
      {isLoading ? (
        <p className="animate-pulse font-mono text-xl font-semibold tabular-nums text-text-muted">
          &mdash;
        </p>
      ) : (
        <p className="font-mono text-xl font-semibold tabular-nums text-text-primary">
          {formatValue()}
        </p>
      )}
      {trend && !isLoading && (
        <p className={cn('text-xs', trendUp ? 'text-success' : 'text-error')}>{trend}</p>
      )}
    </div>
  );
}

// Granularity selector options
const GRANULARITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

// GroupBy selector options
const GROUP_BY_OPTIONS: { value: string; label: string }[] = [
  { value: 'environment', label: 'By Environment' },
  { value: 'source_name', label: 'By Source' },
  { value: 'source_component', label: 'By Component' },
  { value: 'source_type', label: 'By Type' },
  { value: '', label: 'None' },
];

// Threshold options
const THRESHOLD_OPTIONS: { value: string; label: string }[] = [
  { value: '0.3', label: '0.3' },
  { value: '0.5', label: '0.5' },
  { value: '0.7', label: '0.7' },
  { value: '0.8', label: '0.8' },
  { value: '0.9', label: '0.9' },
];

export default function MonitoringPage() {
  const {
    data,
    metricColumns,
    summaryMetrics,
    alerts,
    selectedEnvironment,
    selectedSourceName,
    selectedSourceComponent,
    selectedSourceType,
    availableEnvironments,
    availableSourceNames,
    availableSourceComponents,
    availableSourceTypes,
    timeRange,
    chartGranularity,
    distributionGroupBy,
    activeMetricCategoryTab,
    selectedAnalysisMetric,
    analysisInsightsPage,
    isLoading,
    datasetReady,
    metadata: storeMetadata,
    setSummaryMetrics,
    setAlerts,
    setSelectedEnvironment,
    setSelectedSourceName,
    setSelectedSourceComponent,
    setSelectedSourceType,
    setTimeRange,
    setTimeRangePreset,
    setChartGranularity,
    setDistributionGroupBy,
    setActiveMetricCategoryTab,
    setSelectedAnalysisMetric,
    setAnalysisInsightsPage,
    setSyncStatus,
    populateFiltersFromMetadata,
  } = useMonitoringStore();

  // Build MonitoringFilters from store filter state (for DuckDB-backed endpoints)
  const monitoringFilters: MonitoringFilters = useMemo(
    () => ({
      environment: selectedEnvironment || undefined,
      source_name: selectedSourceName || undefined,
      source_component: selectedSourceComponent || undefined,
      source_type: selectedSourceType || undefined,
      time_start: timeRange.startDate || undefined,
      time_end: timeRange.endDate || undefined,
    }),
    [
      selectedEnvironment,
      selectedSourceName,
      selectedSourceComponent,
      selectedSourceType,
      timeRange,
    ]
  );

  // Auto-connect hooks
  const { data: dbConfig, isLoading: isLoadingConfig } = useMonitoringDBConfig();
  const autoImportMutation = useMonitoringAutoImport();

  // Resolve score thresholds from config (per-source override > default > fallback)
  const resolvedThresholds = useMemo(
    () => resolveThresholds(dbConfig, selectedSourceName),
    [dbConfig, selectedSourceName]
  );

  // Resolve anomaly detection config from db-config response
  const anomalyConfig: AnomalyDetectionConfig = useMemo(
    () =>
      (dbConfig?.anomaly_detection as AnomalyDetectionConfig | undefined) ?? DEFAULT_ANOMALY_CONFIG,
    [dbConfig]
  );

  // Poll DuckDB store status on mount → populate filters from metadata if ready
  useEffect(() => {
    let cancelled = false;
    const checkStore = async () => {
      try {
        const status = await getStoreStatus();
        if (cancelled) return;
        const monStatus = status.datasets?.monitoring_data;
        if (monStatus) {
          setSyncStatus(monStatus);
          if (monStatus.state === 'ready') {
            const meta = await getDatasetMetadata('monitoring');
            if (!cancelled && meta.metadata) {
              populateFiltersFromMetadata(meta.metadata);
            }
          }
        }
      } catch {
        // Store not available — fallback to CSV mode
      }
    };
    checkStore();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Table state
  const [tablePage, setTablePage] = useState(1);
  const [selectedRecord, setSelectedRecord] = useState<MonitoringRecord | null>(null);
  const tablePageSize = 10;

  // Trace table search, filter, sort
  const [traceSearchInput, setTraceSearchInput] = useState('');
  const [debouncedTraceSearch, setDebouncedTraceSearch] = useState('');
  const [traceMetricFilter, setTraceMetricFilter] = useState('');
  const [traceSortField, setTraceSortField] = useState<'timestamp' | 'score'>('timestamp');
  const [traceSortDirection, setTraceSortDirection] = useState<'asc' | 'desc'>('desc');

  // Debounce free-text search (300ms) — pagination/sort fire immediately
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTraceSearch(traceSearchInput), 300);
    return () => clearTimeout(timer);
  }, [traceSearchInput]);

  // Failing threshold state
  const [failingThreshold, setFailingThreshold] = useState(0.5);

  // Selected failing output for detail modal
  const [selectedFailingOutput, setSelectedFailingOutput] = useState<{
    record: MonitoringRecord;
    metric: string;
    score: number;
  } | null>(null);

  // Track auto-connect state
  const [hasAttemptedAutoConnect, setHasAttemptedAutoConnect] = useState(false);
  const [autoConnectError, setAutoConnectError] = useState<string | null>(null);

  // Auto-connect on mount if configured
  useEffect(() => {
    if (
      dbConfig &&
      (dbConfig.auto_connect || dbConfig.auto_load) &&
      !hasAttemptedAutoConnect &&
      data.length === 0 &&
      !autoImportMutation.isPending &&
      !isLoading
    ) {
      setHasAttemptedAutoConnect(true);
      setAutoConnectError(null);
      autoImportMutation.mutate(undefined, {
        onError: (error) => {
          setAutoConnectError(
            error instanceof Error ? error.message : 'Failed to connect to database'
          );
        },
      });
    }
  }, [dbConfig, hasAttemptedAutoConnect, data.length, autoImportMutation, isLoading]);

  // Handler to retry auto-connect
  const handleRetryAutoConnect = () => {
    setAutoConnectError(null);
    autoImportMutation.mutate(undefined, {
      onError: (error) => {
        setAutoConnectError(
          error instanceof Error ? error.message : 'Failed to connect to database'
        );
      },
    });
  };

  // Determine if we're in auto-connecting state
  const isAutoConnecting =
    data.length === 0 &&
    (autoImportMutation.isPending ||
      isLoadingConfig ||
      (isLoading && (dbConfig === undefined || dbConfig?.auto_connect || dbConfig?.auto_load)));

  // Filter data by selected filters and time range (CSV mode only)
  const filteredData = useMemo(() => {
    // In DuckDB mode, filtering is server-side — skip expensive client-side iteration
    if (datasetReady) return [];
    if (data.length === 0) return [];
    return data.filter((record) => {
      if (selectedEnvironment && record.environment !== selectedEnvironment) return false;
      if (selectedSourceName && record.source_name !== selectedSourceName) return false;
      if (selectedSourceComponent && record.source_component !== selectedSourceComponent)
        return false;
      if (selectedSourceType && record.source_type !== selectedSourceType) return false;
      if (record.timestamp) {
        const recordTime = new Date(record.timestamp).getTime();
        const startTime = new Date(timeRange.startDate).getTime();
        const endTime = new Date(timeRange.endDate).getTime();
        if (recordTime < startTime || recordTime > endTime) return false;
      }
      return true;
    });
  }, [
    data,
    datasetReady,
    selectedEnvironment,
    selectedSourceName,
    selectedSourceComponent,
    selectedSourceType,
    timeRange,
  ]);

  // Split filtered data by metric category
  const {
    scoreData,
    classificationData,
    analysisData,
    hasClassificationMetrics,
    hasAnalysisMetrics,
  } = useMemo(() => {
    // In DuckDB mode, derive category availability from cached metadata filter_values
    if (datasetReady) {
      const metricCategories = storeMetadata?.filter_values?.metric_category ?? [];
      return {
        scoreData: [] as MonitoringRecord[],
        classificationData: [] as MonitoringRecord[],
        analysisData: [] as MonitoringRecord[],
        hasClassificationMetrics: metricCategories.some(
          (c: string) => c.toUpperCase() === 'CLASSIFICATION'
        ),
        hasAnalysisMetrics: metricCategories.some((c: string) => c.toUpperCase() === 'ANALYSIS'),
      };
    }

    const score: MonitoringRecord[] = [];
    const classification: MonitoringRecord[] = [];
    const analysis: MonitoringRecord[] = [];

    filteredData.forEach((record) => {
      const category = record.metric_category?.toString().toUpperCase();
      if (category === 'CLASSIFICATION') {
        classification.push(record);
      } else if (category === 'ANALYSIS') {
        analysis.push(record);
      } else {
        score.push(record);
      }
    });

    return {
      scoreData: score,
      classificationData: classification,
      analysisData: analysis,
      hasClassificationMetrics: classification.length > 0,
      hasAnalysisMetrics: analysis.length > 0,
    };
  }, [filteredData, datasetReady, storeMetadata]);

  // Metric filter options for trace table
  const traceMetricOptions = useMemo(() => {
    const isLongFormat =
      scoreData.length > 0 && 'metric_name' in scoreData[0] && 'metric_score' in scoreData[0];

    const options: { value: string; label: string }[] = [{ value: '', label: 'All Metrics' }];

    if (isLongFormat) {
      const uniqueMetrics = new Set<string>();
      scoreData.forEach((r) => {
        if (r.metric_name) uniqueMetrics.add(String(r.metric_name));
      });
      Array.from(uniqueMetrics)
        .sort()
        .forEach((m) => options.push({ value: m, label: m }));
    } else {
      metricColumns.forEach((col) =>
        options.push({ value: col, label: col.replace(/_score$/, '') })
      );
    }

    return options;
  }, [scoreData, metricColumns]);

  // Filtered + sorted traces (CSV mode only — DuckDB uses server-side)
  const filteredTraces = useMemo(() => {
    if (datasetReady) return [];
    const isLongFormat =
      scoreData.length > 0 && 'metric_name' in scoreData[0] && 'metric_score' in scoreData[0];

    let result = scoreData;

    // Search filter
    if (traceSearchInput) {
      const term = traceSearchInput.toLowerCase();
      result = result.filter((r) => {
        const traceId = (r.trace_id || '').toLowerCase();
        const query = String(r.query || '').toLowerCase();
        const output = String(r.actual_output || '').toLowerCase();
        return traceId.includes(term) || query.includes(term) || output.includes(term);
      });
    }

    // Metric filter (only applies to long format — in wide format all rows have all metrics)
    if (traceMetricFilter && isLongFormat) {
      result = result.filter((r) => String(r.metric_name) === traceMetricFilter);
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (traceSortField === 'timestamp') {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        cmp = ta - tb;
      } else {
        // score
        const sa = isLongFormat
          ? typeof a.metric_score === 'number'
            ? a.metric_score
            : 0
          : typeof a[metricColumns[0]] === 'number'
            ? (a[metricColumns[0]] as number)
            : 0;
        const sb = isLongFormat
          ? typeof b.metric_score === 'number'
            ? b.metric_score
            : 0
          : typeof b[metricColumns[0]] === 'number'
            ? (b[metricColumns[0]] as number)
            : 0;
        cmp = sa - sb;
      }
      return traceSortDirection === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [
    scoreData,
    datasetReady,
    traceSearchInput,
    traceMetricFilter,
    traceSortField,
    traceSortDirection,
    metricColumns,
  ]);

  // Reset table page when trace filters change
  useEffect(() => {
    setTablePage(1);
  }, [debouncedTraceSearch, traceMetricFilter, traceSortField, traceSortDirection]);

  // Only use server-side pagination when DuckDB is ready AND metadata is loaded
  const useServerPagination = datasetReady && storeMetadata !== null;

  // --------------------------------------------------------------------------
  // React Query hooks for DuckDB-backed data
  // --------------------------------------------------------------------------
  const scoreFilters: MonitoringFilters = useMemo(
    () => ({ ...monitoringFilters, metric_category: 'SCORE' }),
    [monitoringFilters]
  );

  // Server-side trace pagination (DuckDB mode)
  const tracesQuery = useMonitoringTraces(
    monitoringFilters,
    tablePage,
    tablePageSize,
    traceSortField,
    traceSortDirection,
    debouncedTraceSearch,
    traceMetricFilter,
    useServerPagination
  );

  const serverTraces = (tracesQuery.data?.data ?? []) as unknown as MonitoringRecord[];
  const serverTraceTotal = tracesQuery.data?.total ?? 0;
  const tracesLoading = tracesQuery.isFetching;

  // Server-side failing outputs (DuckDB mode)
  const failingQuery = useMonitoringFailingOutputs(monitoringFilters, useServerPagination);
  const serverFailingOutputs = (failingQuery.data?.data ?? []) as unknown as MonitoringRecord[];
  const failingLoading = failingQuery.isFetching;

  // Actually render server data only when the server fetch returned rows.
  const useServerData = useServerPagination && (serverTraceTotal > 0 || scoreData.length === 0);
  const useServerFailing =
    useServerPagination && (serverFailingOutputs.length > 0 || scoreData.length === 0);

  // --------------------------------------------------------------------------
  // React Query hooks for chart data (Score tab — always enabled when ready)
  // --------------------------------------------------------------------------
  const chartsEnabled = datasetReady || (scoreData.length > 0 && metricColumns.length > 0);

  const trendsQuery = useMonitoringTrends(
    scoreFilters,
    metricColumns,
    chartGranularity,
    chartsEnabled
  );
  const trendData = useMemo(() => trendsQuery.data ?? [], [trendsQuery.data]);

  const latencyQuery = useMonitoringLatencyDist(
    scoreFilters,
    20,
    distributionGroupBy,
    chartsEnabled
  );
  const latencyDist = latencyQuery.data?.success
    ? {
        histogram: latencyQuery.data.histogram,
        percentiles: latencyQuery.data.percentiles,
        byGroup: latencyQuery.data.by_group,
      }
    : null;

  const breakdownQuery = useMonitoringMetricBreakdown(
    scoreFilters,
    metricColumns,
    distributionGroupBy,
    chartsEnabled
  );
  const metricBreakdown = breakdownQuery.data ?? [];

  const chartsLoading =
    trendsQuery.isFetching || latencyQuery.isFetching || breakdownQuery.isFetching;

  // Lightweight summary KPIs (renders KPI cards before charts finish)
  const summaryQuery = useMonitoringSummary(monitoringFilters, datasetReady);

  // --------------------------------------------------------------------------
  // Alerts (threshold + anomaly)
  // --------------------------------------------------------------------------

  // Threshold alerts — in DuckDB mode, derive from summary query; in CSV mode, from scoreData
  const thresholdAlerts = useMemo(() => {
    if (datasetReady && summaryQuery.data?.success) {
      const kpis = summaryQuery.data.kpis;
      const metrics: MonitoringSummaryMetrics = {
        totalRecords: kpis.total_records,
        avgScore: kpis.avg_score,
        passRate: kpis.pass_rate,
        errorRate: 0,
        avgLatencyMs: 0,
        p50LatencyMs: kpis.p50_latency,
        p95LatencyMs: kpis.p95_latency,
        p99LatencyMs: kpis.p99_latency,
        activeAlerts: 0,
      };
      return generateThresholdAlerts(metrics, resolvedThresholds);
    }
    if (scoreData.length > 0) {
      return generateThresholdAlerts(
        computeSummaryMetrics(scoreData, metricColumns),
        resolvedThresholds
      );
    }
    return [];
  }, [datasetReady, summaryQuery.data, scoreData, metricColumns, resolvedThresholds]);

  // Anomaly alerts (from trendData)
  const anomalyAlerts = useMemo(
    () => (trendData.length > 0 ? detectAnomalies(trendData, anomalyConfig) : []),
    [trendData, anomalyConfig]
  );

  // Combine alerts and sync summary metrics to Zustand store (for cross-page consumption)
  useEffect(() => {
    // Tag each alert with the active source_name so cross-page consumers can filter
    const allAlerts = [...thresholdAlerts, ...anomalyAlerts].map((a) => ({
      ...a,
      source_name: selectedSourceName || undefined,
    }));
    setAlerts(allAlerts);

    // In DuckDB mode, derive KPIs from summary endpoint + breakdown + latency
    if (datasetReady) {
      if (summaryQuery.data?.success) {
        const kpis = summaryQuery.data.kpis;
        setSummaryMetrics({
          totalRecords: kpis.total_records,
          avgScore: kpis.avg_score,
          passRate: kpis.pass_rate,
          errorRate: 0,
          avgLatencyMs: 0,
          p50LatencyMs: kpis.p50_latency,
          p95LatencyMs: kpis.p95_latency,
          p99LatencyMs: kpis.p99_latency,
          activeAlerts: allAlerts.length,
        });
      }
    } else if (scoreData.length > 0) {
      // CSV mode: compute from client-side data
      const metrics = computeSummaryMetrics(scoreData, metricColumns);
      metrics.activeAlerts = allAlerts.length;
      setSummaryMetrics(metrics);
    } else {
      setSummaryMetrics(null);
    }
  }, [
    thresholdAlerts,
    anomalyAlerts,
    datasetReady,
    summaryQuery.data,
    scoreData,
    metricColumns,
    setSummaryMetrics,
    setAlerts,
    selectedSourceName,
  ]);

  // If no data loaded and DuckDB not ready, show empty state with upload
  if (data.length === 0 && !datasetReady) {
    return (
      <EmptyState
        isAutoConnecting={isAutoConnecting}
        autoConnectError={autoConnectError}
        onRetryAutoConnect={handleRetryAutoConnect}
      />
    );
  }

  // Build environment filter options
  const envOptions = [
    { value: '', label: 'All Environments' },
    ...availableEnvironments.map((env) => ({ value: env, label: env })),
  ];
  const componentOptions = [
    { value: '', label: 'All Components' },
    ...availableSourceComponents.map((comp) => ({ value: comp, label: comp })),
  ];
  const typeOptions = [
    { value: '', label: 'All Types' },
    ...availableSourceTypes.map((type) => ({ value: type, label: type })),
  ];

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Activity}
        title="Monitor"
        subtitle="Real-time performance monitoring and alerts"
      />
      <SourceSelector scope={['monitoring']} />
      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* Filters bar */}
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-2">
            {availableEnvironments.length > 0 && (
              <FilterDropdown
                value={selectedEnvironment}
                onChange={setSelectedEnvironment}
                options={envOptions}
              />
            )}
            {availableSourceComponents.length > 0 && (
              <FilterDropdown
                value={selectedSourceComponent}
                onChange={setSelectedSourceComponent}
                options={componentOptions}
              />
            )}
            {availableSourceTypes.length > 0 && (
              <FilterDropdown
                value={selectedSourceType}
                onChange={setSelectedSourceType}
                options={typeOptions}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <TimeRangeSelector
              timeRange={timeRange}
              onPresetChange={setTimeRangePreset}
              onCustomChange={setTimeRange}
            />
            <button
              onClick={() => {
                setSelectedEnvironment('');
                setSelectedSourceName(availableSourceNames[0] || '');
                setSelectedSourceComponent('');
                setSelectedSourceType('');
                setTimeRangePreset('24h');
              }}
              className="flex h-[34px] items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-text-muted transition-colors hover:bg-gray-50 hover:text-text-primary"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>

        {/* No data state for selected filters (skip in DuckDB mode — filtering is server-side) */}
        {filteredData.length === 0 && !datasetReady ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-white py-16">
            <Activity className="mb-4 h-12 w-12 text-text-muted" />
            <h3 className="mb-2 text-lg font-semibold text-text-primary">
              No data for selected filters
            </h3>
            <p className="text-sm text-text-muted">
              Try selecting a different agent, environment, or time range.
            </p>
          </div>
        ) : (
          <>
            {/* Metric Category Tabs */}
            <div className="mb-5">
              <MetricCategoryTabs
                activeTab={activeMetricCategoryTab}
                onTabChange={setActiveMetricCategoryTab}
                alertCount={alerts.length}
                hasClassificationMetrics={hasClassificationMetrics}
                hasAnalysisMetrics={hasAnalysisMetrics}
              />
            </div>

            {/* Tab Content */}
            {activeMetricCategoryTab === 'score' && (
              <>
                {/* KPI Cards */}
                {(() => {
                  const kpiLoading =
                    (isAutoConnecting || summaryQuery.isFetching) && !summaryMetrics;
                  return (
                    <div className="mb-5 grid grid-cols-4 gap-3">
                      <KPICard
                        label="Avg Score"
                        value={summaryMetrics?.avgScore ?? 0}
                        trend={
                          summaryMetrics && summaryMetrics.avgScore >= resolvedThresholds.good
                            ? 'Above threshold'
                            : `Below ${resolvedThresholds.good}`
                        }
                        trendUp={
                          summaryMetrics
                            ? summaryMetrics.avgScore >= resolvedThresholds.good
                            : undefined
                        }
                        icon={Activity}
                        isLoading={kpiLoading}
                      />
                      <KPICard
                        label="Pass Rate"
                        value={summaryMetrics?.passRate ?? 0}
                        trend={
                          summaryMetrics && summaryMetrics.passRate >= 70
                            ? 'Above target'
                            : 'Below 70%'
                        }
                        trendUp={summaryMetrics ? summaryMetrics.passRate >= 70 : undefined}
                        icon={Activity}
                        format="percent"
                        isLoading={kpiLoading}
                      />
                      <KPICard
                        label="P95 Latency"
                        value={summaryMetrics?.p95LatencyMs ?? 0}
                        icon={Clock}
                        format="ms"
                        isLoading={kpiLoading}
                      />
                      <KPICard
                        label="Active Alerts"
                        value={alerts.length}
                        icon={AlertCircle}
                        isLoading={kpiLoading}
                      />
                    </div>
                  );
                })()}

                {/* Row 1: Score Trend (Full Width) */}
                <div className="mb-5">
                  <div className="rounded-lg border border-border bg-white">
                    <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                      <h3 className="text-sm font-medium text-text-primary">Score Trend</h3>
                      <FilterDropdown
                        value={chartGranularity}
                        onChange={(v) => setChartGranularity(v as MonitoringChartGranularity)}
                        options={GRANULARITY_OPTIONS}
                      />
                    </div>
                    <div className="h-72 px-4 py-3">
                      {chartsLoading ? (
                        <div className="flex h-full items-center justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        </div>
                      ) : (
                        <ScoreTrendChart
                          data={trendData}
                          goodThreshold={resolvedThresholds.good}
                          passThreshold={resolvedThresholds.pass}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Row 2: Latency Distribution + Metric Pass Rates */}
                <div className="mb-5 grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-border bg-white">
                    <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                      <h3 className="text-sm font-medium text-text-primary">
                        Latency Distribution
                      </h3>
                      <FilterDropdown
                        value={distributionGroupBy ?? ''}
                        onChange={(v) => setDistributionGroupBy((v || null) as MonitoringGroupBy)}
                        options={GROUP_BY_OPTIONS}
                      />
                    </div>
                    <div className="h-64 px-4 py-3">
                      {chartsLoading ? (
                        <div className="flex h-full items-center justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        </div>
                      ) : latencyDist ? (
                        <LatencyDistributionChart
                          histogram={latencyDist.histogram}
                          percentiles={latencyDist.percentiles}
                          byGroup={latencyDist.byGroup}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-text-muted">
                          No latency data available
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-white">
                    <div className="border-b border-border px-4 py-2.5">
                      <h3 className="text-sm font-medium text-text-primary">Metric Pass Rates</h3>
                    </div>
                    <div className="h-64 px-4 py-3">
                      {chartsLoading ? (
                        <div className="flex h-full items-center justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        </div>
                      ) : metricBreakdown.length > 0 ? (
                        <MetricBreakdownChart data={metricBreakdown} />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-text-muted">
                          No metric data available
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Row 3: Top Failing LLM Outputs (Full Width) */}
                <div className="mb-5">
                  <div className="rounded-lg border border-border bg-white">
                    <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                      <h3 className="text-sm font-medium text-text-primary">Top Failing Outputs</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">Threshold:</span>
                        <FilterDropdown
                          value={String(failingThreshold)}
                          onChange={(v) => setFailingThreshold(parseFloat(v))}
                          options={THRESHOLD_OPTIONS}
                        />
                      </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {(() => {
                        // Loading state
                        if (
                          (isAutoConnecting || chartsLoading || failingLoading) &&
                          scoreData.length === 0 &&
                          serverFailingOutputs.length === 0
                        ) {
                          return (
                            <div className="flex h-40 items-center justify-center">
                              <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            </div>
                          );
                        }

                        const failingOutputs: {
                          metric: string;
                          metricColumn: string;
                          score: number;
                          input: string;
                          output: string;
                          record: MonitoringRecord;
                        }[] = [];

                        // Use server data in DuckDB mode, client data otherwise
                        const sourceData =
                          useServerFailing && serverFailingOutputs.length > 0
                            ? serverFailingOutputs
                            : scoreData;

                        const isLongFormat =
                          sourceData.length > 0 &&
                          'metric_name' in sourceData[0] &&
                          'metric_score' in sourceData[0];

                        sourceData.forEach((record) => {
                          if (isLongFormat) {
                            const value = record.metric_score;
                            if (typeof value === 'number' && value < failingThreshold) {
                              failingOutputs.push({
                                metric: String(record.metric_name || 'Unknown'),
                                metricColumn: 'metric_score',
                                score: value,
                                input: String(record.query || '').slice(0, 200),
                                output: String(record.actual_output || '').slice(0, 200),
                                record,
                              });
                            }
                          } else {
                            metricColumns.forEach((col) => {
                              const value = record[col];
                              if (typeof value === 'number' && value < failingThreshold) {
                                failingOutputs.push({
                                  metric: col.replace(/_score$/, ''),
                                  metricColumn: col,
                                  score: value,
                                  input: String(record.query || '').slice(0, 200),
                                  output: String(record.actual_output || '').slice(0, 200),
                                  record,
                                });
                              }
                            });
                          }
                        });

                        const topFailing = failingOutputs
                          .sort((a, b) => a.score - b.score)
                          .slice(0, 15);

                        if (topFailing.length === 0) {
                          return (
                            <div className="flex h-40 items-center justify-center text-sm text-text-muted">
                              No outputs below threshold ({failingThreshold})
                            </div>
                          );
                        }

                        return (
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-gray-50/80">
                              <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wider text-text-muted">
                                <th className="w-28 px-3 py-2">Metric</th>
                                <th className="w-28 px-3 py-2">Trace ID</th>
                                <th className="px-3 py-2">Timestamp</th>
                                <th className="px-3 py-2">Input</th>
                                <th className="px-3 py-2">LLM Output</th>
                                <th className="w-16 px-3 py-2 text-center">Details</th>
                              </tr>
                            </thead>
                            <tbody>
                              {topFailing.map((item, idx) => (
                                <tr
                                  key={`${item.record.dataset_id}-${item.metricColumn}-${idx}`}
                                  className="border-b border-border last:border-0 hover:bg-gray-50"
                                >
                                  <td className="px-3 py-2 align-top">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={cn(
                                          'inline-block h-2 w-2 flex-shrink-0 rounded-full',
                                          item.score < failingThreshold * 0.5
                                            ? 'bg-error'
                                            : 'bg-warning'
                                        )}
                                      />
                                      <span className="font-medium">{item.metric}</span>
                                    </div>
                                    <span className="ml-4 text-xs text-text-muted">
                                      {item.score.toFixed(3)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 align-top">
                                    {item.record.trace_id ? (
                                      <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-primary">
                                        {item.record.trace_id.slice(0, 8)}...
                                      </code>
                                    ) : (
                                      <span className="text-xs text-text-muted">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 align-top font-mono text-xs text-text-muted">
                                    {item.record.timestamp
                                      ? new Date(item.record.timestamp).toLocaleString()
                                      : '-'}
                                  </td>
                                  <td className="max-w-xs px-3 py-2 align-top">
                                    <p className="line-clamp-2 text-xs text-text-secondary">
                                      {item.input || '-'}
                                    </p>
                                  </td>
                                  <td className="max-w-xs px-3 py-2 align-top">
                                    <p className="line-clamp-2 text-xs text-text-secondary">
                                      {item.output || '-'}
                                    </p>
                                  </td>
                                  <td className="px-3 py-2 text-center align-top">
                                    <button
                                      onClick={() =>
                                        setSelectedFailingOutput({
                                          record: item.record,
                                          metric: item.metric,
                                          score: item.score,
                                        })
                                      }
                                      className="rounded p-1.5 text-text-muted hover:bg-gray-100 hover:text-text-primary"
                                      title="View details"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Section Divider */}
                <div className="relative mb-5 mt-8">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-background px-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                      All Traces
                    </span>
                  </div>
                </div>

                {/* Row 4: Evaluation Traces Table */}
                <div className="mb-5">
                  <div className="rounded-lg border border-border bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                      <h3 className="text-sm font-medium text-text-primary">
                        Evaluation Traces
                        <span className="ml-2 font-normal text-text-muted">
                          (
                          {useServerData
                            ? `${serverTraceTotal} records`
                            : filteredTraces.length === scoreData.length
                              ? `${scoreData.length} records`
                              : `${filteredTraces.length} of ${scoreData.length}`}
                          )
                        </span>
                      </h3>
                      <div className="flex items-center gap-2">
                        {/* Search */}
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
                          <input
                            type="text"
                            value={traceSearchInput}
                            onChange={(e) => setTraceSearchInput(e.target.value)}
                            placeholder="Search traces..."
                            className="h-[30px] w-48 rounded-md border border-border bg-white pl-7 pr-2 text-xs text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                          />
                        </div>
                        {/* Metric filter */}
                        {traceMetricOptions.length > 2 && (
                          <FilterDropdown
                            value={traceMetricFilter}
                            onChange={setTraceMetricFilter}
                            options={traceMetricOptions}
                          />
                        )}
                        {/* Sort toggle */}
                        <button
                          onClick={() =>
                            setTraceSortField((f) => (f === 'timestamp' ? 'score' : 'timestamp'))
                          }
                          className={cn(
                            'flex h-[30px] items-center gap-1 rounded-md border border-border px-2 text-xs font-medium transition-colors hover:bg-gray-50',
                            'text-text-secondary'
                          )}
                          title={`Sort by ${traceSortField === 'timestamp' ? 'Score' : 'Timestamp'}`}
                        >
                          <ArrowUpDown className="h-3.5 w-3.5 text-text-muted" />
                          {traceSortField === 'timestamp' ? 'Recent' : 'Score'}
                        </button>
                        {/* Sort direction */}
                        <button
                          onClick={() =>
                            setTraceSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
                          }
                          className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:bg-gray-50 hover:text-text-primary"
                          title={traceSortDirection === 'asc' ? 'Ascending' : 'Descending'}
                        >
                          {traceSortDirection === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {/* Pagination */}
                        {(() => {
                          const totalItems = useServerData
                            ? serverTraceTotal
                            : filteredTraces.length;
                          const totalPages = Math.max(1, Math.ceil(totalItems / tablePageSize));
                          return (
                            <div className="flex items-center gap-1 text-xs text-text-muted">
                              <span>
                                {tablePage}/{totalPages}
                              </span>
                              <button
                                onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                                disabled={tablePage <= 1}
                                className="rounded p-1 hover:bg-gray-100 disabled:opacity-30"
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                                disabled={tablePage >= totalPages}
                                className="rounded p-1 hover:bg-gray-100 disabled:opacity-30"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-gray-50/50 text-left text-[11px] font-medium uppercase tracking-wider text-text-muted">
                            <th className="px-3 py-2">Trace ID</th>
                            <th
                              className="cursor-pointer select-none px-3 py-2 hover:text-text-primary"
                              onClick={() => {
                                if (traceSortField === 'timestamp') {
                                  setTraceSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
                                } else {
                                  setTraceSortField('timestamp');
                                  setTraceSortDirection('desc');
                                }
                              }}
                            >
                              <span className="inline-flex items-center gap-1">
                                Timestamp
                                {traceSortField === 'timestamp' &&
                                  (traceSortDirection === 'asc' ? (
                                    <ArrowUp className="h-3 w-3" />
                                  ) : (
                                    <ArrowDown className="h-3 w-3" />
                                  ))}
                              </span>
                            </th>
                            <th className="px-3 py-2">Model</th>
                            <th className="px-3 py-2">Env</th>
                            <th className="px-3 py-2">Latency</th>
                            {metricColumns.includes('metric_score') ? (
                              <>
                                <th className="px-3 py-2">Metric</th>
                                <th
                                  className="cursor-pointer select-none px-3 py-2 hover:text-text-primary"
                                  onClick={() => {
                                    if (traceSortField === 'score') {
                                      setTraceSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
                                    } else {
                                      setTraceSortField('score');
                                      setTraceSortDirection('desc');
                                    }
                                  }}
                                >
                                  <span className="inline-flex items-center gap-1">
                                    Score
                                    {traceSortField === 'score' &&
                                      (traceSortDirection === 'asc' ? (
                                        <ArrowUp className="h-3 w-3" />
                                      ) : (
                                        <ArrowDown className="h-3 w-3" />
                                      ))}
                                  </span>
                                </th>
                              </>
                            ) : (
                              metricColumns.slice(0, 3).map((col, i) => (
                                <th
                                  key={col}
                                  className={cn(
                                    'px-3 py-2',
                                    i === 0 && 'cursor-pointer select-none hover:text-text-primary'
                                  )}
                                  onClick={
                                    i === 0
                                      ? () => {
                                          if (traceSortField === 'score') {
                                            setTraceSortDirection((d) =>
                                              d === 'asc' ? 'desc' : 'asc'
                                            );
                                          } else {
                                            setTraceSortField('score');
                                            setTraceSortDirection('desc');
                                          }
                                        }
                                      : undefined
                                  }
                                >
                                  <span className="inline-flex items-center gap-1">
                                    {col.replace(/_score$/, '')}
                                    {i === 0 &&
                                      traceSortField === 'score' &&
                                      (traceSortDirection === 'asc' ? (
                                        <ArrowUp className="h-3 w-3" />
                                      ) : (
                                        <ArrowDown className="h-3 w-3" />
                                      ))}
                                  </span>
                                </th>
                              ))
                            )}
                            <th className="px-3 py-2 text-center">Details</th>
                          </tr>
                        </thead>
                        <tbody className={tracesLoading && useServerData ? 'opacity-50' : ''}>
                          {(useServerData
                            ? serverTraces
                            : filteredTraces.slice(
                                (tablePage - 1) * tablePageSize,
                                tablePage * tablePageSize
                              )
                          ).map((record, idx) => (
                            <tr
                              key={`${record.dataset_id}-${idx}`}
                              className="border-b border-border last:border-0 hover:bg-gray-50"
                            >
                              <td className="px-3 py-2">
                                {record.trace_id ? (
                                  <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-primary">
                                    {record.trace_id.slice(0, 8)}...
                                  </code>
                                ) : (
                                  <span className="text-xs text-text-muted">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-mono text-xs text-text-muted">
                                {record.timestamp
                                  ? new Date(record.timestamp).toLocaleString()
                                  : '-'}
                              </td>
                              <td className="px-3 py-2">{record.model_name || '-'}</td>
                              <td className="px-3 py-2">
                                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
                                  {record.environment || '-'}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-mono">
                                {record.latency ? `${record.latency.toFixed(1)}s` : '-'}
                              </td>
                              {metricColumns.includes('metric_score') ? (
                                <>
                                  <td className="px-3 py-2">
                                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-text-secondary">
                                      {String(record.metric_name || '-')}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2">
                                    {typeof record.metric_score === 'number' ? (
                                      <span
                                        className={cn(
                                          'font-mono',
                                          record.metric_score >= 0.7
                                            ? 'text-success'
                                            : record.metric_score >= 0.5
                                              ? 'text-warning'
                                              : 'text-error'
                                        )}
                                      >
                                        {record.metric_score.toFixed(3)}
                                      </span>
                                    ) : (
                                      '-'
                                    )}
                                  </td>
                                </>
                              ) : (
                                metricColumns.slice(0, 3).map((col) => {
                                  const value = record[col];
                                  const numValue = typeof value === 'number' ? value : null;
                                  return (
                                    <td key={col} className="px-3 py-2">
                                      {numValue !== null ? (
                                        <span
                                          className={cn(
                                            'font-mono',
                                            numValue >= 0.7
                                              ? 'text-success'
                                              : numValue >= 0.5
                                                ? 'text-warning'
                                                : 'text-error'
                                          )}
                                        >
                                          {numValue.toFixed(3)}
                                        </span>
                                      ) : (
                                        '-'
                                      )}
                                    </td>
                                  );
                                })
                              )}
                              <td className="px-3 py-2 text-center">
                                <button
                                  onClick={() => setSelectedRecord(record)}
                                  className="rounded p-1 text-text-muted hover:bg-gray-100 hover:text-text-primary"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(useServerData
                        ? serverTraces.length === 0
                        : filteredTraces.length === 0) && (
                        <div className="py-8 text-center text-text-muted">
                          {(isAutoConnecting || chartsLoading || tracesLoading) &&
                          scoreData.length === 0 &&
                          serverTraces.length === 0 ? (
                            <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                          ) : scoreData.length === 0 && serverTraceTotal === 0 ? (
                            'No records to display'
                          ) : (
                            'No traces match your search or filters'
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Record Detail Modal (reuses FailingOutputDetailModal) */}
                {selectedRecord && (
                  <FailingOutputDetailModal
                    record={selectedRecord}
                    metricName={
                      metricColumns.includes('metric_score')
                        ? String(selectedRecord.metric_name || 'metric')
                        : metricColumns[0] || 'metric'
                    }
                    metricScore={
                      metricColumns.includes('metric_score')
                        ? typeof selectedRecord.metric_score === 'number'
                          ? selectedRecord.metric_score
                          : 0
                        : typeof selectedRecord[metricColumns[0]] === 'number'
                          ? (selectedRecord[metricColumns[0]] as number)
                          : 0
                    }
                    onClose={() => setSelectedRecord(null)}
                  />
                )}

                {/* Failing Output Detail Modal */}
                {selectedFailingOutput && (
                  <FailingOutputDetailModal
                    record={selectedFailingOutput.record}
                    metricName={selectedFailingOutput.metric}
                    metricScore={selectedFailingOutput.score}
                    onClose={() => setSelectedFailingOutput(null)}
                  />
                )}
              </>
            )}

            {/* Classification Metrics Tab */}
            {activeMetricCategoryTab === 'classification' && (
              <ClassificationMetricsTab
                data={classificationData}
                filters={{ ...monitoringFilters, metric_category: 'CLASSIFICATION' }}
                chartGranularity={chartGranularity}
              />
            )}

            {/* Analysis Insights Tab */}
            {activeMetricCategoryTab === 'analysis' && (
              <AnalysisInsightsTab
                data={analysisData}
                filters={{ ...monitoringFilters, metric_category: 'ANALYSIS' }}
                selectedMetric={selectedAnalysisMetric}
                onMetricChange={setSelectedAnalysisMetric}
                page={analysisInsightsPage}
                onPageChange={setAnalysisInsightsPage}
              />
            )}

            {/* Alerts Tab */}
            {activeMetricCategoryTab === 'alerts' && <AlertsTab alerts={alerts} />}
          </>
        )}
      </div>
    </div>
  );
}
