'use client';

import { useMemo } from 'react';

import { PlotlyChart } from './plotly-chart';

interface HeatmapChartProps {
  z: number[][];
  x: string[];
  y: string[];
  title?: string;
  colorscale?: string;
  showAnnotations?: boolean;
}

export function HeatmapChart({
  z,
  x,
  y,
  title,
  colorscale = 'RdYlGn',
  showAnnotations = true,
}: HeatmapChartProps) {
  const plotData = useMemo(() => {
    return [
      {
        type: 'heatmap' as const,
        z,
        x,
        y,
        colorscale,
        zmin: -1,
        zmax: 1,
        hoverongaps: false,
        hovertemplate: '<b>%{x}</b> vs <b>%{y}</b><br>Correlation: %{z:.3f}<extra></extra>',
      },
    ];
  }, [z, x, y, colorscale]);

  const layout = useMemo(() => {
    const annotations: Partial<Plotly.Annotations>[] = [];

    if (showAnnotations) {
      for (let i = 0; i < y.length; i++) {
        for (let j = 0; j < x.length; j++) {
          annotations.push({
            x: x[j],
            y: y[i],
            text: z[i][j].toFixed(2),
            showarrow: false,
            font: {
              color: Math.abs(z[i][j]) > 0.5 ? '#fff' : '#000',
              size: 10,
            },
          });
        }
      }
    }

    return {
      title: title ? { text: title, font: { size: 14 } } : undefined,
      annotations,
      xaxis: {
        side: 'bottom' as const,
        tickangle: -45,
      },
      yaxis: {
        autorange: 'reversed' as const,
      },
    };
  }, [title, showAnnotations, x, y, z]);

  return <PlotlyChart data={plotData} layout={layout} />;
}
