'use client';

import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { useChartColors, useColors } from '@/lib/theme';

import type { MonitoringTrendData } from '@/types';

interface ScoreTrendChartProps {
  data: MonitoringTrendData[];
  selectedMetrics?: string[];
  showPercentileBands?: boolean;
  goodThreshold?: number;
  passThreshold?: number;
}

// Format date for display based on data range
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ScoreTrendChart({
  data,
  selectedMetrics,
  showPercentileBands = true,
  goodThreshold = 0.7,
  passThreshold = 0.5,
}: ScoreTrendChartProps) {
  const chartColors = useChartColors();
  const themeColors = useColors();

  const chartData = useMemo(() => {
    if (data.length === 0) return [];

    // Group by metric
    const metricGroups = new Map<string, MonitoringTrendData[]>();
    data.forEach((point) => {
      if (selectedMetrics && !selectedMetrics.includes(point.metric)) {
        return;
      }
      const existing = metricGroups.get(point.metric) || [];
      existing.push(point);
      metricGroups.set(point.metric, existing);
    });

    const traces: Plotly.Data[] = [];
    let colorIndex = 0;

    metricGroups.forEach((points, metric) => {
      // Sort by timestamp
      const sorted = [...points].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const timestamps = sorted.map((p) => new Date(p.timestamp));
      const formattedTimes = sorted.map((p) => formatTimestamp(p.timestamp));
      const avgValues = sorted.map((p) => p.avg);
      const p95Values = sorted.map((p) => p.p95);
      const p50Values = sorted.map((p) => p.p50);
      const counts = sorted.map((p) => p.count);
      const color = chartColors[colorIndex % chartColors.length];
      const metricLabel = metric.replace(/_score$/, '');

      // Add P95 band (upper boundary)
      if (showPercentileBands) {
        traces.push({
          type: 'scatter' as const,
          mode: 'lines' as const,
          name: `${metricLabel} P95`,
          x: timestamps,
          y: p95Values,
          line: { color: 'transparent', width: 0 },
          showlegend: false,
          hoverinfo: 'skip' as const,
        });

        // Add P50 band (fill to P95)
        traces.push({
          type: 'scatter' as const,
          mode: 'lines' as const,
          name: `${metricLabel} P50-P95`,
          x: timestamps,
          y: p50Values,
          line: { color: 'transparent', width: 0 },
          fill: 'tonexty' as const,
          fillcolor: `${color}15`,
          showlegend: false,
          hoverinfo: 'skip' as const,
        });
      }

      // Main average line with gradient effect
      traces.push({
        type: 'scatter' as const,
        mode: 'lines+markers' as const,
        name: metricLabel,
        x: timestamps,
        y: avgValues,
        line: {
          color,
          width: 3,
          shape: 'spline' as const,
        },
        marker: {
          size: 8,
          color,
          line: { color: 'white', width: 2 },
        },
        customdata: sorted.map((p, i) => [formattedTimes[i], p.p50, p.p95, p.p99, counts[i]]),
        hovertemplate:
          `<b>${metricLabel}</b>  ·  %{customdata[0]}<br>` +
          'Avg <b>%{y:.3f}</b>  ·  P50 %{customdata[1]:.3f}  ·  P95 %{customdata[2]:.3f}<br>' +
          'P99 %{customdata[3]:.3f}  ·  n=%{customdata[4]}' +
          '<extra></extra>',
      });

      colorIndex++;
    });

    return traces;
  }, [data, selectedMetrics, showPercentileBands, chartColors]);

  const layout = useMemo(() => {
    // Add threshold reference lines
    const shapes: Partial<Plotly.Shape>[] = [
      // Good threshold line
      {
        type: 'line',
        x0: 0,
        x1: 1,
        xref: 'paper',
        y0: goodThreshold,
        y1: goodThreshold,
        line: { color: themeColors.success, width: 1.5, dash: 'dash' },
      },
      // Warning threshold line
      {
        type: 'line',
        x0: 0,
        x1: 1,
        xref: 'paper',
        y0: passThreshold,
        y1: passThreshold,
        line: { color: themeColors.warning, width: 1.5, dash: 'dash' },
      },
    ];

    // Add annotations for thresholds
    const annotations: Partial<Plotly.Annotations>[] = [
      {
        x: 1.02,
        xref: 'paper',
        y: goodThreshold,
        text: 'Good',
        showarrow: false,
        font: { size: 9, color: themeColors.success },
        xanchor: 'left',
      },
      {
        x: 1.02,
        xref: 'paper',
        y: passThreshold,
        text: 'Pass',
        showarrow: false,
        font: { size: 9, color: themeColors.warning },
        xanchor: 'left',
      },
    ];

    return {
      showlegend: true,
      legend: {
        orientation: 'h' as const,
        y: -0.2,
        x: 0.5,
        xanchor: 'center' as const,
        font: { size: 11, color: themeColors.textMuted },
        bgcolor: 'rgba(255,255,255,0.8)',
        bordercolor: 'rgba(0,0,0,0.1)',
        borderwidth: 1,
      },
      xaxis: {
        title: { text: '', font: { size: 12 } },
        gridcolor: 'rgba(0,0,0,0.05)',
        tickfont: { size: 10, color: themeColors.textMuted },
        tickformat: '%b %d\n%H:%M',
        tickangle: 0,
        nticks: 8,
        showgrid: true,
        zeroline: false,
        showline: true,
        linecolor: 'rgba(0,0,0,0.1)',
      },
      yaxis: {
        title: { text: 'Score', font: { size: 12, color: themeColors.textMuted } },
        range: [0, 1.05],
        gridcolor: 'rgba(0,0,0,0.05)',
        tickfont: { size: 10, color: themeColors.textMuted },
        tickformat: '.2f',
        showgrid: true,
        zeroline: false,
        showline: true,
        linecolor: 'rgba(0,0,0,0.1)',
      },
      margin: { l: 50, r: 45, t: 10, b: 70 },
      hovermode: 'closest' as const,
      hoverlabel: {
        bgcolor: 'white',
        bordercolor: 'rgba(0,0,0,0.12)',
        font: { size: 11, family: 'Inter, system-ui, sans-serif', color: themeColors.textPrimary },
        align: 'left' as const,
      },
      shapes,
      annotations,
      plot_bgcolor: 'rgba(0,0,0,0)',
      paper_bgcolor: 'rgba(0,0,0,0)',
    };
  }, [themeColors, goodThreshold, passThreshold]);

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-muted">
        No trend data available
      </div>
    );
  }

  return <PlotlyChart data={chartData} layout={layout} />;
}
