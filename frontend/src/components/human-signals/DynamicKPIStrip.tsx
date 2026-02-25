'use client';

import { BarChart3, MessageSquareText, Minus, TrendingDown, TrendingUp, X } from 'lucide-react';
import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { formatDuration } from '@/lib/human-signals-utils';
import { useColors } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useHumanSignalsStore } from '@/stores';

import type { SignalsKPIResult } from '@/types';

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

function Sparkline({ data, className }: { data: { value: number }[]; className?: string }) {
  const values = useMemo(
    () => data.map((d) => d.value).filter((v): v is number => v !== null),
    [data]
  );
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 60;
  const h = 18;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 2) - 1;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={w} height={h} className={cn('flex-shrink-0', className)} viewBox={`0 0 ${w} ${h}`}>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Trend helpers
// ---------------------------------------------------------------------------

function getTrendFromSparkline(sparkline?: { value: number }[]): {
  direction: 'up' | 'down' | 'flat';
  isPositive: boolean;
} {
  if (!sparkline || sparkline.length < 2) return { direction: 'flat', isPositive: false };

  const first = sparkline[0].value;
  const last = sparkline[sparkline.length - 1].value;
  const diff = last - first;
  const threshold = Math.abs(first) * 0.01;

  if (Math.abs(diff) < threshold) return { direction: 'flat', isPositive: false };
  const direction = diff > 0 ? 'up' : 'down';
  return { direction, isPositive: direction === 'up' };
}

// ---------------------------------------------------------------------------
// Expanded trend chart
// ---------------------------------------------------------------------------

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function KPISparklineTrendChart({ kpi, onClose }: { kpi: SignalsKPIResult; onClose: () => void }) {
  const colors = useColors();

  const { traces, layout } = useMemo(() => {
    const sparkline = kpi.sparkline ?? [];
    const dates = sparkline.map((d) => d.date);
    const values = sparkline.map((d) => d.value);

    const isDuration = kpi.format === 'duration';
    const customdata = isDuration ? values.map((v) => formatDuration(v)) : undefined;

    const hovertemplate = isDuration
      ? `<b>Week of %{x}</b><br>${kpi.label}: %{customdata}<extra></extra>`
      : `<b>Week of %{x}</b><br>${kpi.label}: %{y:.1f}${kpi.format === 'percent' ? '%' : ''}<extra></extra>`;

    const t: Plotly.Data[] = [
      {
        x: dates,
        y: values,
        ...(customdata ? { customdata } : {}),
        type: 'scatter' as const,
        mode: 'lines+markers' as const,
        name: kpi.label,
        line: { color: colors.primary, width: 2, shape: 'spline' as const },
        marker: { size: 4 },
        fill: 'tozeroy' as const,
        fillcolor: hexToRgba(colors.primary, 0.1),
        hovertemplate,
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

    const l: Partial<Plotly.Layout> = {
      height: 240,
      margin: { l: 45, r: 20, t: 10, b: 35 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: 'Inter, system-ui, sans-serif' },
      showlegend: false,
      xaxis: { ...axisConfig, showgrid: false },
      yaxis: {
        ...axisConfig,
        automargin: true,
        ...(kpi.format === 'percent' ? { ticksuffix: '%' } : {}),
        ...(isDuration ? { visible: false } : {}),
      },
    };

    return { traces: t, layout: l };
  }, [kpi, colors]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h3 className="text-sm font-medium text-text-primary">{kpi.label} — Weekly Trend</h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-2 py-2">
        <PlotlyChart data={traces} layout={layout} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Card Grid
// ---------------------------------------------------------------------------

interface DynamicKPIStripProps {
  kpis: SignalsKPIResult[];
}

export function DynamicKPIStrip({ kpis }: DynamicKPIStripProps) {
  const selectedSignalKpi = useHumanSignalsStore((s) => s.selectedSignalKpi);
  const selectSignalKpi = useHumanSignalsStore((s) => s.selectSignalKpi);

  const selectedKpiData = useMemo(
    () => kpis.find((k) => k.key === selectedSignalKpi) ?? null,
    [kpis, selectedSignalKpi]
  );

  if (kpis.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Card grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {kpis.map((kpi) => {
          const isSelected = selectedSignalKpi === kpi.key;
          const hasSparkline = kpi.sparkline && kpi.sparkline.length >= 2;
          const { direction, isPositive } = getTrendFromSparkline(kpi.sparkline);
          const isGood = isPositive;
          const isBad = direction !== 'flat' && !isPositive;

          const TrendIcon =
            direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;

          return (
            <button
              key={kpi.key}
              onClick={() => hasSparkline && selectSignalKpi(kpi.key)}
              className={cn(
                'flex flex-col gap-1.5 rounded-lg border px-4 py-3 text-left transition-all',
                isSelected
                  ? 'border-primary bg-primary/5 ring-2 ring-primary'
                  : 'border-border bg-white',
                hasSparkline
                  ? 'cursor-pointer hover:border-primary/40 hover:shadow-sm'
                  : 'cursor-default'
              )}
            >
              {/* Value + trend arrow */}
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-bold text-text-primary">{kpi.value}</span>
                {direction !== 'flat' && (
                  <TrendIcon
                    className={cn(
                      'h-4 w-4',
                      isGood && 'text-green-600',
                      isBad && 'text-red-500',
                      !isGood && !isBad && 'text-text-muted'
                    )}
                  />
                )}
              </div>

              {/* Sparkline */}
              {hasSparkline && (
                <Sparkline
                  data={kpi.sparkline!}
                  className={cn(
                    isGood ? 'text-green-500' : isBad ? 'text-red-400' : 'text-gray-400'
                  )}
                />
              )}

              {/* Label + count badge */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-muted">{kpi.label}</span>
                {kpi.totalCases != null && (
                  <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] text-text-muted">
                    {kpi.totalCases.toLocaleString()}
                  </span>
                )}
              </div>

              {/* Category badge */}
              <div className="flex items-center gap-1 pt-0.5">
                {kpi.metricName ? (
                  <BarChart3 className="text-text-muted/60 h-3 w-3" />
                ) : (
                  <MessageSquareText className="text-text-muted/60 h-3 w-3" />
                )}
                <span className="text-text-muted/60 text-[10px]">
                  {kpi.metricName || 'Human Signals'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Expanded trend chart */}
      {selectedKpiData && selectedKpiData.sparkline && selectedKpiData.sparkline.length >= 2 && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
          <KPISparklineTrendChart
            kpi={selectedKpiData}
            onClose={() => selectSignalKpi(selectedKpiData.key)}
          />
        </div>
      )}
    </div>
  );
}
