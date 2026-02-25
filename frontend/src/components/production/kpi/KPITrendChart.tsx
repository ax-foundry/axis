'use client';

import { X } from 'lucide-react';
import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { formatDuration } from '@/lib/human-signals-utils';
import { useColors } from '@/lib/theme';

import type { KpiTrendPoint, KpiUnit } from '@/types';

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface KPITrendChartProps {
  displayName: string;
  unit: KpiUnit;
  data: KpiTrendPoint[];
  onClose?: () => void;
}

function unitSuffix(unit: KpiUnit): string {
  switch (unit) {
    case 'percent':
      return '%';
    case 'seconds':
      return 's';
    default:
      return '';
  }
}

export function KPITrendChart({ displayName, unit, data, onClose }: KPITrendChartProps) {
  const colors = useColors();

  const { traces, layout } = useMemo(() => {
    const dates = data.map((d) => d.date);
    const values = data.map((d) =>
      unit === 'percent' && d.value !== null ? d.value * 100 : d.value
    );
    const avg7d = data.map((d) =>
      unit === 'percent' && d.avg_7d !== null ? d.avg_7d * 100 : d.avg_7d
    );
    const avg30d = data.map((d) =>
      unit === 'percent' && d.avg_30d !== null ? d.avg_30d * 100 : d.avg_30d
    );

    const formatHover = (v: number | null) => {
      if (v === null) return '--';
      if (unit === 'percent') return `${(v * 100).toFixed(1)}%`;
      if (unit === 'seconds') return formatDuration(v);
      if (unit === 'count') return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
      return v.toFixed(2);
    };

    const customData = data.map((d) => [formatHover(d.value), d.count, d.date]);

    const t: Plotly.Data[] = [
      {
        x: dates,
        y: values,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'Daily',
        line: { color: colors.primary, width: 2, shape: 'spline' as const },
        fill: 'tozeroy' as const,
        fillcolor: hexToRgba(colors.primary, 0.1),
        customdata: customData,
        hovertemplate:
          '<b>%{customdata[2]}</b><br>Value: %{customdata[0]}<br>Records: %{customdata[1]}<extra></extra>',
      },
      {
        x: dates,
        y: avg7d,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: '7d Avg',
        line: {
          color: colors.primaryLight,
          width: 1.5,
          dash: 'dash' as const,
          shape: 'spline' as const,
        },
        hoverinfo: 'skip' as const,
      },
      {
        x: dates,
        y: avg30d,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: '30d Avg',
        line: {
          color: colors.accentSilver,
          width: 1.5,
          dash: 'dot' as const,
          shape: 'spline' as const,
        },
        hoverinfo: 'skip' as const,
      },
    ];

    const axisConfig = {
      showgrid: true,
      gridcolor: 'rgba(0,0,0,0.05)',
      zeroline: false,
      showline: true,
      linecolor: 'rgba(0,0,0,0.1)',
      tickfont: { size: 10 },
    };

    const suffix = unitSuffix(unit);

    const l: Partial<Plotly.Layout> = {
      height: 280,
      margin: { l: 55, r: 20, t: 10, b: 35 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: 'Inter, system-ui, sans-serif' },
      showlegend: true,
      legend: {
        orientation: 'h' as const,
        x: 0,
        y: -0.15,
        font: { size: 10 },
      },
      xaxis: { ...axisConfig, showgrid: false },
      yaxis: {
        ...axisConfig,
        automargin: true,
        ...(unit === 'seconds' ? { visible: false } : suffix ? { ticksuffix: suffix } : {}),
      },
    };

    return { traces: t, layout: l };
  }, [data, unit, colors]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h3 className="text-sm font-medium text-text-primary">{displayName}</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded p-1 text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="px-2 py-2">
        <PlotlyChart data={traces} layout={layout} />
      </div>
    </div>
  );
}
