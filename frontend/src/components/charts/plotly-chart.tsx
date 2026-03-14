'use client';

import { Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';

import { useChartColors, useColors, useDarkMode } from '@/lib/theme';

// Dynamic import for Plotly to avoid SSR issues
const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
    </div>
  ),
});

interface PlotlyChartProps {
  data: Plotly.Data[];
  layout?: Partial<Plotly.Layout>;
  config?: Partial<Plotly.Config>;
  className?: string;
  style?: React.CSSProperties;
}

const defaultConfig: Partial<Plotly.Config> = {
  responsive: true,
  displayModeBar: false,
  displaylogo: false,
  staticPlot: false,
};

export function PlotlyChart({ data, layout, config, className = '', style }: PlotlyChartProps) {
  const chartColors = useChartColors();
  const colors = useColors();
  const isDark = useDarkMode();

  const mergedLayout = useMemo(
    () => ({
      autosize: true,
      margin: { l: 50, r: 30, t: 30, b: 50 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: {
        family: 'Inter, system-ui, sans-serif',
        color: colors.textPrimary,
      },
      colorway: chartColors,
      hoverlabel: {
        bgcolor: isDark ? '#1a1d27' : '#fff',
        bordercolor: colors.primary,
        font: { color: colors.textPrimary },
      },
      legend: {
        bgcolor: isDark ? '#1a1d27' : 'rgba(255,255,255,0.9)',
        bordercolor: isDark ? '#2d3148' : 'rgba(0,0,0,0.08)',
        borderwidth: 1,
        font: { color: colors.textPrimary, size: 11 },
      },
      ...layout,
    }),
    [layout, chartColors, colors, isDark]
  );

  const mergedConfig = useMemo(() => ({ ...defaultConfig, ...config }), [config]);

  // Guard against empty or invalid data
  if (!data || data.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-text-muted">
        No data to display
      </div>
    );
  }

  return (
    <Plot
      data={data}
      layout={mergedLayout}
      config={mergedConfig}
      className={className}
      style={{ width: '100%', height: '100%', ...style }}
      useResizeHandler
    />
  );
}
