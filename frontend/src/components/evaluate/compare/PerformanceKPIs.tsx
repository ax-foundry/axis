'use client';

import { FlaskConical, ListChecks, Trophy, TrendingUp, TrendingDown } from 'lucide-react';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';

import type { ComparisonRow, WinnerInfo } from '@/types';

interface PerformanceKPIsProps {
  rows: ComparisonRow[];
  totalRows: number;
}

interface KPICardProps {
  icon: typeof FlaskConical;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string | number;
  subtext?: string;
  trend?: 'up' | 'down' | null;
  trendValue?: string;
}

function KPICard({
  icon: Icon,
  iconColor,
  iconBg,
  label,
  value,
  subtext,
  trend,
  trendValue,
}: KPICardProps) {
  return (
    <div className="border-border/50 flex min-w-[200px] items-start gap-4 rounded-xl border bg-white p-4 shadow-sm">
      <div className={cn('rounded-lg p-2.5', iconBg)}>
        <Icon className={cn('h-5 w-5', iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-muted">{label}</p>
        <p className="truncate text-2xl font-bold text-text-primary">{value}</p>
        {subtext && (
          <div className="mt-0.5 flex items-center gap-1">
            {trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-success" />}
            {trend === 'down' && <TrendingDown className="h-3.5 w-3.5 text-error" />}
            <span
              className={cn(
                'text-xs',
                trend === 'up'
                  ? 'text-success'
                  : trend === 'down'
                    ? 'text-error'
                    : 'text-text-muted'
              )}
            >
              {trendValue || subtext}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function PerformanceKPIs({ rows, totalRows }: PerformanceKPIsProps) {
  // Calculate experiment count
  const experimentCount = useMemo(() => {
    const experiments = new Set(rows.map((r) => r.experimentName || 'Default'));
    return experiments.size;
  }, [rows]);

  // Calculate unique test case count
  const testCaseCount = useMemo(() => {
    const ids = new Set(rows.map((r) => r.id));
    return ids.size;
  }, [rows]);

  // Calculate winner info
  const winnerInfo = useMemo((): WinnerInfo | null => {
    if (rows.length === 0) return null;

    const experimentScores = new Map<string, number[]>();

    rows.forEach((row) => {
      const name = row.experimentName || 'Default';
      if (!experimentScores.has(name)) {
        experimentScores.set(name, []);
      }
      experimentScores.get(name)!.push(row.overallScore);
    });

    const averages = Array.from(experimentScores.entries())
      .map(([name, scores]) => ({
        name,
        average: scores.reduce((a, b) => a + b, 0) / scores.length,
      }))
      .sort((a, b) => b.average - a.average);

    if (averages.length < 1) return null;

    const improvement =
      averages.length > 1
        ? ((averages[0].average - averages[1].average) / averages[1].average) * 100
        : 0;

    return {
      experimentName: averages[0].name,
      score: averages[0].average,
      improvement,
      metricName: 'Overall',
    };
  }, [rows]);

  // Calculate average score across all rows
  const averageScore = useMemo(() => {
    if (rows.length === 0) return 0;
    return rows.reduce((sum, r) => sum + r.overallScore, 0) / rows.length;
  }, [rows]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KPICard
        icon={FlaskConical}
        iconColor="text-blue-600"
        iconBg="bg-blue-100"
        label="Experiments"
        value={experimentCount}
        subtext={experimentCount === 1 ? 'experiment' : 'experiments'}
      />

      <KPICard
        icon={ListChecks}
        iconColor="text-purple-600"
        iconBg="bg-purple-100"
        label="Test Cases"
        value={testCaseCount}
        subtext={totalRows !== testCaseCount ? `of ${totalRows} total` : 'test cases'}
      />

      <KPICard
        icon={Trophy}
        iconColor="text-amber-600"
        iconBg="bg-amber-100"
        label="Leading Experiment"
        value={winnerInfo?.experimentName || 'N/A'}
        subtext={winnerInfo ? `${(winnerInfo.score * 100).toFixed(1)}% avg` : undefined}
        trend={winnerInfo && winnerInfo.improvement > 0 ? 'up' : null}
        trendValue={
          winnerInfo && winnerInfo.improvement > 0
            ? `+${winnerInfo.improvement.toFixed(1)}% vs next`
            : undefined
        }
      />

      <KPICard
        icon={TrendingUp}
        iconColor={
          averageScore >= 0.7 ? 'text-success' : averageScore >= 0.4 ? 'text-warning' : 'text-error'
        }
        iconBg={
          averageScore >= 0.7
            ? 'bg-success/10'
            : averageScore >= 0.4
              ? 'bg-warning/10'
              : 'bg-error/10'
        }
        label="Average Score"
        value={`${(averageScore * 100).toFixed(1)}%`}
        subtext={rows.length > 0 ? `across ${rows.length} rows` : 'no data'}
      />
    </div>
  );
}
