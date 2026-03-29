'use client';

import { Info, Loader2 } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { useKpiSegmentComparison } from '@/lib/hooks/useKpiData';
import { formatKpiChartValue, formatKpiValue } from '@/lib/kpi-format';
import { useColors } from '@/lib/theme';
import { useKpiStore } from '@/stores';

import type { KpiUnit } from '@/types';

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface KPISegmentComparisonChartProps {
  kpiName: string;
  displayName: string;
  unit: KpiUnit;
}

export function KPISegmentComparisonChart({
  kpiName,
  displayName,
  unit,
}: KPISegmentComparisonChartProps) {
  const { data, isLoading } = useKpiSegmentComparison(kpiName, true);
  const colors = useColors();
  const setDrillDownSegment = useKpiStore((s) => s.setDrillDownSegment);
  const setDrillDownOpen = useKpiStore((s) => s.setDrillDownOpen);

  const handleBarClick = useCallback(
    (event: Plotly.PlotMouseEvent) => {
      if (!data || !event.points[0]) return;
      const idx = event.points[0].pointIndex;
      const segment = data.segments[idx]?.segment;
      if (segment) {
        setDrillDownSegment(segment);
        setDrillDownOpen(true);
      }
    },
    [data, setDrillDownSegment, setDrillDownOpen]
  );

  const { traces, layout } = useMemo(() => {
    if (!data || data.segments.length === 0) return { traces: [], layout: {} };

    const segments = data.segments;
    const labels = segments.map((s) => `${s.segment} (${s.count.toLocaleString()})`);
    const values = segments.map((s) =>
      unit === 'percent' ? (formatKpiChartValue(s.agg_value, unit) ?? s.agg_value) : s.agg_value
    );

    // Intensity gradient per bar
    const maxVal = Math.max(...values);
    const barColors = values.map((v) => {
      const intensity = maxVal > 0 ? v / maxVal : 0;
      return hexToRgba(colors.primary, 0.45 + intensity * 0.45);
    });

    const t: Plotly.Data[] = [
      {
        type: 'bar' as const,
        orientation: 'h' as const,
        y: labels,
        x: values,
        marker: {
          color: barColors,
          line: { color: hexToRgba(colors.primaryDark, 0.5), width: 1 },
        },
        text: segments.map((s) => formatKpiValue(s.agg_value, unit)),
        textposition: 'outside' as const,
        textfont: { size: 10 },
        hovertemplate: '<b>%{y}</b><br>' + `${displayName}: <b>%{text}</b>` + '<extra></extra>',
      },
    ];

    const chartHeight = Math.max(200, segments.length * 40);

    const axisConfig = {
      showgrid: true,
      gridcolor: 'rgba(0,0,0,0.05)',
      zeroline: false,
      showline: true,
      linecolor: 'rgba(0,0,0,0.1)',
      tickfont: { size: 10 },
    };

    const l: Partial<Plotly.Layout> = {
      height: chartHeight,
      margin: { l: 200, r: 60, t: 10, b: 30 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: 'Inter, system-ui, sans-serif' },
      showlegend: false,
      xaxis: {
        ...axisConfig,
        showgrid: false,
        ...(unit === 'percent' ? { ticksuffix: '%', range: [0, 100] } : {}),
      },
      yaxis: {
        ...axisConfig,
        automargin: true,
        showgrid: false,
        showline: false,
      },
    };

    return { traces: t, layout: l };
  }, [data, unit, displayName, colors]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="ml-2 text-sm text-text-muted">Loading segment comparison...</span>
      </div>
    );
  }

  if (!data || data.segments.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-text-muted">No segment data available</div>
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-3 px-1 text-xs text-text-muted">
        <span>{data.aggregation === 'sum' ? 'Total count' : 'Average value'} per segment</span>
        <span className="flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
          <Info className="h-3 w-3" />
          Comparing all segments (segment filter not applied)
        </span>
      </div>
      <PlotlyChart data={traces} layout={layout} onClick={handleBarClick} />
    </div>
  );
}
