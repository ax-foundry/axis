'use client';

import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { cn } from '@/lib/utils';
import { ChartColors, type ComparisonRow } from '@/types';

import {
  groupByExperiment,
  extractMetricScores,
  calculateStats,
  getExperiments,
  getMetrics,
} from './utils';

interface ModelBarChartProps {
  rows: ComparisonRow[];
  selectedMetrics: string[];
  onMetricsChange: (metrics: string[]) => void;
}

export function ModelBarChart({ rows, selectedMetrics, onMetricsChange }: ModelBarChartProps) {
  const experiments = useMemo(() => getExperiments(rows), [rows]);
  const allMetrics = useMemo(() => getMetrics(rows), [rows]);

  // Use selected metrics or default to first 5
  const activeMetrics = useMemo(() => {
    if (selectedMetrics.length > 0) {
      return selectedMetrics.filter((m) => allMetrics.includes(m));
    }
    return allMetrics.slice(0, Math.min(5, allMetrics.length));
  }, [selectedMetrics, allMetrics]);

  const chartData = useMemo(() => {
    if (activeMetrics.length === 0) return [];

    const groups = groupByExperiment(rows);
    const traces: Plotly.Data[] = [];

    groups.forEach((expRows, expName) => {
      const means: number[] = [];
      const errors: number[] = [];

      activeMetrics.forEach((metric) => {
        const scores = extractMetricScores(expRows, metric);
        const stats = calculateStats(scores);
        means.push(stats.mean);
        errors.push(stats.std);
      });

      const colorIdx = experiments.indexOf(expName) % ChartColors.length;

      traces.push({
        type: 'bar',
        x: activeMetrics,
        y: means,
        name: expName,
        marker: { color: ChartColors[colorIdx] },
        error_y: {
          type: 'data',
          array: errors,
          visible: true,
        },
      } as Plotly.Data);
    });

    return traces;
  }, [rows, activeMetrics, experiments]);

  const handleMetricToggle = (metric: string) => {
    if (activeMetrics.includes(metric)) {
      if (activeMetrics.length > 1) {
        onMetricsChange(activeMetrics.filter((m) => m !== metric));
      }
    } else {
      onMetricsChange([...activeMetrics, metric]);
    }
  };

  if (rows.length === 0 || experiments.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center text-text-muted">
        No data available for bar chart
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Metric Selector */}
      <div className="border-border/50 rounded-xl border bg-white p-4">
        <h4 className="mb-3 text-sm font-medium text-text-primary">Select Metrics</h4>
        <div className="flex flex-wrap gap-2">
          {allMetrics.map((metric) => {
            const isSelected = activeMetrics.includes(metric);
            return (
              <button
                key={metric}
                onClick={() => handleMetricToggle(metric)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-sm font-medium transition-all',
                  isSelected
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-text-secondary hover:border-primary hover:text-primary'
                )}
              >
                {metric}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="h-[400px]">
        <PlotlyChart
          data={chartData}
          layout={{
            title: {
              text: 'Mean Scores by Metric and Experiment',
              font: { size: 14 },
            },
            barmode: 'group',
            xaxis: {
              title: 'Metric',
              tickangle: -45,
            },
            yaxis: {
              title: 'Mean Score',
              range: [0, 1.05],
            },
            showlegend: true,
            legend: {
              orientation: 'h',
              y: -0.3,
              x: 0.5,
              xanchor: 'center',
            },
          }}
        />
      </div>
    </div>
  );
}
