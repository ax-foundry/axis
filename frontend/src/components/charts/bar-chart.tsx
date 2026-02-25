'use client';

import { useMemo } from 'react';

import { ChartColors, Colors, Thresholds } from '@/types';

import { PlotlyChart } from './plotly-chart';

interface BarChartProps {
  values: number[];
  labels: string[];
  title?: string;
  orientation?: 'vertical' | 'horizontal';
  showThresholds?: boolean;
  colorByValue?: boolean;
}

export function BarChart({
  values,
  labels,
  title,
  orientation = 'vertical',
  showThresholds = false,
  colorByValue = false,
}: BarChartProps) {
  const plotData = useMemo(() => {
    const colors = colorByValue
      ? values.map((v) => {
          if (v >= Thresholds.GREEN_THRESHOLD) return Colors.success;
          if (v <= Thresholds.RED_THRESHOLD) return Colors.error;
          return Colors.warning;
        })
      : ChartColors[0];

    return [
      {
        type: 'bar' as const,
        x: orientation === 'vertical' ? labels : values,
        y: orientation === 'vertical' ? values : labels,
        orientation: orientation === 'vertical' ? ('v' as const) : ('h' as const),
        marker: {
          color: colors,
          line: {
            color: 'rgba(0,0,0,0.1)',
            width: 1,
          },
        },
        hovertemplate:
          orientation === 'vertical'
            ? '<b>%{x}</b><br>Score: %{y:.3f}<extra></extra>'
            : '<b>%{y}</b><br>Score: %{x:.3f}<extra></extra>',
      },
    ];
  }, [values, labels, orientation, colorByValue]);

  const layout = useMemo(() => {
    const shapes: Partial<Plotly.Shape>[] = [];

    if (showThresholds) {
      // Add threshold lines
      if (orientation === 'vertical') {
        shapes.push(
          {
            type: 'line',
            x0: -0.5,
            x1: labels.length - 0.5,
            y0: Thresholds.GREEN_THRESHOLD,
            y1: Thresholds.GREEN_THRESHOLD,
            line: { color: Colors.success, width: 2, dash: 'dash' },
          },
          {
            type: 'line',
            x0: -0.5,
            x1: labels.length - 0.5,
            y0: Thresholds.RED_THRESHOLD,
            y1: Thresholds.RED_THRESHOLD,
            line: { color: Colors.error, width: 2, dash: 'dash' },
          }
        );
      }
    }

    return {
      title: title ? { text: title, font: { size: 14 } } : undefined,
      showlegend: false,
      xaxis: {
        title: orientation === 'horizontal' ? 'Score' : undefined,
        gridcolor: '#E1E5EA',
      },
      yaxis: {
        title: orientation === 'vertical' ? 'Score' : undefined,
        gridcolor: '#E1E5EA',
        range: orientation === 'vertical' ? [0, 1] : undefined,
      },
      shapes,
    };
  }, [title, orientation, showThresholds, labels.length]);

  return <PlotlyChart data={plotData} layout={layout} />;
}
