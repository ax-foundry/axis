'use client';

import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';

import type { KpiCompositionChartConfig, KpiTrendPoint } from '@/types';

interface KPICompositionTimeSeriesProps {
  config: KpiCompositionChartConfig;
  trendData: KpiTrendPoint[];
  isLoading: boolean;
}

export function KPICompositionTimeSeries({
  config,
  trendData,
  isLoading,
}: KPICompositionTimeSeriesProps) {
  const { traces, layout } = useMemo(() => {
    // Group trend data by date
    const byDate = new Map<string, Map<string, number>>();
    for (const pt of trendData) {
      if (!byDate.has(pt.date)) byDate.set(pt.date, new Map());
      if (pt.value !== null) byDate.get(pt.date)!.set(pt.kpi_name, pt.value);
    }

    const dates = Array.from(byDate.keys()).sort();

    const t: Plotly.Data[] = config.kpis.map((entry) => {
      const values = dates.map((d) => {
        const row = byDate.get(d);
        return row?.get(entry.kpi_name) ?? 0;
      });

      return {
        x: dates,
        y: values,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: entry.label,
        stackgroup: 'one',
        groupnorm: 'percent' as const,
        fillcolor: `${entry.color}40`,
        line: { color: entry.color, width: 1.5, shape: 'spline' as const },
        hovertemplate: `<b>${entry.label}</b><br>%{x}<br>%{y:.1f}%<extra></extra>`,
      };
    });

    // Add remainder trace if configured
    if (config.show_remainder) {
      const remainderValues = dates.map((d) => {
        const row = byDate.get(d);
        if (!row) return 0;
        let sum = 0;
        for (const entry of config.kpis) {
          sum += row.get(entry.kpi_name) ?? 0;
        }
        return Math.max(0, 1 - sum);
      });

      const label = config.remainder_label ?? 'Other';
      const color = config.remainder_color ?? '#6B7280';

      t.push({
        x: dates,
        y: remainderValues,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: label,
        stackgroup: 'one',
        groupnorm: 'percent' as const,
        fillcolor: `${color}40`,
        line: { color, width: 1.5, shape: 'spline' as const },
        hovertemplate: `<b>${label}</b><br>%{x}<br>%{y:.1f}%<extra></extra>`,
      });
    }

    const axisConfig = {
      showgrid: true,
      gridcolor: 'rgba(0,0,0,0.05)',
      zeroline: false,
      showline: true,
      linecolor: 'rgba(0,0,0,0.1)',
      tickfont: { size: 10 },
    };

    const l: Partial<Plotly.Layout> = {
      height: 280,
      margin: { l: 45, r: 20, t: 10, b: 35 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: 'Inter, system-ui, sans-serif' },
      showlegend: true,
      legend: { orientation: 'h' as const, x: 0, y: -0.15, font: { size: 10 } },
      xaxis: { ...axisConfig, showgrid: false },
      yaxis: {
        ...axisConfig,
        automargin: true,
        ticksuffix: '%',
        range: [0, 100],
      },
    };

    return { traces: t, layout: l };
  }, [config, trendData]);

  if (isLoading) {
    return (
      <div className="flex h-[280px] items-center justify-center">
        <span className="text-sm text-text-muted">Loading trends...</span>
      </div>
    );
  }

  if (trendData.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center">
        <span className="text-sm text-text-muted">No trend data available</span>
      </div>
    );
  }

  return (
    <div className="px-2 py-2">
      <PlotlyChart data={traces} layout={layout} />
    </div>
  );
}
