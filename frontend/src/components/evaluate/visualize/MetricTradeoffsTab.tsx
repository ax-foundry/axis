'use client';

import { useMemo, useEffect } from 'react';

import { HeatmapChart } from '@/components/charts/heatmap-chart';
import { PlotlyChart } from '@/components/charts/plotly-chart';
import { ScatterChart } from '@/components/charts/scatter-chart';
import { useFilteredEvalData } from '@/lib/hooks/useFilteredEvalData';
import { useDataStore, useUIStore } from '@/stores';
import { ChartColors, Columns } from '@/types';

export function MetricTradeoffsTab() {
  const { metricColumns, format } = useDataStore();
  const {
    filteredData: data,
    hasMultiple,
    filteredEvaluationNames: evaluationNames,
  } = useFilteredEvalData();
  const {
    selectedXMetric,
    selectedYMetric,
    setSelectedXMetric,
    setSelectedYMetric,
    showTrendline,
    setShowTrendline,
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

  // Aggregated scatter (single eval)
  const scatterData = useMemo(() => {
    if (!data || data.length === 0 || !selectedXMetric || !selectedYMetric || hasMultiple) {
      return { x: [], y: [], ids: [] };
    }

    const xValues: number[] = [];
    const yValues: number[] = [];
    const ids: string[] = [];

    if (format === 'tree_format' || format === 'flat_format') {
      const testCases = new Map<string, Record<string, number>>();
      data.forEach((row) => {
        const id = row[Columns.DATASET_ID] as string;
        const metricName = row[Columns.METRIC_NAME] as string;
        const score = row[Columns.METRIC_SCORE] as number;
        if (!testCases.has(id)) testCases.set(id, {});
        if (metricName && typeof score === 'number') testCases.get(id)![metricName] = score;
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
  }, [data, format, selectedXMetric, selectedYMetric, hasMultiple]);

  // Comparison scatter: one trace per eval_name
  const comparisonScatterTraces = useMemo((): Plotly.Data[] => {
    if (!hasMultiple || !data || data.length === 0 || !selectedXMetric || !selectedYMetric)
      return [];

    const byName = new Map<string, { x: number[]; y: number[]; ids: string[] }>();
    evaluationNames.forEach((n) => byName.set(n, { x: [], y: [], ids: [] }));

    if (format === 'tree_format' || format === 'flat_format') {
      // Build per-(evalName, id) metric map
      const testCases = new Map<string, Record<string, number>>();
      const idToEval = new Map<string, string>();

      data.forEach((row) => {
        const id = row[Columns.DATASET_ID] as string;
        const evalName = String(row[Columns.EXPERIMENT_NAME] ?? 'Default');
        const metricName = row[Columns.METRIC_NAME] as string;
        const score = row[Columns.METRIC_SCORE] as number;
        const key = `${evalName}::${id}`;
        if (!testCases.has(key)) {
          testCases.set(key, {});
          idToEval.set(key, evalName);
        }
        if (metricName && typeof score === 'number') testCases.get(key)![metricName] = score;
      });

      testCases.forEach((metrics, key) => {
        const evalName = idToEval.get(key)!;
        if (!byName.has(evalName)) return;
        const x = metrics[selectedXMetric];
        const y = metrics[selectedYMetric];
        if (typeof x === 'number' && typeof y === 'number') {
          const entry = byName.get(evalName)!;
          entry.x.push(x);
          entry.y.push(y);
          entry.ids.push(key.split('::')[1]);
        }
      });
    } else {
      data.forEach((row) => {
        const evalName = String(row[Columns.EXPERIMENT_NAME] ?? 'Default');
        if (!byName.has(evalName)) return;
        const x = row[selectedXMetric] as number;
        const y = row[selectedYMetric] as number;
        const id = (row[Columns.DATASET_ID] as string) || 'unknown';
        if (typeof x === 'number' && typeof y === 'number') {
          const entry = byName.get(evalName)!;
          entry.x.push(x);
          entry.y.push(y);
          entry.ids.push(id);
        }
      });
    }

    return evaluationNames.map((evalName, idx) => {
      const entry = byName.get(evalName)!;
      return {
        type: 'scatter' as const,
        mode: 'markers' as const,
        name: evalName,
        x: entry.x,
        y: entry.y,
        text: entry.ids,
        marker: { color: ChartColors[idx % ChartColors.length], size: 8, opacity: 0.7 },
        hovertemplate: `<b>%{text}</b><br>${selectedXMetric}: %{x:.3f}<br>${selectedYMetric}: %{y:.3f}<extra>${evalName}</extra>`,
      };
    });
  }, [hasMultiple, data, evaluationNames, format, selectedXMetric, selectedYMetric]);

  // Correlation matrix (always aggregated)
  const correlationMatrix = useMemo(() => {
    if (!data || data.length === 0 || availableMetrics.length < 2) {
      return { metrics: [], values: [] };
    }
    const metricsToUse = availableMetrics.slice(0, 8);
    const n = metricsToUse.length;
    const values: number[][] = [];
    const metricValues = new Map<string, Map<string, number>>();

    if (format === 'tree_format' || format === 'flat_format') {
      data.forEach((row) => {
        const id = row[Columns.DATASET_ID] as string;
        const metricName = row[Columns.METRIC_NAME] as string;
        const score = row[Columns.METRIC_SCORE] as number;
        if (metricName && typeof score === 'number') {
          if (!metricValues.has(id)) metricValues.set(id, new Map());
          metricValues.get(id)!.set(metricName, score);
        }
      });
    } else {
      data.forEach((row, idx) => {
        const id = (row[Columns.DATASET_ID] as string) || `row_${idx}`;
        metricValues.set(id, new Map());
        metricsToUse.forEach((col) => {
          const val = row[col] as number;
          if (typeof val === 'number') metricValues.get(id)!.set(col, val);
        });
      });
    }

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
          if (typeof a === 'number' && typeof b === 'number') pairs.push([a, b]);
        });
        if (pairs.length < 2) {
          row.push(0);
          continue;
        }
        const meanA = pairs.reduce((s, [a]) => s + a, 0) / pairs.length;
        const meanB = pairs.reduce((s, [, b]) => s + b, 0) / pairs.length;
        let num = 0,
          denA = 0,
          denB = 0;
        pairs.forEach(([a, b]) => {
          const dA = a - meanA,
            dB = b - meanB;
          num += dA * dB;
          denA += dA * dA;
          denB += dB * dB;
        });
        row.push(
          denA > 0 && denB > 0
            ? Math.max(-1, Math.min(1, num / (Math.sqrt(denA) * Math.sqrt(denB))))
            : 0
        );
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
      <div className="border-border/50 rounded-xl border bg-surface p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-primary">
            {hasMultiple ? 'Metric Scatter by Evaluation' : 'Metric Scatter Plot'}
          </h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted">X:</span>
              <select
                value={selectedXMetric || ''}
                onChange={(e) => setSelectedXMetric(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {availableMetrics.map((metric) => (
                  <option key={metric} value={metric}>
                    {metric}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted">Y:</span>
              <select
                value={selectedYMetric || ''}
                onChange={(e) => setSelectedYMetric(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {availableMetrics.map((metric) => (
                  <option key={metric} value={metric}>
                    {metric}
                  </option>
                ))}
              </select>
            </div>
            {!hasMultiple && (
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={showTrendline}
                  onChange={(e) => setShowTrendline(e.target.checked)}
                  className="h-4 w-4 rounded border-border bg-surface text-primary accent-primary focus:ring-primary/50"
                />
                <span className="text-sm text-text-muted">Show Trendline</span>
              </label>
            )}
          </div>
        </div>

        <div className="h-[400px]">
          {hasMultiple ? (
            comparisonScatterTraces.length > 0 ? (
              <PlotlyChart
                data={comparisonScatterTraces}
                layout={{
                  showlegend: true,
                  xaxis: { title: selectedXMetric || '', gridcolor: '#E1E5EA' },
                  yaxis: { title: selectedYMetric || '', gridcolor: '#E1E5EA' },
                  legend: { orientation: 'h', y: -0.15, x: 0.5, xanchor: 'center' },
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-text-muted">
                Select two metrics to view their relationship
              </div>
            )
          ) : scatterData.x.length > 0 ? (
            <ScatterChart
              x={scatterData.x}
              y={scatterData.y}
              xLabel={selectedXMetric || ''}
              yLabel={selectedYMetric || ''}
              ids={scatterData.ids}
              showTrendline={showTrendline}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-text-muted">
              Select two metrics to view their relationship
            </div>
          )}
        </div>
      </div>

      {/* Correlation Heatmap (always aggregated) */}
      <div className="border-border/50 rounded-xl border bg-surface p-5 shadow-sm">
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
