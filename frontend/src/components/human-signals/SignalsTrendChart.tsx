'use client';

import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';

const TREND_COLORS = [
  '#8B9F4F',
  '#D4AF37',
  '#B8C5D3',
  '#E74C3C',
  '#F39C12',
  '#A4B86C',
  '#6B7A3A',
  '#34495E',
];

interface SignalsTrendChartProps {
  data: { date: string; values: Record<string, number> }[];
  signals: string[];
}

export function SignalsTrendChart({ data, signals }: SignalsTrendChartProps) {
  const chartData = useMemo(() => {
    if (data.length === 0 || signals.length === 0) return [];

    return signals.map((signal, i) => ({
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      name: signal,
      x: data.map((d) => d.date),
      y: data.map((d) => d.values[signal] ?? 0),
      line: { shape: 'spline' as const, color: TREND_COLORS[i % TREND_COLORS.length], width: 2 },
      marker: { size: 4 },
      hovertemplate: `<b>${signal}</b><br>Week: %{x}<br>Rate: %{y:.1f}%<extra></extra>`,
    }));
  }, [data, signals]);

  const layout = useMemo(
    () => ({
      margin: { l: 45, r: 20, t: 5, b: 50 },
      xaxis: {
        zeroline: false,
        showline: true,
        linecolor: 'rgba(0,0,0,0.1)',
        gridcolor: 'rgba(0,0,0,0.04)',
        tickfont: { size: 10, color: '#7F8C8D', family: 'Inter, system-ui, sans-serif' },
        tickangle: -30 as const,
      },
      yaxis: {
        zeroline: false,
        showline: true,
        linecolor: 'rgba(0,0,0,0.1)',
        gridcolor: 'rgba(0,0,0,0.04)',
        tickfont: { size: 10, color: '#7F8C8D', family: 'Inter, system-ui, sans-serif' },
        title: { text: '%', font: { size: 10, color: '#7F8C8D' } },
        range: [0, 105],
      },
      legend: {
        orientation: 'h' as const,
        y: -0.25,
        x: 0.5,
        xanchor: 'center' as const,
        font: { size: 10, family: 'Inter, system-ui, sans-serif' },
      },
      hovermode: 'x unified' as const,
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: 'Inter, system-ui, sans-serif' },
    }),
    []
  );

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-muted">
        No trend data available
      </div>
    );
  }

  return <PlotlyChart data={chartData} layout={layout} />;
}
