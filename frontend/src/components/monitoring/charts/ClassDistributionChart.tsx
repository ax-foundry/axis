'use client';

import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { ChartColors } from '@/types';

import type { MonitoringClassDistribution } from '@/types';

interface ClassDistributionChartProps {
  data: MonitoringClassDistribution[];
  metric: string;
  chartType?: 'violin' | 'box';
  showStats?: boolean;
}

export function ClassDistributionChart({
  data,
  metric,
  chartType = 'violin',
  showStats = true,
}: ClassDistributionChartProps) {
  const chartData = useMemo(() => {
    if (data.length === 0) return [];

    return data.map((group, index) => {
      const color = ChartColors[index % ChartColors.length];

      if (chartType === 'violin') {
        return {
          type: 'violin' as const,
          y: group.values,
          name: group.group,
          box: { visible: true },
          meanline: { visible: true },
          line: { color },
          fillcolor: color,
          opacity: 0.7,
          hovertemplate:
            `<b>${group.group}</b><br>` +
            `Mean: ${group.stats.mean.toFixed(3)}<br>` +
            `Std: ${group.stats.std.toFixed(3)}<br>` +
            `Count: ${group.stats.count}<extra></extra>`,
        };
      } else {
        return {
          type: 'box' as const,
          y: group.values,
          name: group.group,
          marker: { color },
          boxmean: true,
          hovertemplate:
            `<b>${group.group}</b><br>` +
            `Mean: ${group.stats.mean.toFixed(3)}<br>` +
            `Median: ${group.stats.median.toFixed(3)}<br>` +
            `Count: ${group.stats.count}<extra></extra>`,
        };
      }
    });
  }, [data, chartType]);

  const layout = useMemo(
    () => ({
      showlegend: data.length > 1,
      legend: {
        orientation: 'h' as const,
        y: -0.2,
        x: 0.5,
        xanchor: 'center' as const,
        font: { size: 11 },
      },
      xaxis: {
        title: { text: 'Group', font: { size: 12 } },
        gridcolor: 'rgba(0,0,0,0.05)',
      },
      yaxis: {
        title: { text: metric.replace(/_score$/, ' Score'), font: { size: 12 } },
        range: [0, 1.05],
        gridcolor: 'rgba(0,0,0,0.05)',
      },
      violinmode: 'group' as const,
      margin: { l: 50, r: 30, t: 20, b: 80 },
      annotations: showStats
        ? data.map((group) => ({
            x: group.group,
            y: 1.02,
            text: `μ=${group.stats.mean.toFixed(2)}`,
            showarrow: false,
            font: { size: 9, color: '#666' },
          }))
        : [],
    }),
    [data, metric, showStats]
  );

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-muted">
        No distribution data available
      </div>
    );
  }

  return <PlotlyChart data={chartData} layout={layout} />;
}
