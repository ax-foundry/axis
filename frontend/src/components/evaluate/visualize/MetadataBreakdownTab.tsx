'use client';

import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { useFilteredEvalData } from '@/lib/hooks/useFilteredEvalData';
import { cn } from '@/lib/utils';
import { useDataStore, useUIStore } from '@/stores';
import { ChartColors, Columns, Colors } from '@/types';

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
          result += stringChar === "'" ? "'" : '\\"';
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
      if (char === '"') result += '\\"';
      else if (char === '\n') result += '\\n';
      else if (char === '\r') result += '\\r';
      else if (char === '\t') result += '\\t';
      else result += char;
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

interface BreakdownItem {
  value: string;
  count: number;
  mean: number;
  passRate: number;
}

export function MetadataBreakdownTab() {
  const { metricColumns, format } = useDataStore();
  const {
    filteredData: data,
    hasMultiple,
    filteredEvaluationNames: evaluationNames,
  } = useFilteredEvalData();
  const {
    analyticsMetadataGrouping,
    setAnalyticsMetadataGrouping,
    analyticsResponseMetric,
    setAnalyticsResponseMetric,
    analyticsPassRateThreshold,
    setAnalyticsPassRateThreshold,
  } = useUIStore();

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

  const availableMetadataKeys = useMemo(() => {
    if (!data || data.length === 0) return [];
    const keys = new Set<string>();
    data.forEach((row) => {
      Object.keys(extractMetadata(row)).forEach((k) => keys.add(k));
    });
    return Array.from(keys).sort();
  }, [data]);

  const activeMetric = analyticsResponseMetric || availableMetrics[0] || null;
  const activeGrouping = analyticsMetadataGrouping || availableMetadataKeys[0] || null;

  // Helper: compute breakdown items from a slice of data
  const computeBreakdown = useMemo(() => {
    return (rows: typeof data): BreakdownItem[] => {
      if (!activeGrouping || !activeMetric) return [];
      const groups = new Map<string, { scores: number[] }>();

      if (format === 'tree_format' || format === 'flat_format') {
        const testCases = new Map<
          string,
          { metadata: Record<string, unknown>; scores: Record<string, number> }
        >();
        rows.forEach((row) => {
          const id = row[Columns.DATASET_ID] as string;
          if (!id) return;
          if (!testCases.has(id)) testCases.set(id, { metadata: extractMetadata(row), scores: {} });
          const metricName = row[Columns.METRIC_NAME] as string;
          const score = row[Columns.METRIC_SCORE] as number;
          if (metricName && typeof score === 'number')
            testCases.get(id)!.scores[metricName] = score;
        });
        testCases.forEach((tc) => {
          const groupValue = tc.metadata[activeGrouping!];
          const strValue =
            typeof groupValue === 'object'
              ? JSON.stringify(groupValue)
              : String(groupValue ?? 'undefined');
          const score = tc.scores[activeMetric!];
          if (typeof score !== 'number') return;
          if (!groups.has(strValue)) groups.set(strValue, { scores: [] });
          groups.get(strValue)!.scores.push(score);
        });
      } else {
        rows.forEach((row) => {
          const metadata = extractMetadata(row);
          const groupValue = metadata[activeGrouping!];
          const strValue =
            typeof groupValue === 'object'
              ? JSON.stringify(groupValue)
              : String(groupValue ?? 'undefined');
          const score = row[activeMetric!] as number;
          if (typeof score !== 'number') return;
          if (!groups.has(strValue)) groups.set(strValue, { scores: [] });
          groups.get(strValue)!.scores.push(score);
        });
      }

      return Array.from(groups.entries())
        .map(([value, { scores }]) => {
          const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
          const passRate =
            scores.filter((s) => s >= analyticsPassRateThreshold).length / scores.length;
          return { value, count: scores.length, mean, passRate };
        })
        .sort((a, b) => b.mean - a.mean);
    };
  }, [format, activeGrouping, activeMetric, analyticsPassRateThreshold]);

  // Aggregated breakdown (single eval or no comparison)
  const breakdownData = useMemo(() => {
    if (!data || data.length === 0 || hasMultiple) return null;
    return computeBreakdown(data);
  }, [data, hasMultiple, computeBreakdown]);

  // Per-eval breakdown for comparison mode
  const breakdownByEval = useMemo((): Map<string, BreakdownItem[]> | null => {
    if (!hasMultiple || !data || data.length === 0) return null;

    const byName = new Map<string, typeof data>();
    evaluationNames.forEach((n) => byName.set(n, []));
    data.forEach((row) => {
      const evalName = String(row[Columns.EXPERIMENT_NAME] ?? 'Default');
      if (byName.has(evalName)) byName.get(evalName)!.push(row);
    });

    const result = new Map<string, BreakdownItem[]>();
    evaluationNames.forEach((n) => result.set(n, computeBreakdown(byName.get(n) ?? [])));
    return result;
  }, [hasMultiple, data, evaluationNames, computeBreakdown]);

  // All unique metadata values across all eval names (for chart x-axis alignment)
  const allMetadataValues = useMemo(() => {
    if (!breakdownByEval) return breakdownData?.map((d) => d.value) ?? [];
    const vals = new Set<string>();
    breakdownByEval.forEach((items) => items.forEach((item) => vals.add(item.value)));
    return Array.from(vals);
  }, [breakdownByEval, breakdownData]);

  // Chart traces
  const meanScoreChart = useMemo((): Plotly.Data[] => {
    if (hasMultiple && breakdownByEval) {
      return evaluationNames.map((evalName, idx) => {
        const items = breakdownByEval.get(evalName) ?? [];
        const byVal = Object.fromEntries(items.map((i) => [i.value, i.mean]));
        return {
          type: 'bar',
          name: evalName,
          x: allMetadataValues,
          y: allMetadataValues.map((v) => byVal[v] ?? null),
          marker: { color: ChartColors[idx % ChartColors.length] },
          hovertemplate: `<b>%{x}</b><br>${evalName}: %{y:.3f}<extra></extra>`,
        } as Plotly.Data;
      });
    }

    if (!breakdownData) return [];
    return [
      {
        type: 'bar',
        x: breakdownData.map((d) => d.value),
        y: breakdownData.map((d) => d.mean),
        marker: {
          color: breakdownData.map((d) =>
            d.mean >= 0.7 ? Colors.success : d.mean >= 0.4 ? Colors.warning : Colors.error
          ),
        },
        text: breakdownData.map((d) => d.mean.toFixed(3)),
        textposition: 'auto',
        hovertemplate: '<b>%{x}</b><br>Mean: %{y:.3f}<extra></extra>',
      } as Plotly.Data,
    ];
  }, [hasMultiple, breakdownByEval, breakdownData, evaluationNames, allMetadataValues]);

  const passRateChart = useMemo((): Plotly.Data[] => {
    if (hasMultiple && breakdownByEval) {
      return evaluationNames.map((evalName, idx) => {
        const items = breakdownByEval.get(evalName) ?? [];
        const byVal = Object.fromEntries(items.map((i) => [i.value, i.passRate * 100]));
        return {
          type: 'bar',
          name: evalName,
          x: allMetadataValues,
          y: allMetadataValues.map((v) => byVal[v] ?? null),
          marker: { color: ChartColors[idx % ChartColors.length] },
          hovertemplate: `<b>%{x}</b><br>${evalName}: %{y:.1f}%<extra></extra>`,
        } as Plotly.Data;
      });
    }

    if (!breakdownData) return [];
    return [
      {
        type: 'bar',
        x: breakdownData.map((d) => d.value),
        y: breakdownData.map((d) => d.passRate * 100),
        marker: {
          color: breakdownData.map((d) =>
            d.passRate >= 0.7 ? Colors.success : d.passRate >= 0.4 ? Colors.warning : Colors.error
          ),
        },
        text: breakdownData.map((d) => `${(d.passRate * 100).toFixed(1)}%`),
        textposition: 'auto',
        hovertemplate: '<b>%{x}</b><br>Pass Rate: %{y:.1f}%<extra></extra>',
      } as Plotly.Data,
    ];
  }, [hasMultiple, breakdownByEval, breakdownData, evaluationNames, allMetadataValues]);

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-text-muted">
        No data available. Upload evaluation data to see metadata breakdown.
      </div>
    );
  }

  if (availableMetadataKeys.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-text-muted">
        <p className="mb-2">No metadata fields detected.</p>
        <p className="text-sm">
          This analysis requires data with a &quot;data_metadata&quot; field.
        </p>
      </div>
    );
  }

  const displayBreakdown = hasMultiple
    ? breakdownByEval
      ? Array.from(breakdownByEval.values()).flat()
      : []
    : (breakdownData ?? []);

  const isMultiSeries = hasMultiple && (evaluationNames.length ?? 0) > 1;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="border-border/50 rounded-xl border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-muted">Group By:</span>
            <select
              value={activeGrouping || ''}
              onChange={(e) => setAnalyticsMetadataGrouping(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {availableMetadataKeys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-muted">Metric:</span>
            <select
              value={activeMetric || ''}
              onChange={(e) => setAnalyticsResponseMetric(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {availableMetrics.map((metric) => (
                <option key={metric} value={metric}>
                  {metric}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-muted">Pass Threshold:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={analyticsPassRateThreshold}
              onChange={(e) => setAnalyticsPassRateThreshold(parseFloat(e.target.value))}
              className="h-2 w-24 cursor-pointer appearance-none rounded-lg bg-gray-200"
            />
            <span className="w-12 font-mono text-sm text-text-secondary">
              {(analyticsPassRateThreshold * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Mean Score */}
        <div className="border-border/50 rounded-xl border bg-surface p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-text-primary">
            Mean {activeMetric || 'Score'} by {activeGrouping}
            {hasMultiple && (
              <span className="ml-2 text-sm font-normal text-text-muted">by Evaluation</span>
            )}
          </h3>
          <div className="h-[350px]">
            <PlotlyChart
              data={meanScoreChart}
              layout={{
                barmode: isMultiSeries ? 'group' : undefined,
                showlegend: isMultiSeries,
                xaxis: { title: activeGrouping || 'Category', tickangle: -45 },
                yaxis: { title: `Mean ${activeMetric || 'Score'}`, range: [0, 1.05] },
                margin: { l: 60, r: 20, t: 20, b: 100 },
                legend: isMultiSeries
                  ? { orientation: 'h', y: -0.25, x: 0.5, xanchor: 'center' }
                  : undefined,
              }}
            />
          </div>
        </div>

        {/* Pass Rate */}
        <div className="border-border/50 rounded-xl border bg-surface p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-text-primary">
            Pass Rate by {activeGrouping}
            {hasMultiple && (
              <span className="ml-2 text-sm font-normal text-text-muted">by Evaluation</span>
            )}
          </h3>
          <div className="h-[350px]">
            <PlotlyChart
              data={passRateChart}
              layout={{
                barmode: isMultiSeries ? 'group' : undefined,
                showlegend: isMultiSeries,
                xaxis: { title: activeGrouping || 'Category', tickangle: -45 },
                yaxis: { title: 'Pass Rate (%)', range: [0, 105] },
                margin: { l: 60, r: 20, t: 20, b: 100 },
                legend: isMultiSeries
                  ? { orientation: 'h', y: -0.25, x: 0.5, xanchor: 'center' }
                  : undefined,
              }}
            />
          </div>
        </div>
      </div>

      {/* Summary Table */}
      {displayBreakdown.length > 0 && !hasMultiple && breakdownData && (
        <div className="border-border/50 rounded-xl border bg-surface p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-text-primary">Breakdown Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left font-medium text-text-secondary">
                    {activeGrouping}
                  </th>
                  <th className="px-4 py-2 text-center font-medium text-text-secondary">Count</th>
                  <th className="px-4 py-2 text-center font-medium text-text-secondary">
                    Mean {activeMetric}
                  </th>
                  <th className="px-4 py-2 text-center font-medium text-text-secondary">
                    Pass Rate
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-text-secondary">
                    Distribution
                  </th>
                </tr>
              </thead>
              <tbody>
                {breakdownData.map((item) => (
                  <tr key={item.value} className="border-border/50 border-b">
                    <td className="max-w-xs truncate px-4 py-2 font-medium text-text-primary">
                      {item.value}
                    </td>
                    <td className="px-4 py-2 text-center text-text-secondary">{item.count}</td>
                    <td className="px-4 py-2 text-center">
                      <span
                        className={cn(
                          'font-mono font-medium',
                          item.mean >= 0.7
                            ? 'text-green-600'
                            : item.mean >= 0.4
                              ? 'text-yellow-600'
                              : 'text-red-600'
                        )}
                      >
                        {item.mean.toFixed(3)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span
                        className={cn(
                          'font-mono font-medium',
                          item.passRate >= 0.7
                            ? 'text-green-600'
                            : item.passRate >= 0.4
                              ? 'text-yellow-600'
                              : 'text-red-600'
                        )}
                      >
                        {(item.passRate * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-32 rounded-full bg-gray-200">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{
                              width: `${item.passRate * 100}%`,
                              backgroundColor:
                                item.passRate >= 0.7
                                  ? Colors.success
                                  : item.passRate >= 0.4
                                    ? Colors.warning
                                    : Colors.error,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
