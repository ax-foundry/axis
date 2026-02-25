'use client';

import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';

import type { SignalsChartDataPoint } from '@/types';

interface DonutChartProps {
  data: SignalsChartDataPoint[];
  title?: string;
}

export function DonutChart({ data }: DonutChartProps) {
  const total = useMemo(() => data.reduce((sum, d) => sum + d.count, 0), [data]);

  const chartData = useMemo(() => {
    if (data.length === 0) return [];
    return [
      {
        type: 'pie' as const,
        labels: data.map((d) => d.name.replace(/_/g, ' ')),
        values: data.map((d) => d.count),
        hole: 0.55,
        marker: {
          colors: data.map((d) => d.color || '#8B9F4F'),
          line: { color: '#ffffff', width: 2 },
        },
        textposition: 'outside' as const,
        textinfo: 'label+percent' as const,
        textfont: { size: 10, color: '#2C3E50', family: 'Inter, system-ui, sans-serif' },
        hovertemplate: data.map(
          (d) =>
            `<b>${d.name.replace(/_/g, ' ')}</b><br>Count: ${d.count}<br>Rate: ${d.rate.toFixed(1)}%<extra></extra>`
        ),
        pull: data.map(() => 0),
        sort: false,
      },
    ];
  }, [data]);

  const layout = useMemo(
    () => ({
      margin: { l: 10, r: 10, t: 5, b: 20 },
      showlegend: false,
      annotations: [
        {
          text: `<b>${total}</b>`,
          showarrow: false,
          font: { size: 18, color: '#2C3E50', family: 'Inter, system-ui, sans-serif' },
        },
      ],
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: 'Inter, system-ui, sans-serif' },
    }),
    [total]
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
