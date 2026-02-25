'use client';

import { useMemo } from 'react';

import { Colors } from '@/types';

import { PlotlyChart } from './plotly-chart';

interface ScatterChartProps {
  x: number[];
  y: number[];
  xLabel: string;
  yLabel: string;
  color?: (string | number)[];
  colorLabel?: string;
  ids?: string[];
  title?: string;
  showTrendline?: boolean;
}

export function ScatterChart({
  x,
  y,
  xLabel,
  yLabel,
  color,
  colorLabel,
  ids,
  title,
  showTrendline = false,
}: ScatterChartProps) {
  const plotData = useMemo(() => {
    const traces: Plotly.Data[] = [
      {
        type: 'scatter' as const,
        mode: 'markers' as const,
        x,
        y,
        marker: {
          color: color || Colors.primary,
          colorscale: color ? 'Viridis' : undefined,
          showscale: !!color,
          colorbar: colorLabel ? { title: { text: colorLabel } } : undefined,
          size: 8,
          opacity: 0.7,
        },
        text: ids,
        hovertemplate: ids
          ? `<b>%{text}</b><br>${xLabel}: %{x:.3f}<br>${yLabel}: %{y:.3f}<extra></extra>`
          : `${xLabel}: %{x:.3f}<br>${yLabel}: %{y:.3f}<extra></extra>`,
      },
    ];

    // Add trendline if requested
    if (showTrendline && x.length > 1) {
      // Simple linear regression
      const n = x.length;
      const sumX = x.reduce((a, b) => a + b, 0);
      const sumY = y.reduce((a, b) => a + b, 0);
      const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
      const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      const minX = Math.min(...x);
      const maxX = Math.max(...x);

      traces.push({
        type: 'scatter' as const,
        mode: 'lines' as const,
        x: [minX, maxX],
        y: [slope * minX + intercept, slope * maxX + intercept],
        line: {
          color: Colors.error,
          dash: 'dash',
          width: 2,
        },
        name: 'Trend',
        hoverinfo: 'skip',
      });
    }

    return traces;
  }, [x, y, xLabel, yLabel, color, colorLabel, ids, showTrendline]);

  const layout = useMemo(
    () => ({
      title: title ? { text: title, font: { size: 14 } } : undefined,
      showlegend: showTrendline,
      xaxis: {
        title: xLabel,
        gridcolor: '#E1E5EA',
      },
      yaxis: {
        title: yLabel,
        gridcolor: '#E1E5EA',
      },
    }),
    [title, xLabel, yLabel, showTrendline]
  );

  return <PlotlyChart data={plotData} layout={layout} />;
}
