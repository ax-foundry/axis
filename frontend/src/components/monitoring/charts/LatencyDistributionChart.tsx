'use client';

import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { useChartColors, useColors } from '@/lib/theme';

interface LatencyDistributionChartProps {
  histogram: {
    counts: number[];
    edges: number[];
  };
  percentiles: {
    p50: number;
    p95: number;
    p99: number;
  };
  byGroup?: Record<
    string,
    {
      counts: number[];
      percentiles: {
        p50: number;
        p95: number;
        p99: number;
      };
    }
  >;
  showPercentileMarkers?: boolean;
}

// Helper to convert hex color to rgba
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function LatencyDistributionChart({
  histogram,
  percentiles,
  byGroup,
  showPercentileMarkers = true,
}: LatencyDistributionChartProps) {
  const chartColors = useChartColors();
  const themeColors = useColors();

  const chartData = useMemo(() => {
    if (!histogram.counts.length) return [];

    const traces: Plotly.Data[] = [];

    // Calculate bin centers from edges
    const binCenters = histogram.edges.slice(0, -1).map((edge, i) => {
      return (edge + histogram.edges[i + 1]) / 2;
    });

    if (byGroup && Object.keys(byGroup).length > 0) {
      let colorIndex = 0;
      Object.entries(byGroup).forEach(([group, data]) => {
        const color = chartColors[colorIndex % chartColors.length];
        traces.push({
          type: 'bar' as const,
          name: group,
          x: binCenters,
          y: data.counts,
          marker: {
            color: hexToRgba(color, 0.8),
            line: { color, width: 1.5 },
          },
          hovertemplate:
            `<b>${group}</b><br>` +
            'Latency: <b>%{x:.1f}s</b><br>' +
            'Count: <b>%{y}</b>' +
            '<extra></extra>',
        });
        colorIndex++;
      });
    } else {
      // Single histogram — intensity gradient using theme primary
      const maxCount = Math.max(...histogram.counts);
      const colors = histogram.counts.map((count) => {
        const intensity = count / maxCount;
        return hexToRgba(themeColors.primary, 0.35 + intensity * 0.55);
      });

      traces.push({
        type: 'bar' as const,
        name: 'Latency',
        x: binCenters,
        y: histogram.counts,
        marker: {
          color: colors,
          line: { color: hexToRgba(themeColors.primaryDark, 0.6), width: 1 },
        },
        hovertemplate: 'Latency: <b>%{x:.1f}s</b><br>' + 'Count: <b>%{y}</b>' + '<extra></extra>',
      });
    }

    return traces;
  }, [histogram, byGroup, chartColors, themeColors]);

  const layout = useMemo(() => {
    const shapes: Partial<Plotly.Shape>[] = [];
    const annotations: Partial<Plotly.Annotations>[] = [];
    const maxCount = Math.max(...histogram.counts, 1);
    const fontFamily = 'Inter, system-ui, sans-serif';

    if (showPercentileMarkers && histogram.counts.length > 0) {
      const markers: { value: number; label: string; color: string }[] = [
        { value: percentiles.p50, label: 'P50', color: themeColors.success },
        { value: percentiles.p95, label: 'P95', color: themeColors.warning },
        { value: percentiles.p99, label: 'P99', color: themeColors.error },
      ];

      markers.forEach(({ value, label, color }) => {
        shapes.push({
          type: 'line',
          x0: value,
          x1: value,
          y0: 0,
          y1: maxCount * 1.15,
          line: { color, width: 1.5, dash: 'dot' },
        });
        annotations.push({
          x: value,
          y: maxCount * 1.18,
          text: `<b>${label}</b>`,
          showarrow: false,
          font: { size: 10, color, family: fontFamily },
          bgcolor: 'rgba(255,255,255,0.85)',
          borderpad: 3,
        });
      });
    }

    // Summary annotation — top-right, styled as a compact legend
    annotations.push({
      x: 1,
      y: 1,
      xref: 'paper',
      yref: 'paper',
      text:
        `<span style="color:${themeColors.success}"><b>P50</b> ${percentiles.p50.toFixed(1)}s</span>` +
        `  <span style="color:${themeColors.warning}"><b>P95</b> ${percentiles.p95.toFixed(1)}s</span>` +
        `  <span style="color:${themeColors.error}"><b>P99</b> ${percentiles.p99.toFixed(1)}s</span>`,
      showarrow: false,
      font: { size: 10, color: themeColors.textMuted, family: fontFamily },
      xanchor: 'right',
      yanchor: 'top',
      bgcolor: 'rgba(255,255,255,0.85)',
      bordercolor: 'rgba(0,0,0,0.06)',
      borderwidth: 1,
      borderpad: 5,
    });

    const hasGroups = byGroup && Object.keys(byGroup).length > 0;

    return {
      showlegend: !!hasGroups,
      legend: {
        orientation: 'h' as const,
        y: -0.25,
        x: 0.5,
        xanchor: 'center' as const,
        font: { size: 10, color: themeColors.textMuted, family: fontFamily },
        bgcolor: 'transparent',
        bordercolor: 'rgba(0,0,0,0.06)',
        borderwidth: 1,
      },
      xaxis: {
        title: {
          text: 'Latency (s)',
          font: { size: 11, color: themeColors.textMuted, family: fontFamily },
          standoff: 12,
        },
        gridcolor: 'rgba(0,0,0,0.04)',
        tickfont: { size: 10, color: themeColors.textMuted, family: fontFamily },
        tickangle: 0,
        zeroline: false,
        showline: true,
        linecolor: 'rgba(0,0,0,0.08)',
        showgrid: true,
      },
      yaxis: {
        title: {
          text: 'Frequency',
          font: { size: 11, color: themeColors.textMuted, family: fontFamily },
          standoff: 8,
        },
        gridcolor: 'rgba(0,0,0,0.04)',
        tickfont: { size: 10, color: themeColors.textMuted, family: fontFamily },
        zeroline: false,
        showline: true,
        linecolor: 'rgba(0,0,0,0.08)',
        showgrid: true,
        range: [0, maxCount * 1.25],
      },
      barmode: 'group' as const,
      bargap: 0.08,
      shapes,
      annotations,
      margin: { l: 50, r: 15, t: 15, b: 60 },
      plot_bgcolor: 'rgba(0,0,0,0)',
      paper_bgcolor: 'rgba(0,0,0,0)',
      hoverlabel: {
        bgcolor: 'white',
        bordercolor: themeColors.primary,
        font: { size: 11, family: fontFamily, color: themeColors.textPrimary },
      },
    };
  }, [histogram.counts, percentiles, showPercentileMarkers, byGroup, themeColors]);

  if (!histogram.counts.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-muted">
        No latency data available
      </div>
    );
  }

  return <PlotlyChart data={chartData} layout={layout} />;
}
