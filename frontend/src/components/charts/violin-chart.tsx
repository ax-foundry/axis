'use client';

import { useMemo } from 'react';

import { ChartColors } from '@/types';

import { PlotlyChart } from './plotly-chart';

interface ViolinChartProps {
  data: number[][];
  labels: string[];
  title?: string;
  orientation?: 'vertical' | 'horizontal';
}

export function ViolinChart({ data, labels, title, orientation = 'vertical' }: ViolinChartProps) {
  const plotData = useMemo(() => {
    return data.map((values, index) => ({
      type: 'violin' as const,
      y: orientation === 'vertical' ? values : undefined,
      x: orientation === 'horizontal' ? values : undefined,
      name: labels[index],
      box: { visible: true },
      meanline: { visible: true },
      line: { color: ChartColors[index % ChartColors.length] },
      fillcolor: ChartColors[index % ChartColors.length],
      opacity: 0.7,
    }));
  }, [data, labels, orientation]);

  const layout = useMemo(
    () => ({
      title: title ? { text: title, font: { size: 14 } } : undefined,
      showlegend: data.length > 1,
      violinmode: 'group' as const,
      xaxis: {
        title: orientation === 'horizontal' ? 'Score' : undefined,
        gridcolor: '#E1E5EA',
      },
      yaxis: {
        title: orientation === 'vertical' ? 'Score' : undefined,
        gridcolor: '#E1E5EA',
        range: [0, 1],
      },
    }),
    [title, data.length, orientation]
  );

  return <PlotlyChart data={plotData} layout={layout} />;
}
