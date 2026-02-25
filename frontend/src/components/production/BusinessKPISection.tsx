'use client';

import { MessageSquare, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

import type { SignalsKPIResult } from '@/types';

/** Tiny inline SVG sparkline */
function Sparkline({ data, className }: { data: { value: number }[]; className?: string }) {
  const values = data.map((d) => d.value);
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

/** Derive trend direction from sparkline data (last value vs first value) */
function getTrendFromSparkline(sparkline?: { value: number }[]): {
  direction: 'up' | 'down' | 'flat';
  isPositive: boolean;
} {
  if (!sparkline || sparkline.length < 2) return { direction: 'flat', isPositive: false };

  const first = sparkline[0].value;
  const last = sparkline[sparkline.length - 1].value;
  const diff = last - first;
  const threshold = Math.abs(first) * 0.01; // 1% threshold

  if (Math.abs(diff) < threshold) return { direction: 'flat', isPositive: false };
  const direction = diff > 0 ? 'up' : 'down';
  // For rates like compliance/approval, higher is better
  const isPositive = direction === 'up';
  return { direction, isPositive };
}

interface BusinessKPISectionProps {
  signalsKPIs?: SignalsKPIResult[];
  totalCases?: number;
}

export function BusinessKPISection({ signalsKPIs, totalCases }: BusinessKPISectionProps) {
  if (!signalsKPIs || signalsKPIs.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {signalsKPIs.slice(0, 5).map((kpi) => {
        const hasSparkline = kpi.sparkline && kpi.sparkline.length >= 2;
        const { direction, isPositive } = getTrendFromSparkline(kpi.sparkline);

        const TrendIcon =
          direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;

        const isGood = direction !== 'flat' && isPositive;
        const isBad = direction !== 'flat' && !isPositive;

        return (
          <Link key={kpi.key} href="/human-signals">
            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-white px-4 py-3 transition-all hover:border-primary/40 hover:shadow-sm">
              {/* Value + trend icon */}
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-bold text-text-primary">{kpi.value}</span>
                {direction !== 'flat' && (
                  <TrendIcon
                    className={cn('h-4 w-4', isGood && 'text-green-600', isBad && 'text-red-500')}
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
                {totalCases != null && (
                  <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] text-text-muted">
                    {totalCases.toLocaleString()}
                  </span>
                )}
              </div>

              {/* Category badge */}
              <div className="flex items-center gap-1 pt-0.5">
                <MessageSquare className="text-text-muted/60 h-3 w-3" />
                <span className="text-text-muted/60 text-[10px]">Human Signals</span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
