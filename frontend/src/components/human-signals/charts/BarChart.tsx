'use client';

import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';

import type { SignalsChartDataPoint } from '@/types';

interface BarChartProps {
  data: SignalsChartDataPoint[];
  title?: string;
  showPercent?: boolean;
}

export function BarChart({ data, showPercent = true }: BarChartProps) {
  const chartData = useMemo(() => {
    if (data.length === 0) return [];
    return [
      {
        type: 'bar' as const,
        x: data.map((d) => d.name.replace(/_/g, ' ')),
        y: showPercent ? data.map((d) => d.rate) : data.map((d) => d.count),
        marker: {
          color: data.map((d) => d.color || '#8B9F4F'),
          line: { width: 0 },
        },
        text: showPercent
          ? data.map((d) => `${d.rate.toFixed(1)}%`)
          : data.map((d) => String(d.count)),
        textposition: 'outside' as const,
        textfont: { size: 11, color: '#2C3E50', family: 'Inter, system-ui, sans-serif' },
        hovertemplate: data.map(
          (d) =>
            `<b>${d.name.replace(/_/g, ' ')}</b><br>Count: ${d.count}<br>Rate: ${d.rate.toFixed(1)}%<extra></extra>`
        ),
      },
    ];
  }, [data, showPercent]);

  const maxVal = useMemo(() => {
    const values = showPercent ? data.map((d) => d.rate) : data.map((d) => d.count);
    return Math.max(...values, 0);
  }, [data, showPercent]);

  const layout = useMemo(
    () => ({
      margin: { l: 40, r: 20, t: 24, b: 80 },
      xaxis: {
        tickangle: -30 as const,
        zeroline: false,
        showline: true,
        linecolor: 'rgba(0,0,0,0.1)',
        tickfont: { size: 10, color: '#7F8C8D', family: 'Inter, system-ui, sans-serif' },
        showgrid: false,
      },
      yaxis: {
        zeroline: false,
        showline: true,
        linecolor: 'rgba(0,0,0,0.1)',
        gridcolor: 'rgba(0,0,0,0.04)',
        tickfont: { size: 10, color: '#7F8C8D', family: 'Inter, system-ui, sans-serif' },
        title: showPercent ? { text: '%', font: { size: 10, color: '#7F8C8D' } } : undefined,
        range: [0, maxVal * 1.18],
      },
      bargap: 0.3,
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: 'Inter, system-ui, sans-serif' },
    }),
    [showPercent]
  );

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-muted">
        No data available
      </div>
    );
  }

  return <PlotlyChart data={chartData} layout={layout} />;
}
