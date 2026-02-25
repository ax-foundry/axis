'use client';

import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { cn } from '@/lib/utils';
import { ChartColors, type ComparisonRow } from '@/types';

import { groupByExperiment, extractMetricScores, getExperiments, getMetrics } from './utils';

interface ModelDistributionChartProps {
  rows: ComparisonRow[];
  selectedMetric: string | null;
  chartType: 'violin' | 'box';
  onMetricChange: (metric: string) => void;
  onChartTypeChange: (type: 'violin' | 'box') => void;
}

export function ModelDistributionChart({
  rows,
  selectedMetric,
  chartType,
  onMetricChange,
  onChartTypeChange,
}: ModelDistributionChartProps) {
  const experiments = useMemo(() => getExperiments(rows), [rows]);
  const metrics = useMemo(() => getMetrics(rows), [rows]);

  // Auto-select first metric if none selected
  const activeMetric = selectedMetric || metrics[0] || null;

  const chartData = useMemo(() => {
    if (!activeMetric) return [];

    const groups = groupByExperiment(rows);
    const traces: Plotly.Data[] = [];

    groups.forEach((expRows, expName) => {
      const scores = extractMetricScores(expRows, activeMetric);
      if (scores.length === 0) return;

      const colorIdx = experiments.indexOf(expName) % ChartColors.length;

      if (chartType === 'violin') {
        traces.push({
          type: 'violin',
          y: scores,
          name: expName,
          box: { visible: true },
          meanline: { visible: true },
          points: 'outliers',
          marker: { color: ChartColors[colorIdx] },
          line: { color: ChartColors[colorIdx] },
          fillcolor: ChartColors[colorIdx],
          opacity: 0.7,
        } as Plotly.Data);
      } else {
        traces.push({
          type: 'box',
          y: scores,
          name: expName,
          boxpoints: 'outliers',
          marker: { color: ChartColors[colorIdx] },
          line: { color: ChartColors[colorIdx] },
        } as Plotly.Data);
      }
    });

    return traces;
  }, [rows, activeMetric, chartType, experiments]);

  if (rows.length === 0 || experiments.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center text-text-muted">
        No data available for distribution chart
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Metric Selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted">Metric:</span>
          <select
            value={activeMetric || ''}
            onChange={(e) => onMetricChange(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {metrics.map((metric) => (
              <option key={metric} value={metric}>
                {metric}
              </option>
            ))}
          </select>
        </div>

        {/* Chart Type Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted">Type:</span>
          <div className="flex items-center rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => onChartTypeChange('violin')}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                chartType === 'violin'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              )}
            >
              Violin
            </button>
            <button
              onClick={() => onChartTypeChange('box')}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                chartType === 'box'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              )}
            >
              Box
            </button>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[400px]">
        <PlotlyChart
          data={chartData}
          layout={{
            title: {
              text: `${activeMetric} Distribution by Experiment`,
              font: { size: 14 },
            },
            yaxis: {
              title: activeMetric || 'Score',
              range: [0, 1.05],
            },
            xaxis: {
              title: 'Experiment',
            },
            showlegend: true,
            legend: {
              orientation: 'h',
              y: -0.2,
              x: 0.5,
              xanchor: 'center',
            },
          }}
        />
      </div>
    </div>
  );
}
