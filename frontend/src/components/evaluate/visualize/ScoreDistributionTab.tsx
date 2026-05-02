'use client';

import { useMemo } from 'react';

import { BoxChart } from '@/components/charts/box-chart';
import { PlotlyChart } from '@/components/charts/plotly-chart';
import { ViolinChart } from '@/components/charts/violin-chart';
import { useFilteredEvalData } from '@/lib/hooks/useFilteredEvalData';
import { cn } from '@/lib/utils';
import { useDataStore, useUIStore } from '@/stores';
import { ChartColors, Columns } from '@/types';

export function ScoreDistributionTab() {
  const { metricColumns, format } = useDataStore();
  const {
    filteredData: data,
    hasMultiple,
    filteredEvaluationNames: evaluationNames,
  } = useFilteredEvalData();
  const { distributionChartType, setDistributionChartType, selectedMetrics, setSelectedMetrics } =
    useUIStore();

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

  useMemo(() => {
    if (selectedMetrics.length === 0 && availableMetrics.length > 0) {
      setSelectedMetrics(availableMetrics.slice(0, 5));
    }
  }, [availableMetrics, selectedMetrics.length, setSelectedMetrics]);

  const metricsToShow = useMemo(
    () =>
      selectedMetrics.length > 0
        ? selectedMetrics.filter((m) => availableMetrics.includes(m))
        : availableMetrics.slice(0, 5),
    [selectedMetrics, availableMetrics]
  );

  // Aggregated (single eval or filtered to one)
  const distributionData = useMemo(() => {
    if (!data || data.length === 0 || hasMultiple) return { data: [], labels: [] };
    const distributions: number[][] = [];
    const labels: string[] = [];
    if (format === 'tree_format' || format === 'flat_format') {
      metricsToShow.forEach((metric) => {
        const scores = data
          .filter((row) => row[Columns.METRIC_NAME] === metric)
          .map((row) => row[Columns.METRIC_SCORE] as number)
          .filter((s) => typeof s === 'number' && !isNaN(s) && s >= 0 && s <= 1);
        if (scores.length > 0) {
          distributions.push(scores);
          labels.push(metric);
        }
      });
    } else {
      metricsToShow.forEach((col) => {
        const scores = data
          .map((row) => row[col] as number)
          .filter((s) => typeof s === 'number' && !isNaN(s) && s >= 0 && s <= 1);
        if (scores.length > 0) {
          distributions.push(scores);
          labels.push(col);
        }
      });
    }
    return { data: distributions, labels };
  }, [data, format, metricsToShow, hasMultiple]);

  // Comparison: one trace per eval_name, x = metric name repeated per score
  const comparisonTraces = useMemo((): Plotly.Data[] => {
    if (!hasMultiple || !data || data.length === 0) return [];

    const byName = new Map<string, Map<string, number[]>>();
    evaluationNames.forEach((n) => byName.set(n, new Map()));

    if (format === 'tree_format' || format === 'flat_format') {
      data.forEach((row) => {
        const evalName = String(row[Columns.EXPERIMENT_NAME] ?? 'Default');
        const metricName = row[Columns.METRIC_NAME] as string;
        const score = row[Columns.METRIC_SCORE] as number;
        if (
          !byName.has(evalName) ||
          !metricName ||
          typeof score !== 'number' ||
          score < 0 ||
          score > 1
        )
          return;
        const m = byName.get(evalName)!;
        if (!m.has(metricName)) m.set(metricName, []);
        m.get(metricName)!.push(score);
      });
    } else {
      data.forEach((row) => {
        const evalName = String(row[Columns.EXPERIMENT_NAME] ?? 'Default');
        if (!byName.has(evalName)) return;
        const m = byName.get(evalName)!;
        metricsToShow.forEach((col) => {
          const val = row[col] as number;
          if (typeof val !== 'number' || isNaN(val) || val < 0 || val > 1) return;
          if (!m.has(col)) m.set(col, []);
          m.get(col)!.push(val);
        });
      });
    }

    return evaluationNames.map((evalName, idx) => {
      const metricMap = byName.get(evalName)!;
      const xAll: string[] = [];
      const yAll: number[] = [];
      metricsToShow.forEach((metric) => {
        (metricMap.get(metric) ?? []).forEach((s) => {
          xAll.push(metric);
          yAll.push(s);
        });
      });
      const color = ChartColors[idx % ChartColors.length];
      const base = {
        name: evalName,
        x: xAll,
        y: yAll,
        line: { color },
        fillcolor: color,
        opacity: 0.7,
      };
      if (distributionChartType === 'violin') {
        return {
          ...base,
          type: 'violin' as const,
          box: { visible: true },
          meanline: { visible: true },
        };
      }
      return { ...base, type: 'box' as const, boxpoints: 'outliers' as const };
    });
  }, [hasMultiple, data, evaluationNames, format, metricsToShow, distributionChartType]);

  const handleMetricToggle = (metric: string) => {
    if (selectedMetrics.includes(metric)) {
      setSelectedMetrics(selectedMetrics.filter((m) => m !== metric));
    } else {
      setSelectedMetrics([...selectedMetrics, metric]);
    }
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-text-muted">
        No data available. Upload evaluation data to see score distributions.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted">Chart Type:</span>
          <div className="flex items-center rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
            {(['violin', 'box'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setDistributionChartType(type)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-all',
                  distributionChartType === type
                    ? 'bg-surface text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-primary'
                )}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <span className="text-sm text-text-muted">
          Showing {metricsToShow.length} of {availableMetrics.length} metrics
        </span>
      </div>

      {/* Metric Selector */}
      <div className="border-border/50 rounded-xl border bg-surface p-4">
        <h4 className="mb-3 text-sm font-medium text-text-primary">Select Metrics</h4>
        <div className="flex flex-wrap gap-2">
          {availableMetrics.map((metric) => {
            const isSelected = selectedMetrics.includes(metric);
            return (
              <button
                key={metric}
                onClick={() => handleMetricToggle(metric)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-sm font-medium transition-all',
                  isSelected
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-surface text-text-secondary hover:border-primary hover:text-primary'
                )}
              >
                {metric}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="border-border/50 rounded-xl border bg-surface p-5 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-text-primary">
          {hasMultiple ? 'Score Distribution by Evaluation' : 'Score Distribution'}
        </h3>
        <div className="h-[450px]">
          {hasMultiple ? (
            comparisonTraces.length > 0 ? (
              <PlotlyChart
                data={comparisonTraces}
                layout={{
                  showlegend: true,
                  ...(distributionChartType === 'violin'
                    ? { violinmode: 'group' as const }
                    : { boxmode: 'group' as const }),
                  xaxis: { gridcolor: '#E1E5EA' },
                  yaxis: { title: 'Score', range: [0, 1.05], gridcolor: '#E1E5EA' },
                  legend: { orientation: 'h', y: -0.15, x: 0.5, xanchor: 'center' },
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-text-muted">
                Select at least one metric to view distribution
              </div>
            )
          ) : distributionData.data.length > 0 ? (
            distributionChartType === 'violin' ? (
              <ViolinChart data={distributionData.data} labels={distributionData.labels} />
            ) : (
              <BoxChart
                data={distributionData.data}
                labels={distributionData.labels}
                showPoints={true}
              />
            )
          ) : (
            <div className="flex h-full items-center justify-center text-text-muted">
              Select at least one metric to view distribution
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
