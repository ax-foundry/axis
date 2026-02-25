'use client';

import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { ChartColors, type ComparisonRow } from '@/types';

import { groupByExperiment, linearRegression, getExperiments, getMetrics } from './utils';

interface ModelScatterChartProps {
  rows: ComparisonRow[];
  xMetric: string | null;
  yMetric: string | null;
  showTrendline: boolean;
  onXMetricChange: (metric: string) => void;
  onYMetricChange: (metric: string) => void;
  onTrendlineChange: (show: boolean) => void;
}

export function ModelScatterChart({
  rows,
  xMetric,
  yMetric,
  showTrendline,
  onXMetricChange,
  onYMetricChange,
  onTrendlineChange,
}: ModelScatterChartProps) {
  const experiments = useMemo(() => getExperiments(rows), [rows]);
  const allMetrics = useMemo(() => getMetrics(rows), [rows]);

  // Auto-select metrics if none selected
  const activeXMetric = xMetric || allMetrics[0] || null;
  const activeYMetric = yMetric || allMetrics[1] || allMetrics[0] || null;

  const chartData = useMemo(() => {
    if (!activeXMetric || !activeYMetric) return [];

    const groups = groupByExperiment(rows);
    const traces: Plotly.Data[] = [];

    // For trendline calculation across all data
    const allX: number[] = [];
    const allY: number[] = [];

    groups.forEach((expRows, expName) => {
      const xValues: number[] = [];
      const yValues: number[] = [];
      const labels: string[] = [];

      expRows.forEach((row) => {
        const x = row.metrics[activeXMetric];
        const y = row.metrics[activeYMetric];

        if (typeof x === 'number' && typeof y === 'number') {
          xValues.push(x);
          yValues.push(y);
          labels.push(row.query.substring(0, 50) + (row.query.length > 50 ? '...' : ''));
          allX.push(x);
          allY.push(y);
        }
      });

      if (xValues.length === 0) return;

      const colorIdx = experiments.indexOf(expName) % ChartColors.length;

      traces.push({
        type: 'scatter',
        mode: 'markers',
        x: xValues,
        y: yValues,
        name: expName,
        text: labels,
        hovertemplate: `<b>${expName}</b><br>${activeXMetric}: %{x:.3f}<br>${activeYMetric}: %{y:.3f}<br>%{text}<extra></extra>`,
        marker: {
          color: ChartColors[colorIdx],
          size: 10,
          opacity: 0.7,
        },
      } as Plotly.Data);
    });

    // Add trendline if enabled
    if (showTrendline && allX.length > 2) {
      const { slope, intercept, r2 } = linearRegression(allX, allY);
      const xMin = Math.min(...allX);
      const xMax = Math.max(...allX);

      traces.push({
        type: 'scatter',
        mode: 'lines',
        x: [xMin, xMax],
        y: [slope * xMin + intercept, slope * xMax + intercept],
        name: `Trendline (R²=${r2.toFixed(3)})`,
        line: {
          color: '#666',
          width: 2,
          dash: 'dash',
        },
        showlegend: true,
      } as Plotly.Data);
    }

    return traces;
  }, [rows, activeXMetric, activeYMetric, showTrendline, experiments]);

  if (rows.length === 0 || experiments.length === 0 || allMetrics.length < 2) {
    return (
      <div className="flex h-[400px] items-center justify-center text-text-muted">
        Need at least 2 metrics for scatter plot
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Metric Selectors */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-muted">X Axis:</span>
            <select
              value={activeXMetric || ''}
              onChange={(e) => onXMetricChange(e.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {allMetrics.map((metric) => (
                <option key={metric} value={metric}>
                  {metric}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-text-muted">Y Axis:</span>
            <select
              value={activeYMetric || ''}
              onChange={(e) => onYMetricChange(e.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {allMetrics.map((metric) => (
                <option key={metric} value={metric}>
                  {metric}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Trendline Toggle */}
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={showTrendline}
            onChange={(e) => onTrendlineChange(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm text-text-secondary">Show Trendline</span>
        </label>
      </div>

      {/* Chart */}
      <div className="h-[450px]">
        <PlotlyChart
          data={chartData}
          layout={{
            title: {
              text: `${activeXMetric} vs ${activeYMetric}`,
              font: { size: 14 },
            },
            xaxis: {
              title: activeXMetric || '',
              range: [0, 1.05],
            },
            yaxis: {
              title: activeYMetric || '',
              range: [0, 1.05],
            },
            showlegend: true,
            legend: {
              orientation: 'h',
              y: -0.15,
              x: 0.5,
              xanchor: 'center',
            },
            hovermode: 'closest',
          }}
        />
      </div>
    </div>
  );
}
