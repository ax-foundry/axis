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
  onClick?: (event: Plotly.PlotMouseEvent) => void;
}

const defaultConfig: Partial<Plotly.Config> = {
  responsive: true,
  displayModeBar: false,
  displaylogo: false,
  staticPlot: false,
};

export function PlotlyChart({
  data,
  layout,
  config,
  className = '',
  style,
  onClick,
}: PlotlyChartProps) {
  const chartColors = useChartColors();
  const colors = useColors();
  const isDark = useDarkMode();

  const mergedLayout = useMemo(() => {
    // Deep-merge axes and title so LLM additions don't wipe component styling defaults.
    const {
      xaxis: llmXaxis,
      yaxis: llmYaxis,
      title: llmTitle,
      font: llmFont,
      ...restLayout
    } = layout ?? {};

    const axisDefaults = {
      tickfont: { size: 10, color: colors.textPrimary },
      automargin: true,
      zeroline: false,
      showline: true,
      linecolor: isDark ? 'rgba(255,255,255,0.15)' : '#7F8C8D',
      linewidth: 1.5,
      gridcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(226,232,240,0.6)',
      gridwidth: 0.8,
      mirror: false,
    };

    // title can arrive as a plain string or an object — normalise to object before merging.
    const titleBase = { font: { size: 13, color: '#1E3A5F' }, x: 0.02, xanchor: 'left' as const };
    const mergedTitle =
      llmTitle == null
        ? undefined
        : typeof llmTitle === 'string'
          ? { ...titleBase, text: llmTitle }
          : { ...titleBase, ...(llmTitle as object) };

    return {
      autosize: true,
      margin: { l: 70, r: 55, t: 65, b: 80 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: {
        family: 'Inter, system-ui, sans-serif',
        color: colors.textPrimary,
        size: 11,
        ...(llmFont as object),
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
        font: { color: colors.textPrimary, size: 10 },
      },
      // restLayout first, then axis deep-merges last so they always win over LLM full overrides.
      ...restLayout,
      ...(mergedTitle !== undefined && { title: mergedTitle }),
      xaxis: { ...axisDefaults, ...(llmXaxis as object) },
      yaxis: { ...axisDefaults, ...(llmYaxis as object) },
    };
  }, [layout, chartColors, colors, isDark]);

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
      onClick={onClick}
    />
  );
}
