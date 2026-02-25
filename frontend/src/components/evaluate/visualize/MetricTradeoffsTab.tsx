'use client';

import { useMemo, useEffect } from 'react';

import { HeatmapChart } from '@/components/charts/heatmap-chart';
import { ScatterChart } from '@/components/charts/scatter-chart';
import { useDataStore, useUIStore } from '@/stores';
import { Columns } from '@/types';

export function MetricTradeoffsTab() {
  const { data, metricColumns, format } = useDataStore();
  const {
    selectedXMetric,
    selectedYMetric,
    setSelectedXMetric,
    setSelectedYMetric,
    showTrendline,
    setShowTrendline,
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

  // Initialize selected metrics
  useEffect(() => {
    if (availableMetrics.length >= 2) {
      if (!selectedXMetric || !availableMetrics.includes(selectedXMetric)) {
        setSelectedXMetric(availableMetrics[0]);
      }
      if (!selectedYMetric || !availableMetrics.includes(selectedYMetric)) {
        setSelectedYMetric(availableMetrics[1]);
      }
    }
  }, [availableMetrics, selectedXMetric, selectedYMetric, setSelectedXMetric, setSelectedYMetric]);

  // Prepare scatter data
  const scatterData = useMemo(() => {
    if (!data || data.length === 0 || !selectedXMetric || !selectedYMetric) {
      return { x: [], y: [], ids: [] };
    }

    const xValues: number[] = [];
    const yValues: number[] = [];
    const ids: string[] = [];

    if (format === 'tree_format' || format === 'flat_format') {
      // Group by test case ID
      const testCases = new Map<string, Record<string, number>>();

      data.forEach((row) => {
        const id = row[Columns.DATASET_ID] as string;
        const metricName = row[Columns.METRIC_NAME] as string;
        const score = row[Columns.METRIC_SCORE] as number;

        if (!testCases.has(id)) {
          testCases.set(id, {});
        }
        if (metricName && typeof score === 'number') {
          testCases.get(id)![metricName] = score;
        }
      });

      testCases.forEach((metrics, id) => {
        const x = metrics[selectedXMetric];
        const y = metrics[selectedYMetric];

        if (typeof x === 'number' && typeof y === 'number') {
          xValues.push(x);
          yValues.push(y);
          ids.push(id);
        }
      });
    } else {
      data.forEach((row) => {
        const x = row[selectedXMetric] as number;
        const y = row[selectedYMetric] as number;
        const id = row[Columns.DATASET_ID] as string;

        if (typeof x === 'number' && typeof y === 'number') {
          xValues.push(x);
          yValues.push(y);
          ids.push(id || 'unknown');
        }
      });
    }

    return { x: xValues, y: yValues, ids };
  }, [data, format, selectedXMetric, selectedYMetric]);

  // Compute correlation matrix
  const correlationMatrix = useMemo(() => {
    if (!data || data.length === 0 || availableMetrics.length < 2) {
      return { metrics: [], values: [] };
    }

    const metricsToUse = availableMetrics.slice(0, 8); // Limit for readability
    const n = metricsToUse.length;
    const values: number[][] = [];

    // Build metric values map
    const metricValues = new Map<string, Map<string, number>>();

    if (format === 'tree_format' || format === 'flat_format') {
      data.forEach((row) => {
        const id = row[Columns.DATASET_ID] as string;
        const metricName = row[Columns.METRIC_NAME] as string;
        const score = row[Columns.METRIC_SCORE] as number;

        if (metricName && typeof score === 'number') {
          if (!metricValues.has(id)) {
            metricValues.set(id, new Map());
          }
          metricValues.get(id)!.set(metricName, score);
        }
      });
    } else {
      data.forEach((row, idx) => {
        const id = (row[Columns.DATASET_ID] as string) || `row_${idx}`;
        metricValues.set(id, new Map());
        metricsToUse.forEach((col) => {
          const val = row[col] as number;
          if (typeof val === 'number') {
            metricValues.get(id)!.set(col, val);
          }
        });
      });
    }

    // Calculate correlations
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          row.push(1);
          continue;
        }

        const pairs: Array<[number, number]> = [];
        metricValues.forEach((metrics) => {
          const a = metrics.get(metricsToUse[i]);
          const b = metrics.get(metricsToUse[j]);
          if (typeof a === 'number' && typeof b === 'number') {
            pairs.push([a, b]);
          }
        });

        if (pairs.length < 2) {
          row.push(0);
          continue;
        }

        // Pearson correlation
        const meanA = pairs.reduce((s, [a]) => s + a, 0) / pairs.length;
        const meanB = pairs.reduce((s, [, b]) => s + b, 0) / pairs.length;

        let num = 0;
        let denA = 0;
        let denB = 0;

        pairs.forEach(([a, b]) => {
          const diffA = a - meanA;
          const diffB = b - meanB;
          num += diffA * diffB;
          denA += diffA * diffA;
          denB += diffB * diffB;
        });

        const corr = denA > 0 && denB > 0 ? num / (Math.sqrt(denA) * Math.sqrt(denB)) : 0;

        row.push(Math.max(-1, Math.min(1, corr)));
      }
      values.push(row);
    }

    return { metrics: metricsToUse, values };
  }, [data, format, availableMetrics]);

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-text-muted">
        No data available. Upload evaluation data to see metric tradeoffs.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Scatter Plot Section */}
      <div className="border-border/50 rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-primary">Metric Scatter Plot</h3>

          {/* Controls */}
          <div className="flex items-center gap-4">
            {/* X Metric Selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted">X:</span>
              <select
                value={selectedXMetric || ''}
                onChange={(e) => setSelectedXMetric(e.target.value)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {availableMetrics.map((metric) => (
                  <option key={metric} value={metric}>
                    {metric}
                  </option>
                ))}
              </select>
            </div>

            {/* Y Metric Selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted">Y:</span>
              <select
                value={selectedYMetric || ''}
                onChange={(e) => setSelectedYMetric(e.target.value)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {availableMetrics.map((metric) => (
                  <option key={metric} value={metric}>
                    {metric}
                  </option>
                ))}
              </select>
            </div>

            {/* Trendline Toggle */}
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={showTrendline}
                onChange={(e) => setShowTrendline(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/50"
              />
              <span className="text-sm text-text-muted">Show Trendline</span>
            </label>
          </div>
        </div>

        {scatterData.x.length > 0 ? (
          <div className="h-[400px]">
            <ScatterChart
              x={scatterData.x}
              y={scatterData.y}
              xLabel={selectedXMetric || ''}
              yLabel={selectedYMetric || ''}
              ids={scatterData.ids}
              showTrendline={showTrendline}
            />
          </div>
        ) : (
          <div className="flex h-[400px] items-center justify-center text-text-muted">
            Select two metrics to view their relationship
          </div>
        )}
      </div>

      {/* Correlation Heatmap */}
      <div className="border-border/50 rounded-xl border bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-text-primary">Correlation Matrix</h3>
        {correlationMatrix.metrics.length > 1 ? (
          <div className="h-[400px]">
            <HeatmapChart
              z={correlationMatrix.values}
              x={correlationMatrix.metrics}
              y={correlationMatrix.metrics}
              showAnnotations={true}
            />
          </div>
        ) : (
          <div className="flex h-[400px] items-center justify-center text-text-muted">
            Need at least 2 metrics to show correlation matrix
          </div>
        )}
      </div>
    </div>
  );
}
