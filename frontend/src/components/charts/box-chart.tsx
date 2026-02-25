'use client';

import { useMemo } from 'react';

import { ChartColors } from '@/types';

import { PlotlyChart } from './plotly-chart';

interface BoxChartProps {
  data: number[][];
  labels: string[];
  title?: string;
  showPoints?: boolean;
}

export function BoxChart({ data, labels, title, showPoints = false }: BoxChartProps) {
  const plotData = useMemo(() => {
    return data.map((values, index) => ({
      type: 'box' as const,
      y: values,
      name: labels[index],
      marker: { color: ChartColors[index % ChartColors.length] },
      boxpoints: showPoints ? ('all' as const) : (false as const),
      jitter: 0.3,
      pointpos: -1.8,
    }));
  }, [data, labels, showPoints]);

  const layout = useMemo(
    () => ({
      title: title ? { text: title, font: { size: 14 } } : undefined,
      showlegend: data.length > 1,
      yaxis: {
        title: 'Score',
        gridcolor: '#E1E5EA',
        range: [0, 1],
      },
      xaxis: {
        gridcolor: '#E1E5EA',
      },
    }),
    [title, data.length]
  );

  return <PlotlyChart data={plotData} layout={layout} />;
}
