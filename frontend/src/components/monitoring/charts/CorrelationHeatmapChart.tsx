'use client';

import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';

interface CorrelationHeatmapChartProps {
  matrix: number[][];
  metrics: string[];
  colorscale?: string;
  showAnnotations?: boolean;
}

export function CorrelationHeatmapChart({
  matrix,
  metrics,
  colorscale = 'RdYlGn',
  showAnnotations = true,
}: CorrelationHeatmapChartProps) {
  // Clean up metric names for display
  const displayMetrics = useMemo(() => metrics.map((m) => m.replace(/_score$/, '')), [metrics]);

  const plotData = useMemo(() => {
    if (matrix.length === 0) return [];

    return [
      {
        type: 'heatmap' as const,
        z: matrix,
        x: displayMetrics,
        y: displayMetrics,
        colorscale,
        zmin: -1,
        zmax: 1,
        hoverongaps: false,
        hovertemplate: '<b>%{x}</b> vs <b>%{y}</b><br>' + 'Correlation: %{z:.3f}<extra></extra>',
        colorbar: {
          title: { text: 'Correlation', font: { size: 11 } },
          thickness: 15,
          len: 0.75,
        },
      },
    ];
  }, [matrix, displayMetrics, colorscale]);

  const layout = useMemo(() => {
    const annotations: Partial<Plotly.Annotations>[] = [];

    if (showAnnotations && matrix.length > 0) {
      for (let i = 0; i < displayMetrics.length; i++) {
        for (let j = 0; j < displayMetrics.length; j++) {
          const value = matrix[i][j];
          annotations.push({
            x: displayMetrics[j],
            y: displayMetrics[i],
            text: value.toFixed(2),
            showarrow: false,
            font: {
              color: Math.abs(value) > 0.5 ? '#fff' : '#000',
              size: 10,
            },
          });
        }
      }
    }

    return {
      annotations,
      xaxis: {
        side: 'bottom' as const,
        tickangle: -45,
        tickfont: { size: 10 },
      },
      yaxis: {
        autorange: 'reversed' as const,
        tickfont: { size: 10 },
      },
      margin: { l: 80, r: 60, t: 20, b: 80 },
    };
  }, [showAnnotations, matrix, displayMetrics]);

  if (matrix.length === 0 || metrics.length < 2) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-muted">
        Need at least 2 metrics for correlation
      </div>
    );
  }

  return <PlotlyChart data={plotData} layout={layout} />;
}
