'use client';

import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { cn } from '@/lib/utils';
import { useDataStore, useUIStore } from '@/stores';
import { Columns, Colors } from '@/types';

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
      if (char === '"') result += '\\"';
      else if (char === '\n') result += '\\n';
      else if (char === '\r') result += '\\r';
      else if (char === '\t') result += '\\t';
      else result += char;
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

export function MetadataBreakdownTab() {
  const { data, metricColumns, format } = useDataStore();
  const {
    analyticsMetadataGrouping,
    setAnalyticsMetadataGrouping,
    analyticsResponseMetric,
    setAnalyticsResponseMetric,
    analyticsPassRateThreshold,
    setAnalyticsPassRateThreshold,
  } = useUIStore();

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

  // Get available metadata keys
  const availableMetadataKeys = useMemo(() => {
    if (!data || data.length === 0) return [];

    const keys = new Set<string>();
    data.forEach((row) => {
      const metadata = extractMetadata(row);
      Object.keys(metadata).forEach((k) => keys.add(k));
    });

    return Array.from(keys).sort();
  }, [data]);

  const activeMetric = analyticsResponseMetric || availableMetrics[0] || null;
  const activeGrouping = analyticsMetadataGrouping || availableMetadataKeys[0] || null;

  // Compute breakdown by metadata grouping
  const breakdownData = useMemo(() => {
    if (!data || data.length === 0 || !activeGrouping || !activeMetric) return null;

    // Group by metadata value
    const groups = new Map<string, { scores: number[]; count: number }>();

    if (format === 'tree_format' || format === 'flat_format') {
      // Build test case map
      const testCases = new Map<
        string,
        {
          metadata: Record<string, unknown>;
          scores: Record<string, number>;
        }
      >();

      data.forEach((row) => {
        const id = row[Columns.DATASET_ID] as string;
        if (!id) return;

        if (!testCases.has(id)) {
          testCases.set(id, {
            metadata: extractMetadata(row),
            scores: {},
          });
        }

        const metricName = row[Columns.METRIC_NAME] as string;
        const score = row[Columns.METRIC_SCORE] as number;
        if (metricName && typeof score === 'number') {
          testCases.get(id)!.scores[metricName] = score;
        }
      });

      testCases.forEach((tc) => {
        const groupValue = tc.metadata[activeGrouping];
        const strValue =
          typeof groupValue === 'object'
            ? JSON.stringify(groupValue)
            : String(groupValue ?? 'undefined');

        const score = tc.scores[activeMetric];
        if (typeof score !== 'number') return;

        if (!groups.has(strValue)) {
          groups.set(strValue, { scores: [], count: 0 });
        }
        groups.get(strValue)!.scores.push(score);
        groups.get(strValue)!.count++;
      });
    } else {
      data.forEach((row) => {
        const metadata = extractMetadata(row);
        const groupValue = metadata[activeGrouping];
        const strValue =
          typeof groupValue === 'object'
            ? JSON.stringify(groupValue)
            : String(groupValue ?? 'undefined');

        const score = row[activeMetric] as number;
        if (typeof score !== 'number') return;

        if (!groups.has(strValue)) {
          groups.set(strValue, { scores: [], count: 0 });
        }
        groups.get(strValue)!.scores.push(score);
        groups.get(strValue)!.count++;
      });
    }

    // Calculate stats for each group
    const breakdown = Array.from(groups.entries())
      .map(([value, data]) => {
        const mean = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
        const passCount = data.scores.filter((s) => s >= analyticsPassRateThreshold).length;
        const passRate = passCount / data.scores.length;
        return {
          value,
          count: data.count,
          mean,
          passRate,
        };
      })
      .sort((a, b) => b.mean - a.mean);

    return breakdown;
  }, [data, format, activeGrouping, activeMetric, analyticsPassRateThreshold]);

  // Prepare chart data
  const meanScoreChart = useMemo(() => {
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
  }, [breakdownData]);

  const passRateChart = useMemo(() => {
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
  }, [breakdownData]);

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

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="border-border/50 rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-muted">Group By:</span>
            <select
              value={activeGrouping || ''}
              onChange={(e) => setAnalyticsMetadataGrouping(e.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
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
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
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
        {/* Mean Score by Grouping */}
        <div className="border-border/50 rounded-xl border bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-text-primary">
            Mean {activeMetric || 'Score'} by {activeGrouping}
          </h3>
          <div className="h-[350px]">
            <PlotlyChart
              data={meanScoreChart}
              layout={{
                xaxis: {
                  title: activeGrouping || 'Category',
                  tickangle: -45,
                },
                yaxis: {
                  title: `Mean ${activeMetric || 'Score'}`,
                  range: [0, 1.05],
                },
                showlegend: false,
                margin: { l: 60, r: 20, t: 20, b: 100 },
              }}
            />
          </div>
        </div>

        {/* Pass Rate by Grouping */}
        <div className="border-border/50 rounded-xl border bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-text-primary">
            Pass Rate by {activeGrouping}
          </h3>
          <div className="h-[350px]">
            <PlotlyChart
              data={passRateChart}
              layout={{
                xaxis: {
                  title: activeGrouping || 'Category',
                  tickangle: -45,
                },
                yaxis: {
                  title: 'Pass Rate (%)',
                  range: [0, 105],
                },
                showlegend: false,
                margin: { l: 60, r: 20, t: 20, b: 100 },
              }}
            />
          </div>
        </div>
      </div>

      {/* Summary Table */}
      {breakdownData && breakdownData.length > 0 && (
        <div className="border-border/50 rounded-xl border bg-white p-5 shadow-sm">
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
