'use client';

import { Loader2 } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { useKpiDistribution } from '@/lib/hooks/useKpiData';
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

interface KPIDistributionChartProps {
  kpiName: string;
  displayName: string;
  unit: KpiUnit;
}

export function KPIDistributionChart({ kpiName, displayName, unit }: KPIDistributionChartProps) {
  const { data, isLoading } = useKpiDistribution(kpiName, true);
  const colors = useColors();
  const setDrillDownValueRange = useKpiStore((s) => s.setDrillDownValueRange);
  const setDrillDownOpen = useKpiStore((s) => s.setDrillDownOpen);

  const handleBarClick = useCallback(
    (event: Plotly.PlotMouseEvent) => {
      if (!data || !event.points[0]) return;
      const idx = event.points[0].pointIndex;
      if (data.is_binary && data.binary_counts) {
        // Binary: 0 bar → value_min=0, value_max=0.5 ; 1 bar → value_min=0.5, value_max=1.5
        const min = idx === 0 ? 0 : 0.5;
        const max = idx === 0 ? 0.5 : 1.5;
        setDrillDownValueRange({ min, max });
      } else if (data.bin_edges.length > idx + 1) {
        setDrillDownValueRange({ min: data.bin_edges[idx], max: data.bin_edges[idx + 1] });
      }
      setDrillDownOpen(true);
    },
    [data, setDrillDownValueRange, setDrillDownOpen]
  );

  const { traces, layout } = useMemo(() => {
    if (!data || data.bin_counts.length === 0) return { traces: [], layout: {} };

    // Bin centers from edges
    const binCenters = data.bin_edges.slice(0, -1).map((edge, i) => {
      const center = (edge + data.bin_edges[i + 1]) / 2;
      return unit === 'percent' ? center * 100 : center;
    });

    const maxCount = Math.max(...data.bin_counts);
    const barColors = data.bin_counts.map((count) => {
      const intensity = maxCount > 0 ? count / maxCount : 0;
      return hexToRgba(colors.primary, 0.35 + intensity * 0.55);
    });

    const t: Plotly.Data[] = [
      {
        type: 'bar' as const,
        name: displayName,
        x: binCenters,
        y: data.bin_counts,
        marker: {
          color: barColors,
          line: { color: hexToRgba(colors.primaryDark, 0.6), width: 1 },
        },
        hovertemplate: `Value: <b>%{customdata}</b><br>` + 'Count: <b>%{y}</b>' + '<extra></extra>',
        customdata: binCenters.map((v) => formatKpiValue(unit === 'percent' ? v / 100 : v, unit)),
      },
    ];

    // Percentile markers
    const shapes: Partial<Plotly.Shape>[] = [];
    const annotations: Partial<Plotly.Annotations>[] = [];

    if (data.percentiles) {
      const markers = [
        { key: 'P50', value: data.percentiles.p50 },
        { key: 'P95', value: data.percentiles.p95 },
      ];

      for (const { key, value } of markers) {
        const chartVal = formatKpiChartValue(value, unit) ?? value;
        shapes.push({
          type: 'line',
          x0: chartVal,
          x1: chartVal,
          y0: 0,
          y1: 1,
          yref: 'paper',
          line: { color: colors.accentGold, width: 1.5, dash: 'dash' },
        });
        annotations.push({
          x: chartVal,
          y: 1,
          yref: 'paper',
          text: `${key}: ${formatKpiValue(value, unit)}`,
          showarrow: false,
          font: { size: 10, color: colors.accentGold },
          yanchor: 'bottom',
          yshift: 5,
        });
      }
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
      margin: { l: 55, r: 20, t: 10, b: 40 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: 'Inter, system-ui, sans-serif' },
      showlegend: false,
      bargap: 0.05,
      xaxis: {
        ...axisConfig,
        showgrid: false,
        ...(unit === 'percent' ? { ticksuffix: '%', range: [0, 100] } : {}),
      },
      yaxis: { ...axisConfig, title: { text: 'Count', font: { size: 10 } } },
      shapes: shapes as Plotly.Shape[],
      annotations: annotations as Plotly.Annotations[],
    };

    return { traces: t, layout: l };
  }, [data, unit, displayName, colors]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="ml-2 text-sm text-text-muted">Loading distribution...</span>
      </div>
    );
  }

  if (!data || (data.bin_counts.length === 0 && !data.is_binary)) {
    return <div className="py-12 text-center text-sm text-text-muted">No distribution data</div>;
  }

  // Binary data: simple two-bar chart
  if (data.is_binary && data.binary_counts) {
    const n0 = data.binary_counts['0'] ?? 0;
    const n1 = data.binary_counts['1'] ?? 0;
    const total = n0 + n1;
    const pct0 = total > 0 ? ((n0 / total) * 100).toFixed(1) : '0';
    const pct1 = total > 0 ? ((n1 / total) * 100).toFixed(1) : '0';

    const labels = [unit === 'percent' ? 'No (0%)' : '0', unit === 'percent' ? 'Yes (100%)' : '1'];

    const binaryTraces: Plotly.Data[] = [
      {
        type: 'bar' as const,
        x: labels,
        y: [n0, n1],
        marker: {
          color: [hexToRgba(colors.accentSilver, 0.7), hexToRgba(colors.primary, 0.8)],
          line: { color: [colors.accentSilver, colors.primaryDark], width: 1 },
        },
        text: [`${pct0}%`, `${pct1}%`],
        textposition: 'outside' as const,
        textfont: { size: 11, color: colors.textSecondary },
        hovertemplate: '<b>%{x}</b><br>Count: %{y}<br>%{text}<extra></extra>',
      },
    ];

    const binaryLayout: Partial<Plotly.Layout> = {
      height: 220,
      margin: { l: 55, r: 20, t: 10, b: 40 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: 'Inter, system-ui, sans-serif' },
      showlegend: false,
      yaxis: {
        showgrid: true,
        gridcolor: 'rgba(0,0,0,0.05)',
        zeroline: false,
        showline: true,
        linecolor: 'rgba(0,0,0,0.1)',
        tickfont: { size: 10 },
        title: { text: 'Count', font: { size: 10 } },
      },
      xaxis: {
        showgrid: false,
        zeroline: false,
        showline: true,
        linecolor: 'rgba(0,0,0,0.1)',
        tickfont: { size: 11 },
      },
    };

    return (
      <div>
        <div className="mb-1 flex items-center gap-2 px-1 text-xs text-text-muted">
          <span>{total.toLocaleString()} records (binary)</span>
        </div>
        <PlotlyChart data={binaryTraces} layout={binaryLayout} onClick={handleBarClick} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-2 px-1 text-xs text-text-muted">
        {data.capped ? (
          <span>
            Sampled {data.sample_size.toLocaleString()} of {data.total.toLocaleString()} records
          </span>
        ) : (
          <span>{data.total.toLocaleString()} records</span>
        )}
      </div>
      <PlotlyChart data={traces} layout={layout} onClick={handleBarClick} />
    </div>
  );
}
