'use client';

import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { Colors } from '@/types';

interface MetricBreakdownItem {
  name: string;
  passRate: number;
  avg: number;
  count: number;
  byGroup?: Record<
    string,
    {
      passRate: number;
      avg: number;
      count: number;
    }
  >;
}

interface MetricBreakdownChartProps {
  data: MetricBreakdownItem[];
  showByGroup?: boolean;
  groupBy?: string;
}

export function MetricBreakdownChart({
  data,
  showByGroup = false,
  groupBy,
}: MetricBreakdownChartProps) {
  const chartData = useMemo(() => {
    if (data.length === 0) return [];

    // Clean up metric names for display - truncate if too long
    const labels = data.map((m) => {
      const name = m.name.replace(/_score$/, '');
      return name.length > 15 ? name.slice(0, 12) + '...' : name;
    });

    if (showByGroup && groupBy && data[0]?.byGroup) {
      // Show grouped bars
      const groups = Object.keys(data[0].byGroup);
      const groupColors = [Colors.primary, Colors.warning, Colors.error, Colors.success];

      return groups.map((group, groupIndex) => ({
        type: 'bar' as const,
        name: group,
        y: labels,
        x: data.map((m) => m.byGroup?.[group]?.passRate ?? 0),
        orientation: 'h' as const,
        marker: {
          color: groupColors[groupIndex % groupColors.length],
          opacity: 0.8,
          line: { color: 'white', width: 1 },
        },
        hovertemplate:
          `<b>${group}</b><br>` + '%{y}<br>' + 'Pass Rate: <b>%{x:.1f}%</b><extra></extra>',
      }));
    }

    // Single bar chart with gradient based on pass rate
    const colors = data.map((m) => {
      if (m.passRate >= 70) return Colors.success;
      if (m.passRate >= 50) return Colors.warning;
      return Colors.error;
    });

    return [
      {
        type: 'bar' as const,
        y: labels,
        x: data.map((m) => m.passRate),
        orientation: 'h' as const,
        marker: {
          color: colors,
          opacity: 0.85,
          line: { color: 'white', width: 1 },
        },
        text: data.map((m) => `${m.passRate.toFixed(0)}%`),
        textposition: 'inside' as const,
        textfont: { color: 'white', size: 11, family: 'Inter, system-ui' },
        insidetextanchor: 'end' as const,
        hovertemplate:
          '<b>%{y}</b><br>' +
          '━━━━━━━━━━━━<br>' +
          'Pass Rate: <b>%{x:.1f}%</b><br>' +
          'Avg Score: %{customdata[0]:.3f}<br>' +
          'Samples: %{customdata[1]}<extra></extra>',
        customdata: data.map((m) => [m.avg, m.count]),
      },
    ];
  }, [data, showByGroup, groupBy]);

  const layout = useMemo(() => {
    const shapes: Partial<Plotly.Shape>[] = [
      // 70% threshold line (Good)
      {
        type: 'line',
        x0: 70,
        x1: 70,
        y0: -0.5,
        y1: data.length - 0.5,
        line: { color: Colors.success, width: 1.5, dash: 'dash' },
      },
      // 50% threshold line (Pass)
      {
        type: 'line',
        x0: 50,
        x1: 50,
        y0: -0.5,
        y1: data.length - 0.5,
        line: { color: Colors.warning, width: 1.5, dash: 'dash' },
      },
    ];

    // Annotations for thresholds
    const annotations: Partial<Plotly.Annotations>[] = [
      {
        x: 70,
        y: data.length - 0.5,
        yref: 'y',
        text: 'Good',
        showarrow: false,
        font: { size: 9, color: Colors.success },
        yanchor: 'bottom',
        bgcolor: 'rgba(255,255,255,0.8)',
      },
      {
        x: 50,
        y: data.length - 0.5,
        yref: 'y',
        text: 'Pass',
        showarrow: false,
        font: { size: 9, color: Colors.warning },
        yanchor: 'bottom',
        bgcolor: 'rgba(255,255,255,0.8)',
      },
    ];

    return {
      showlegend: showByGroup && data[0]?.byGroup !== undefined,
      legend: {
        orientation: 'h' as const,
        y: -0.2,
        x: 0.5,
        xanchor: 'center' as const,
        font: { size: 10, color: '#666' },
        bgcolor: 'rgba(255,255,255,0.8)',
      },
      xaxis: {
        title: { text: 'Pass Rate (%)', font: { size: 11, color: '#666' } },
        range: [0, 100],
        gridcolor: 'rgba(0,0,0,0.05)',
        tickfont: { size: 10, color: '#666' },
        ticksuffix: '%',
        dtick: 25,
        zeroline: false,
        showline: true,
        linecolor: 'rgba(0,0,0,0.1)',
      },
      yaxis: {
        automargin: true,
        tickfont: { size: 11, color: '#444' },
        ticklen: 0,
      },
      barmode: 'group' as const,
      bargap: 0.25,
      shapes,
      annotations,
      margin: { l: 90, r: 20, t: 15, b: 45 },
      plot_bgcolor: 'rgba(0,0,0,0)',
      paper_bgcolor: 'rgba(0,0,0,0)',
      hoverlabel: {
        bgcolor: 'white',
        bordercolor: 'rgba(0,0,0,0.1)',
        font: { size: 11, family: 'Inter, system-ui' },
      },
    };
  }, [data, showByGroup]);

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-muted">
        No metric data available
      </div>
    );
  }

  return <PlotlyChart data={chartData} layout={layout} />;
}
