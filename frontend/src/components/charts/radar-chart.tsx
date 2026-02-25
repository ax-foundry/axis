'use client';

import { useMemo } from 'react';

import { ChartColors } from '@/types';

import { PlotlyChart } from './plotly-chart';

interface RadarChartProps {
  metrics: string[];
  traces: Array<{
    name: string;
    values: number[];
  }>;
  title?: string;
}

export function RadarChart({ metrics, traces, title }: RadarChartProps) {
  const plotData = useMemo(() => {
    return traces.map((trace, index) => ({
      type: 'scatterpolar' as const,
      r: [...trace.values, trace.values[0]], // Close the polygon
      theta: [...metrics, metrics[0]],
      fill: 'toself' as const,
      name: trace.name,
      line: { color: ChartColors[index % ChartColors.length] },
      fillcolor: ChartColors[index % ChartColors.length],
      opacity: 0.5,
    }));
  }, [traces, metrics]);

  const layout = useMemo(
    () => ({
      title: title ? { text: title, font: { size: 14 } } : undefined,
      showlegend: traces.length > 1,
      polar: {
        radialaxis: {
          visible: true,
          range: [0, 1],
          tickfont: { size: 10 },
        },
        angularaxis: {
          tickfont: { size: 11 },
        },
      },
    }),
    [title, traces.length]
  );

  return <PlotlyChart data={plotData} layout={layout} />;
}
