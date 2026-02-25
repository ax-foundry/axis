'use client';

import { Activity, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';

import type { MonitoringRecord } from '@/types';

interface ExecutiveKPIsProps {
  data: MonitoringRecord[];
  className?: string;
}

interface SparklinePoint {
  value: number;
}

interface KPICardData {
  label: string;
  value: string;
  subtitle?: string;
  valueColor?: string;
  sparkline?: SparklinePoint[];
}

/** Tiny inline SVG sparkline */
function Sparkline({ data, className }: { data: SparklinePoint[]; className?: string }) {
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

/** Derive trend direction from sparkline data */
function getTrend(sparkline?: SparklinePoint[]): 'up' | 'down' | 'flat' {
  if (!sparkline || sparkline.length < 2) return 'flat';
  const first = sparkline[0].value;
  const last = sparkline[sparkline.length - 1].value;
  const diff = last - first;
  const threshold = Math.abs(first) * 0.01;
  if (Math.abs(diff) < threshold) return 'flat';
  return diff > 0 ? 'up' : 'down';
}

function KPICard({ label, value, subtitle, valueColor, sparkline }: KPICardData) {
  const trend = getTrend(sparkline);
  const hasSparkline = sparkline && sparkline.length >= 2;
  // For scores/rates, higher is better
  const isGood = trend === 'up';
  const isBad = trend === 'down';

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-white px-4 py-3">
      {/* Value + trend */}
      <div className="flex items-center gap-1.5">
        <span className={cn('text-xl font-bold text-text-primary', valueColor)}>{value}</span>
        {trend !== 'flat' && (
          <TrendIcon
            className={cn('h-4 w-4', isGood && 'text-green-600', isBad && 'text-red-500')}
          />
        )}
      </div>

      {/* Sparkline */}
      {hasSparkline && (
        <Sparkline
          data={sparkline}
          className={cn(isGood ? 'text-green-500' : isBad ? 'text-red-400' : 'text-gray-400')}
        />
      )}

      {/* Label + subtitle */}
      <span className="text-xs text-text-muted">{label}</span>
      {subtitle && (
        <span className="w-fit rounded bg-gray-100 px-1 py-0.5 text-[10px] text-text-muted">
          {subtitle}
        </span>
      )}

      {/* Category badge */}
      <div className="flex items-center gap-1 pt-0.5">
        <Activity className="text-text-muted/60 h-3 w-3" />
        <span className="text-text-muted/60 text-[10px]">AI Quality</span>
      </div>
    </div>
  );
}

/** Build daily sparkline from monitoring records */
function buildDailySparkline(
  data: MonitoringRecord[],
  valueFn: (records: MonitoringRecord[]) => number | null
): SparklinePoint[] {
  const daily = new Map<string, MonitoringRecord[]>();

  data.forEach((r) => {
    if (!r.timestamp) return;
    const d = new Date(r.timestamp);
    if (isNaN(d.getTime())) return;
    const dayKey = d.toISOString().split('T')[0];
    if (!daily.has(dayKey)) daily.set(dayKey, []);
    daily.get(dayKey)!.push(r);
  });

  return Array.from(daily.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, records]) => {
      const val = valueFn(records);
      return { value: val ?? 0 };
    });
}

export function ExecutiveKPIs({ data, className }: ExecutiveKPIsProps) {
  const kpis = useMemo(() => {
    const metricNames = new Set(data.map((r) => String(r.metric_name || '(unnamed)')));

    const scores = data
      .map((r) => r.metric_score)
      .filter((s): s is number => typeof s === 'number');
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    const passCount = scores.filter((s) => s >= 0.5).length;
    const passRate = scores.length > 0 ? (passCount / scores.length) * 100 : null;

    // Data freshness: newest record timestamp
    const timestamps = data
      .map((r) => r.timestamp)
      .filter((t): t is string => Boolean(t))
      .map((t) => new Date(t).getTime())
      .filter((t) => !isNaN(t));
    const latestTs = timestamps.length > 0 ? Math.max(...timestamps) : null;

    let freshnessLabel = 'N/A';
    if (latestTs) {
      const diffMs = Date.now() - latestTs;
      const diffHrs = diffMs / (1000 * 60 * 60);
      if (diffHrs < 1) freshnessLabel = `${Math.round(diffMs / 60000)}m ago`;
      else if (diffHrs < 24) freshnessLabel = `${Math.round(diffHrs)}h ago`;
      else freshnessLabel = `${Math.round(diffHrs / 24)}d ago`;
    }

    // Weekly sparklines
    const avgScoreSparkline = buildDailySparkline(data, (records) => {
      const s = records
        .map((r) => r.metric_score)
        .filter((v): v is number => typeof v === 'number');
      return s.length > 0 ? s.reduce((a, b) => a + b, 0) / s.length : null;
    });

    const passRateSparkline = buildDailySparkline(data, (records) => {
      const s = records
        .map((r) => r.metric_score)
        .filter((v): v is number => typeof v === 'number');
      if (s.length === 0) return null;
      return (s.filter((v) => v >= 0.5).length / s.length) * 100;
    });

    return {
      metricCount: metricNames.size,
      avgScore,
      passRate,
      freshnessLabel,
      avgScoreSparkline,
      passRateSparkline,
    };
  }, [data]);

  const scoreColor = (score: number | null, goodThreshold: number, warnThreshold: number) => {
    if (score === null) return undefined;
    if (score >= goodThreshold) return 'text-success';
    if (score >= warnThreshold) return 'text-warning';
    return 'text-error';
  };

  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', className)}>
      <KPICard label="Total Metrics" value={String(kpis.metricCount)} />
      <KPICard
        label="Overall Avg Score"
        value={kpis.avgScore !== null ? kpis.avgScore.toFixed(3) : '—'}
        valueColor={scoreColor(kpis.avgScore, 0.7, 0.5)}
        sparkline={kpis.avgScoreSparkline}
      />
      <KPICard
        label="Pass Rate"
        value={kpis.passRate !== null ? `${kpis.passRate.toFixed(1)}%` : '—'}
        valueColor={scoreColor(kpis.passRate, 70, 50)}
        sparkline={kpis.passRateSparkline}
      />
      <KPICard label="Data Freshness" value={kpis.freshnessLabel} />
    </div>
  );
}
