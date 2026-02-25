'use client';

import {
  GitCompare,
  BarChart2,
  ChevronDown,
  ChevronUp,
  Upload,
  Layers,
  Table2,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { CaseDiffView } from '@/components/evaluate/compare/CaseDiffView';
import {
  ModelDistributionChart,
  ModelRadarChart,
  ModelBarChart,
} from '@/components/evaluate/compare/charts';
import { WinLossChart } from '@/components/evaluate/compare/charts/WinLossChart';
import { CompareContent } from '@/components/evaluate/compare/CompareContent';
import { ExperimentSelector } from '@/components/evaluate/compare/ExperimentSelector';
import { ExportComparisonReport } from '@/components/evaluate/compare/ExportComparisonReport';
import { HeadToHeadSummary } from '@/components/evaluate/compare/HeadToHeadSummary';
import { EmptyState } from '@/components/shared/EmptyState';
import { cn } from '@/lib/utils';
import { useDataStore, useUIStore } from '@/stores';
import { Columns, type ComparisonRow } from '@/types';

type CompareViewMode = 'experiments' | 'testcases';

// Helper to convert Python-like string to JSON
function pythonToJson(pythonStr: string): string {
  let result = '';
  let i = 0;
  let inString = false;
  let stringChar = '';

  while (i < pythonStr.length) {
    const char = pythonStr[i];
    const nextChar = i < pythonStr.length - 1 ? pythonStr[i + 1] : '';

    if ((char === "'" || char === '"') && !inString) {
      inString = true;
      stringChar = char;
      result += '"';
      i++;
      continue;
    }

    if (inString) {
      if (char === '\\') {
        if (nextChar === stringChar) {
          if (stringChar === "'") {
            result += "'";
          } else {
            result += '\\"';
          }
          i += 2;
          continue;
        } else if (nextChar === '\\') {
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
          result += '\\';
          i++;
          continue;
        }
      }

      if (char === stringChar) {
        inString = false;
        stringChar = '';
        result += '"';
        i++;
        continue;
      }

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
function extractMetadata(row: Record<string, unknown>): Record<string, unknown> {
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

export default function ComparePage() {
  const { data, format, metricColumns, isLoading } = useDataStore();
  const {
    compareBaselineExperiment,
    compareChallengerExperiment,
    compareDistributionMetric,
    setCompareDistributionMetric,
    compareDistributionChartType,
    setCompareDistributionChartType,
    compareSelectedMetrics,
    setCompareSelectedMetrics,
  } = useUIStore();

  const [viewMode, setViewMode] = useState<CompareViewMode>('testcases');
  const [showCharts, setShowCharts] = useState(true);
  const [activeChart, setActiveChart] = useState<'distribution' | 'radar' | 'bar' | 'winloss'>(
    'winloss'
  );

  // Build comparison rows from data
  const comparisonRows = useMemo((): ComparisonRow[] => {
    if (!data || data.length === 0) return [];

    const rows: ComparisonRow[] = [];

    if (format === 'tree_format' || format === 'flat_format') {
      const testCases = new Map<
        string,
        {
          id: string;
          query: string;
          actualOutput: string;
          expectedOutput?: string;
          experimentName?: string;
          metrics: Record<string, number>;
          metadata?: Record<string, unknown>;
        }
      >();

      data.forEach((row) => {
        const id = row[Columns.DATASET_ID] as string;
        if (!id) return;

        const experimentName = (row[Columns.EXPERIMENT_NAME] as string) || 'Default';
        const compositeKey = `${id}::${experimentName}`;

        if (!testCases.has(compositeKey)) {
          testCases.set(compositeKey, {
            id,
            query: (row[Columns.QUERY] as string) || '',
            actualOutput: (row[Columns.ACTUAL_OUTPUT] as string) || '',
            expectedOutput: row[Columns.EXPECTED_OUTPUT] as string | undefined,
            experimentName,
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
          metrics: tc.metrics,
          overallScore,
          metadata: tc.metadata,
        });
      });
    } else {
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
          metrics,
          overallScore,
          metadata: extractMetadata(row),
        });
      });
    }

    return rows;
  }, [data, format, metricColumns]);

  // Get unique experiments
  const experiments = useMemo(() => {
    const experimentSet = new Set<string>();
    comparisonRows.forEach((row) => {
      const exp = row.experimentName || 'Default';
      experimentSet.add(exp);
    });
    return Array.from(experimentSet).sort();
  }, [comparisonRows]);

  // Filter rows for selected experiments
  const filteredRows = useMemo(() => {
    if (!compareBaselineExperiment || !compareChallengerExperiment) {
      return comparisonRows;
    }
    return comparisonRows.filter((r) => {
      const exp = r.experimentName || 'Default';
      return exp === compareBaselineExperiment || exp === compareChallengerExperiment;
    });
  }, [comparisonRows, compareBaselineExperiment, compareChallengerExperiment]);

  const isComparisonReady = compareBaselineExperiment && compareChallengerExperiment;
  const hasData = data.length > 0;

  if (!hasData) {
    if (isLoading) {
      return (
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      );
    }

    return (
      <EmptyState
        icon={Upload}
        title="No data loaded"
        description="Upload evaluation data to compare test cases"
        action={{ label: 'Go to Upload', href: '/evaluate/upload' }}
      />
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
            <GitCompare className="h-5 w-5 text-slate-500" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-text-primary">Compare</h2>
            <p className="text-sm text-text-muted">Analyze and compare evaluation results</p>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setViewMode('testcases')}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
              viewMode === 'testcases'
                ? 'bg-white text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            )}
          >
            <Table2 className="h-4 w-4" />
            Test Cases
          </button>
          <button
            onClick={() => setViewMode('experiments')}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
              viewMode === 'experiments'
                ? 'bg-white text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            )}
          >
            <Layers className="h-4 w-4" />
            Experiments
          </button>
        </div>
      </div>

      {/* Test Cases View - CompareContent */}
      {viewMode === 'testcases' && <CompareContent />}

      {/* Experiments View - Head-to-Head */}
      {viewMode === 'experiments' && (
        <>
          {experiments.length < 2 ? (
            <div className="border-border/50 rounded-lg border bg-gray-50 py-12 text-center">
              <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Layers className="h-6 w-6 text-primary/50" />
              </div>
              <h3 className="mb-2 text-xl font-semibold text-text-primary">
                Need Multiple Experiments
              </h3>
              <p className="mx-auto mb-4 max-w-md text-text-muted">
                Your data contains only {experiments.length} experiment
                {experiments.length !== 1 ? 's' : ''}. Upload data with at least 2 experiments to
                compare.
              </p>
              <p className="text-sm text-text-muted">
                Current experiment{experiments.length !== 1 ? 's' : ''}:{' '}
                {experiments.join(', ') || 'None'}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Experiment Selector */}
              <ExperimentSelector rows={comparisonRows} />

              {/* Head-to-Head Summary */}
              {isComparisonReady && <HeadToHeadSummary rows={comparisonRows} />}

              {/* Charts Section */}
              {isComparisonReady && (
                <div className="border-border/50 overflow-hidden rounded-lg border bg-gray-50">
                  <button
                    onClick={() => setShowCharts(!showCharts)}
                    className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-3">
                      <BarChart2 className="h-5 w-5 text-primary" />
                      <span className="font-semibold text-text-primary">Comparison Charts</span>
                    </div>
                    {showCharts ? (
                      <ChevronUp className="h-5 w-5 text-text-muted" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-text-muted" />
                    )}
                  </button>

                  {showCharts && (
                    <div className="space-y-4 px-5 pb-5">
                      {/* Chart Type Tabs */}
                      <div className="border-border/50 flex items-center gap-1 overflow-x-auto rounded-lg border bg-white p-1">
                        {[
                          {
                            id: 'winloss',
                            label: 'Win/Loss',
                            description: 'Head-to-head winner per case',
                          },
                          {
                            id: 'distribution',
                            label: 'Distribution',
                            description: 'Score distributions',
                          },
                          { id: 'radar', label: 'Radar', description: 'Multi-metric comparison' },
                          { id: 'bar', label: 'Bar', description: 'Mean scores by metric' },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => setActiveChart(tab.id as typeof activeChart)}
                            title={tab.description}
                            className={cn(
                              'whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all',
                              activeChart === tab.id
                                ? 'bg-primary text-white shadow-sm'
                                : 'text-text-muted hover:bg-gray-50 hover:text-text-primary'
                            )}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* Chart Content */}
                      <div className="border-border/50 min-h-[450px] rounded-lg border bg-white p-4">
                        {activeChart === 'winloss' && <WinLossChart rows={filteredRows} />}
                        {activeChart === 'distribution' && (
                          <ModelDistributionChart
                            rows={filteredRows}
                            selectedMetric={compareDistributionMetric}
                            chartType={compareDistributionChartType}
                            onMetricChange={setCompareDistributionMetric}
                            onChartTypeChange={setCompareDistributionChartType}
                          />
                        )}
                        {activeChart === 'radar' && (
                          <ModelRadarChart
                            rows={filteredRows}
                            selectedMetrics={compareSelectedMetrics}
                            onMetricsChange={setCompareSelectedMetrics}
                          />
                        )}
                        {activeChart === 'bar' && (
                          <ModelBarChart
                            rows={filteredRows}
                            selectedMetrics={compareSelectedMetrics}
                            onMetricsChange={setCompareSelectedMetrics}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Case Diff View */}
              {isComparisonReady && <CaseDiffView rows={comparisonRows} />}

              {/* Prompt to select experiments */}
              {!isComparisonReady && (
                <div className="border-border/50 rounded-lg border bg-gray-50 py-8 text-center">
                  <GitCompare className="mx-auto mb-3 h-10 w-10 text-text-muted opacity-50" />
                  <p className="text-text-muted">
                    Select both a baseline and challenger experiment above to see the comparison
                    analysis
                  </p>
                </div>
              )}

              {/* Export */}
              {isComparisonReady && (
                <div className="flex justify-end">
                  <ExportComparisonReport rows={comparisonRows} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
