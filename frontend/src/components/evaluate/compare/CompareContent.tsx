'use client';

import {
  Search,
  LayoutGrid,
  Columns as ColumnsIcon,
  BarChart2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import { useDataStore, useUIStore } from '@/stores';
import { Columns } from '@/types';

import {
  ModelDistributionChart,
  ModelRadarChart,
  ModelBarChart,
  ModelScatterChart,
  WinLossChart,
  ModelAgreementChart,
} from './charts';
import { ComparisonTable } from './ComparisonTable';
import { ExportCSV } from './ExportCSV';
import { FieldVisibilitySelector } from './FieldVisibilitySelector';
import { MetadataFilters } from './MetadataFilters';
import { MetricSelector } from './MetricSelector';
import { PageSizeSelector } from './PageSizeSelector';
import { PerformanceKPIs } from './PerformanceKPIs';
import { PerformanceSummary } from './PerformanceSummary';
import { QuickFilters } from './QuickFilters';
import { SideBySideTable } from './SideBySideTable';
import { TestCaseDetailModal } from './TestCaseDetailModal';
import { TextModeToggle } from './TextModeToggle';

import type { ComparisonRow, EvaluationRecord, CompareChartType } from '@/types';

const CHART_TABS: Array<{ id: CompareChartType; label: string; description: string }> = [
  { id: 'distribution', label: 'Distribution', description: 'Score distributions by experiment' },
  { id: 'radar', label: 'Radar', description: 'Multi-metric comparison' },
  { id: 'bar', label: 'Bar', description: 'Mean scores by metric' },
  { id: 'scatter', label: 'Scatter', description: 'Metric tradeoffs' },
  { id: 'winloss', label: 'Win/Loss', description: 'Head-to-head comparison' },
  { id: 'agreement', label: 'Agreement', description: 'Model agreement analysis' },
];

// Helper to convert Python-like string to JSON
// Handles single quotes, None, True, False, escaped quotes, and apostrophes within strings.
function pythonToJson(pythonStr: string): string {
  let result = '';
  let i = 0;
  let inString = false;
  let stringChar = '';

  while (i < pythonStr.length) {
    const char = pythonStr[i];
    const nextChar = i < pythonStr.length - 1 ? pythonStr[i + 1] : '';

    // Check for string start/end
    if ((char === "'" || char === '"') && !inString) {
      inString = true;
      stringChar = char;
      result += '"'; // Always use double quotes in JSON
      i++;
      continue;
    }

    // Inside a string
    if (inString) {
      // Handle escape sequences
      if (char === '\\') {
        if (nextChar === stringChar) {
          // Escaped quote (e.g., \' inside '...' or \" inside "...")
          // In JSON, single quotes don't need escaping, double quotes do
          if (stringChar === "'") {
            // Python \' -> JSON ' (no escaping needed)
            result += "'";
          } else {
            // Python \" -> JSON \"
            result += '\\"';
          }
          i += 2; // Skip both backslash and quote
          continue;
        } else if (nextChar === '\\') {
          // Escaped backslash
          result += '\\\\';
          i += 2;
          continue;
        } else if (nextChar === 'n') {
          result += '\\n';
          i += 2;
          continue;
        } else if (nextChar === 'r') {
          result += '\\r';
          i += 2;
          continue;
        } else if (nextChar === 't') {
          result += '\\t';
          i += 2;
          continue;
        } else {
          // Unknown escape, keep the backslash
          result += '\\';
          i++;
          continue;
        }
      }

      // Check for end of string
      if (char === stringChar) {
        inString = false;
        stringChar = '';
        result += '"';
        i++;
        continue;
      }

      // Handle characters that need escaping in JSON
      if (char === '"') {
        result += '\\"';
      } else if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        result += '\\r';
      } else if (char === '\t') {
        result += '\\t';
      } else {
        result += char;
      }
      i++;
      continue;
    }

    // Outside strings, handle Python keywords
    if (pythonStr.slice(i, i + 4) === 'None') {
      result += 'null';
      i += 4;
      continue;
    }
    if (pythonStr.slice(i, i + 4) === 'True') {
      result += 'true';
      i += 4;
      continue;
    }
    if (pythonStr.slice(i, i + 5) === 'False') {
      result += 'false';
      i += 5;
      continue;
    }
    // Handle nan/NaN (Python float nan)
    if (
      pythonStr.slice(i, i + 3).toLowerCase() === 'nan' &&
      (i === 0 || /[\s,:\[\{(]/.test(pythonStr[i - 1])) &&
      (i + 3 >= pythonStr.length || /[\s,:\]\})]/.test(pythonStr[i + 3]))
    ) {
      result += 'null';
      i += 3;
      continue;
    }

    result += char;
    i++;
  }

  return result;
}

// Extract metadata from row
function extractMetadata(row: EvaluationRecord): Record<string, unknown> {
  const raw = row[Columns.METADATA];
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      try {
        return JSON.parse(pythonToJson(raw));
      } catch {
        return {};
      }
    }
  }
  return {};
}

type TableViewMode = 'side-by-side' | 'classic';

export function CompareContent() {
  const { data, metricColumns, format } = useDataStore();
  const {
    compareSearchQuery,
    setCompareSearchQuery,
    compareQuickFilter,
    testCaseDetailModalOpen,
    compareSelectedMetrics,
    setCompareSelectedMetrics,
    compareMetadataFilters,
    // Chart state
    compareShowCharts,
    toggleCompareShowCharts,
    compareChartType,
    setCompareChartType,
    compareDistributionMetric,
    setCompareDistributionMetric,
    compareDistributionChartType,
    setCompareDistributionChartType,
    compareScatterXMetric,
    setCompareScatterXMetric,
    compareScatterYMetric,
    setCompareScatterYMetric,
    compareShowTrendline,
    setCompareShowTrendline,
    compareAgreementThreshold,
    setCompareAgreementThreshold,
  } = useUIStore();

  const [viewMode, setViewMode] = useState<TableViewMode>('side-by-side');

  // Get available metrics
  const availableMetrics = useMemo(() => {
    if (!data || data.length === 0) return [];

    if (format === 'tree_format' || format === 'flat_format') {
      const metrics = new Set<string>();
      data.forEach((row) => {
        const metricName = row[Columns.METRIC_NAME] as string;
        if (metricName) metrics.add(metricName);
      });
      return Array.from(metrics);
    }

    return metricColumns;
  }, [data, metricColumns, format]);

  // Build comparison rows
  const comparisonRows = useMemo((): ComparisonRow[] => {
    if (!data || data.length === 0) return [];

    const rows: ComparisonRow[] = [];

    if (format === 'tree_format' || format === 'flat_format') {
      // Group by test case ID + experiment name to support multiple experiments
      const testCases = new Map<
        string,
        {
          id: string;
          query: string;
          actualOutput: string;
          expectedOutput?: string;
          experimentName?: string;
          additionalInput?: string;
          additionalOutput?: string;
          conversation?: string;
          retrievedContent?: string;
          metrics: Record<string, number>;
          metadata?: Record<string, unknown>;
        }
      >();

      data.forEach((row) => {
        const id = row[Columns.DATASET_ID] as string;
        if (!id) return;

        const experimentName = (row[Columns.EXPERIMENT_NAME] as string) || 'Default';
        // Create composite key: id + experimentName to distinguish same test case across experiments
        const compositeKey = `${id}::${experimentName}`;

        if (!testCases.has(compositeKey)) {
          testCases.set(compositeKey, {
            id,
            query: (row[Columns.QUERY] as string) || '',
            actualOutput: (row[Columns.ACTUAL_OUTPUT] as string) || '',
            expectedOutput: row[Columns.EXPECTED_OUTPUT] as string | undefined,
            experimentName,
            additionalInput: row[Columns.ADDITIONAL_INPUT] as string | undefined,
            additionalOutput: row[Columns.ADDITIONAL_OUTPUT] as string | undefined,
            conversation: row[Columns.CONVERSATION] as string | undefined,
            retrievedContent: row[Columns.RETRIEVED_CONTENT] as string | undefined,
            metrics: {},
            metadata: extractMetadata(row),
          });
        }

        const metricName = row[Columns.METRIC_NAME] as string;
        const score = row[Columns.METRIC_SCORE] as number;

        if (metricName && typeof score === 'number') {
          testCases.get(compositeKey)!.metrics[metricName] = score;
        }
      });

      testCases.forEach((tc) => {
        const scores = Object.values(tc.metrics);
        const overallScore =
          scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

        rows.push({
          id: tc.id,
          query: tc.query,
          actualOutput: tc.actualOutput,
          expectedOutput: tc.expectedOutput,
          experimentName: tc.experimentName,
          additionalInput: tc.additionalInput,
          additionalOutput: tc.additionalOutput,
          conversation: tc.conversation,
          retrievedContent: tc.retrievedContent,
          metrics: tc.metrics,
          overallScore,
          metadata: tc.metadata,
        });
      });
    } else {
      // Simple format - each row is a test case
      data.forEach((row, idx) => {
        const id = (row[Columns.DATASET_ID] as string) || `row_${idx}`;
        const metrics: Record<string, number> = {};

        metricColumns.forEach((col) => {
          const val = row[col] as number;
          if (typeof val === 'number') {
            metrics[col] = val;
          }
        });

        const scores = Object.values(metrics);
        const overallScore =
          scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

        rows.push({
          id,
          query: (row[Columns.QUERY] as string) || '',
          actualOutput: (row[Columns.ACTUAL_OUTPUT] as string) || '',
          expectedOutput: row[Columns.EXPECTED_OUTPUT] as string | undefined,
          experimentName: row[Columns.EXPERIMENT_NAME] as string | undefined,
          additionalInput: row[Columns.ADDITIONAL_INPUT] as string | undefined,
          additionalOutput: row[Columns.ADDITIONAL_OUTPUT] as string | undefined,
          conversation: row[Columns.CONVERSATION] as string | undefined,
          retrievedContent: row[Columns.RETRIEVED_CONTENT] as string | undefined,
          metrics,
          overallScore,
          metadata: extractMetadata(row),
        });
      });
    }

    return rows;
  }, [data, format, metricColumns]);

  // Get display metrics (filtered by selection)
  const displayMetrics = useMemo(() => {
    if (compareSelectedMetrics.length === 0) return availableMetrics;
    return availableMetrics.filter((m) => compareSelectedMetrics.includes(m));
  }, [availableMetrics, compareSelectedMetrics]);

  // Apply filters
  const filteredRows = useMemo(() => {
    let rows = comparisonRows;

    // Apply metadata filters
    const activeMetadataFilters = Object.entries(compareMetadataFilters).filter(
      ([, values]) => values.length > 0
    );
    if (activeMetadataFilters.length > 0) {
      rows = rows.filter((row) => {
        if (!row.metadata) return false;
        return activeMetadataFilters.every(([key, allowedValues]) => {
          const value = row.metadata?.[key];
          const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
          return allowedValues.includes(strValue);
        });
      });
    }

    // Apply quick filter
    if (compareQuickFilter === 'top20') {
      const sorted = [...rows].sort((a, b) => b.overallScore - a.overallScore);
      const cutoff = Math.ceil(sorted.length * 0.2);
      rows = sorted.slice(0, cutoff);
    } else if (compareQuickFilter === 'bottom20') {
      const sorted = [...rows].sort((a, b) => a.overallScore - b.overallScore);
      const cutoff = Math.ceil(sorted.length * 0.2);
      rows = sorted.slice(0, cutoff);
    } else if (compareQuickFilter === 'highVariance') {
      rows = rows.filter((row) => {
        const scores = Object.values(row.metrics);
        if (scores.length < 2) return false;
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
        return variance > 0.05; // High variance threshold
      });
    } else if (compareQuickFilter === 'showDiff') {
      // Group by test case ID to find rows with same ID but different experiments
      const groups = new Map<string, ComparisonRow[]>();
      rows.forEach((r) => {
        if (!groups.has(r.id)) groups.set(r.id, []);
        groups.get(r.id)!.push(r);
      });

      rows = rows.filter((row) => {
        const group = groups.get(row.id) || [];
        if (group.length < 2) return false;
        const scores = group.map((r) => r.overallScore);
        return Math.max(...scores) - Math.min(...scores) > 0.2; // 20% difference threshold
      });
    }

    // Apply search filter
    if (compareSearchQuery.trim()) {
      const query = compareSearchQuery.toLowerCase();
      rows = rows.filter(
        (row) =>
          row.id.toLowerCase().includes(query) ||
          row.query.toLowerCase().includes(query) ||
          row.actualOutput.toLowerCase().includes(query)
      );
    }

    return rows;
  }, [comparisonRows, compareQuickFilter, compareSearchQuery, compareMetadataFilters]);

  // Count unique experiments
  const experimentCount = useMemo(() => {
    const experiments = new Set(filteredRows.map((r) => r.experimentName || 'Default'));
    return experiments.size;
  }, [filteredRows]);

  // Count unique test case IDs
  const uniqueTestCaseCount = useMemo(() => {
    const ids = new Set(filteredRows.map((r) => r.id));
    return ids.size;
  }, [filteredRows]);

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-text-muted">
        No data available. Upload evaluation data to compare test cases.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Performance KPIs */}
      <PerformanceKPIs rows={filteredRows} totalRows={comparisonRows.length} />

      {/* Metadata Filters */}
      <MetadataFilters rows={comparisonRows} />

      {/* Performance Summary (Collapsible) */}
      <PerformanceSummary rows={filteredRows} />

      {/* Charts Section */}
      <div className="border-border/50 overflow-hidden rounded-xl border bg-white shadow-sm">
        {/* Charts Header with Toggle */}
        <button
          onClick={toggleCompareShowCharts}
          className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <BarChart2 className="h-5 w-5 text-primary" />
            <span className="font-semibold text-text-primary">Comparison Charts</span>
            <span className="text-sm text-text-muted">
              Visual analysis across {experimentCount} experiment{experimentCount !== 1 ? 's' : ''}
            </span>
          </div>
          {compareShowCharts ? (
            <ChevronUp className="h-5 w-5 text-text-muted" />
          ) : (
            <ChevronDown className="h-5 w-5 text-text-muted" />
          )}
        </button>

        {/* Charts Content */}
        {compareShowCharts && (
          <div className="space-y-4 px-5 pb-5">
            {/* Chart Type Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1">
              {CHART_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setCompareChartType(tab.id)}
                  title={tab.description}
                  className={cn(
                    'whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all',
                    compareChartType === tab.id
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-text-muted hover:bg-white/50 hover:text-text-primary'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Chart Content */}
            <div className="min-h-[450px]">
              {compareChartType === 'distribution' && (
                <ModelDistributionChart
                  rows={filteredRows}
                  selectedMetric={compareDistributionMetric}
                  chartType={compareDistributionChartType}
                  onMetricChange={setCompareDistributionMetric}
                  onChartTypeChange={setCompareDistributionChartType}
                />
              )}
              {compareChartType === 'radar' && (
                <ModelRadarChart
                  rows={filteredRows}
                  selectedMetrics={compareSelectedMetrics}
                  onMetricsChange={setCompareSelectedMetrics}
                />
              )}
              {compareChartType === 'bar' && (
                <ModelBarChart
                  rows={filteredRows}
                  selectedMetrics={compareSelectedMetrics}
                  onMetricsChange={setCompareSelectedMetrics}
                />
              )}
              {compareChartType === 'scatter' && (
                <ModelScatterChart
                  rows={filteredRows}
                  xMetric={compareScatterXMetric}
                  yMetric={compareScatterYMetric}
                  showTrendline={compareShowTrendline}
                  onXMetricChange={setCompareScatterXMetric}
                  onYMetricChange={setCompareScatterYMetric}
                  onTrendlineChange={setCompareShowTrendline}
                />
              )}
              {compareChartType === 'winloss' && <WinLossChart rows={filteredRows} />}
              {compareChartType === 'agreement' && (
                <ModelAgreementChart
                  rows={filteredRows}
                  threshold={compareAgreementThreshold}
                  onThresholdChange={setCompareAgreementThreshold}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left side: Search and Quick Filters */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search by ID, query, or response..."
              value={compareSearchQuery}
              onChange={(e) => setCompareSearchQuery(e.target.value)}
              className="w-64 rounded-lg border border-border py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Quick Filters */}
          <QuickFilters />
        </div>

        {/* Right side: Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-0.5">
            <button
              onClick={() => setViewMode('side-by-side')}
              title="Side-by-side comparison view"
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-all',
                viewMode === 'side-by-side'
                  ? 'bg-white text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              )}
            >
              <ColumnsIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Side-by-Side</span>
            </button>
            <button
              onClick={() => setViewMode('classic')}
              title="Classic table view"
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-all',
                viewMode === 'classic'
                  ? 'bg-white text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Classic</span>
            </button>
          </div>

          <MetricSelector availableMetrics={availableMetrics} />
          <FieldVisibilitySelector />
          {viewMode === 'classic' && <TextModeToggle />}
          <PageSizeSelector />
          <ExportCSV rows={filteredRows} metrics={displayMetrics} />
        </div>
      </div>

      {/* Results Summary */}
      <div className="flex items-center justify-between text-sm text-text-muted">
        <span>
          Showing {uniqueTestCaseCount} test cases ({filteredRows.length} rows) from{' '}
          {experimentCount} experiment{experimentCount !== 1 ? 's' : ''}
        </span>
        <span>
          {displayMetrics.length} of {availableMetrics.length} metrics
        </span>
      </div>

      {/* Comparison Table */}
      {viewMode === 'side-by-side' ? (
        <SideBySideTable rows={filteredRows} metrics={displayMetrics} />
      ) : (
        <ComparisonTable rows={filteredRows} metrics={displayMetrics} />
      )}

      {/* Detail Modal */}
      {testCaseDetailModalOpen && (
        <TestCaseDetailModal rows={comparisonRows} metrics={displayMetrics} />
      )}
    </div>
  );
}
