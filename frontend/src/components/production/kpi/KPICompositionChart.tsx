'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useKpiTrendsMulti } from '@/lib/hooks/useKpiData';

import { KPICompositionTimeSeries } from './KPICompositionTimeSeries';

import type { FlatKpiItem } from './AgentKPISection';
import type { KpiCompositionChartConfig } from '@/types';

interface KPICompositionChartProps {
  config: KpiCompositionChartConfig;
  kpis: FlatKpiItem[];
}

interface Segment {
  label: string;
  color: string;
  value: number; // 0-1 raw
  pct: number; // 0-100 display
}

export function KPICompositionChart({ config, kpis }: KPICompositionChartProps) {
  const [expanded, setExpanded] = useState(false);

  const kpiNames = useMemo(() => config.kpis.map((e) => e.kpi_name), [config.kpis]);
  const { data: trendsData, isLoading: trendsLoading } = useKpiTrendsMulti(kpiNames, expanded);

  const segments: Segment[] = useMemo(() => {
    const result: Segment[] = [];
    let sum = 0;

    for (const entry of config.kpis) {
      const match = kpis.find((k) => k.kpi_name === entry.kpi_name);
      const raw = match?.current_value ?? 0;
      const clamped = Math.max(0, Math.min(1, raw));
      sum += clamped;
      result.push({
        label: entry.label,
        color: entry.color,
        value: clamped,
        pct: clamped * 100,
      });
    }

    if (config.show_remainder) {
      const remainder = Math.max(0, 1 - sum);
      result.push({
        label: config.remainder_label ?? 'Other',
        color: config.remainder_color ?? '#6B7280',
        value: remainder,
        pct: remainder * 100,
      });
    }

    return result;
  }, [config, kpis]);

  const total = segments.reduce((s, seg) => s + seg.pct, 0);

  if (total === 0) return null;

  const ChevronIcon = expanded ? ChevronUp : ChevronDown;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between border-b border-border px-4 py-2 transition-colors hover:bg-gray-50"
      >
        <h3 className="text-sm font-medium text-text-primary">{config.title}</h3>
        <ChevronIcon className="h-4 w-4 text-text-muted" />
      </button>
      <div className="px-4 py-3">
        {/* Legend row */}
        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1.5">
          {segments.map((seg) => (
            <div key={seg.label} className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 flex-shrink-0 rounded-full"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-sm text-text-primary">
                <span className="font-semibold">{seg.pct.toFixed(1)}%</span>{' '}
                <span>{seg.label}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Stacked bar */}
        <div className="flex h-8 w-full overflow-hidden rounded-md">
          {segments
            .filter((seg) => seg.pct > 0)
            .map((seg) => {
              const width = (seg.pct / total) * 100;
              return (
                <div
                  key={seg.label}
                  className="transition-all duration-300"
                  style={{
                    width: `${width}%`,
                    backgroundColor: seg.color,
                    minWidth: width > 0 ? '2px' : '0',
                  }}
                  title={`${seg.label}: ${seg.pct.toFixed(1)}%`}
                />
              );
            })}
        </div>
      </div>

      {/* Expandable time series */}
      {expanded && (
        <div className="animate-in fade-in slide-in-from-top-2 border-t border-border duration-200">
          <KPICompositionTimeSeries
            config={config}
            trendData={trendsData?.data ?? []}
            isLoading={trendsLoading}
          />
        </div>
      )}
    </div>
  );
}
