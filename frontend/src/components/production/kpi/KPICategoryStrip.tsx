'use client';

import {
  BarChart3,
  Database,
  Heart,
  Minus,
  Shield,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useMemo } from 'react';

import { formatDuration } from '@/lib/human-signals-utils';
import { cn } from '@/lib/utils';

import type { FlatKpiItem } from './AgentKPISection';
import type { KpiUnit } from '@/types';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Zap,
  TrendingUp,
  Shield,
  Database,
  Heart,
  BarChart3,
};

function formatValue(value: number | null, unit: KpiUnit): string {
  if (value === null || value === undefined) return '--';
  switch (unit) {
    case 'percent':
      return `${(value * 100).toFixed(1)}%`;
    case 'seconds':
      return formatDuration(value);
    case 'score':
      return value.toFixed(2);
    case 'count':
      return value.toFixed(0);
    default:
      return String(value);
  }
}

/** Tiny inline SVG sparkline from sparkline[] data */
function Sparkline({ data, className }: { data: { value: number | null }[]; className?: string }) {
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

interface KPICategoryStripProps {
  kpis: FlatKpiItem[];
  selectedKpi: string | null;
  onSelectKpi: (kpiName: string) => void;
}

export function KPICategoryStrip({ kpis, selectedKpi, onSelectKpi }: KPICategoryStripProps) {
  if (kpis.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {kpis.map((kpi) => {
        const isSelected = selectedKpi === kpi.kpi_name;
        const isGood =
          kpi.polarity === 'higher_better'
            ? kpi.trend_direction === 'up'
            : kpi.trend_direction === 'down';
        const isBad =
          kpi.polarity === 'higher_better'
            ? kpi.trend_direction === 'down'
            : kpi.trend_direction === 'up';

        const TrendIcon =
          kpi.trend_direction === 'up'
            ? TrendingUp
            : kpi.trend_direction === 'down'
              ? TrendingDown
              : Minus;

        const CatIcon = ICON_MAP[kpi.categoryIcon] ?? BarChart3;

        return (
          <button
            key={kpi.kpi_name}
            onClick={() => onSelectKpi(kpi.kpi_name)}
            className={cn(
              'flex flex-col gap-1.5 rounded-lg border px-4 py-3 text-left transition-all',
              isSelected
                ? 'border-primary bg-primary/5 ring-2 ring-primary'
                : 'border-border bg-white hover:border-primary/40 hover:shadow-sm'
            )}
          >
            {/* Value + trend icon */}
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-bold text-text-primary">
                {formatValue(kpi.current_value, kpi.unit)}
              </span>
              {kpi.trend_direction && kpi.trend_direction !== 'flat' && (
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
            {kpi.sparkline.length >= 2 && (
              <Sparkline
                data={kpi.sparkline}
                className={cn(isGood ? 'text-green-500' : isBad ? 'text-red-400' : 'text-gray-400')}
              />
            )}

            {/* Name + count */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted">{kpi.display_name}</span>
              <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] text-text-muted">
                {kpi.record_count.toLocaleString()}
              </span>
            </div>

            {/* Category badge */}
            <div className="flex items-center gap-1 pt-0.5">
              <CatIcon className="text-text-muted/60 h-3 w-3" />
              <span className="text-text-muted/60 text-[10px]">{kpi.categoryName}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
