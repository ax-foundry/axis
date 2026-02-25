'use client';

import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';

import type { SignalsChartDataPoint } from '@/types';

interface HorizontalBarChartProps {
  data: SignalsChartDataPoint[];
  title?: string;
}

export function HorizontalBarChart({ data }: HorizontalBarChartProps) {
  const chartData = useMemo(() => {
    if (data.length === 0) return [];
    // Reverse so highest is at top
    const reversed = [...data].reverse();
    return [
      {
        type: 'bar' as const,
        orientation: 'h' as const,
        y: reversed.map((d) => d.name.replace(/_/g, ' ')),
        x: reversed.map((d) => d.count),
        marker: {
          color: reversed.map((d) => d.color || '#8B9F4F'),
          line: { width: 0 },
        },
        text: reversed.map((d) => String(d.count)),
        textposition: 'outside' as const,
        textfont: { size: 11, color: '#2C3E50', family: 'Inter, system-ui, sans-serif' },
        hovertemplate: reversed.map(
          (d) =>
            `<b>${d.name.replace(/_/g, ' ')}</b><br>Count: ${d.count}<br>Rate: ${d.rate.toFixed(1)}%<extra></extra>`
        ),
      },
    ];
  }, [data]);

  const layout = useMemo(
    () => ({
      margin: { l: 120, r: 50, t: 5, b: 30 },
      xaxis: {
        zeroline: false,
        showline: true,
        linecolor: 'rgba(0,0,0,0.1)',
        gridcolor: 'rgba(0,0,0,0.04)',
        tickfont: { size: 10, color: '#7F8C8D', family: 'Inter, system-ui, sans-serif' },
      },
      yaxis: {
        zeroline: false,
        showline: false,
        tickfont: { size: 10, color: '#2C3E50', family: 'Inter, system-ui, sans-serif' },
        automargin: true,
      },
      bargap: 0.25,
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: 'Inter, system-ui, sans-serif' },
    }),
    []
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
