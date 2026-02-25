'use client';

import { Trophy, TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react';
import { useMemo } from 'react';

import { compareMetrics, type MetricComparison } from '@/lib/stats';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';
import { Colors } from '@/types';

import { StatisticalBadge } from './StatisticalBadge';

import type { ComparisonRow } from '@/types';

interface HeadToHeadSummaryProps {
  rows: ComparisonRow[];
  className?: string;
}

export function HeadToHeadSummary({ rows, className }: HeadToHeadSummaryProps) {
  const { compareBaselineExperiment, compareChallengerExperiment } = useUIStore();

  // Get all metrics from rows
  const allMetrics = useMemo(() => {
    const metricSet = new Set<string>();
    rows.forEach((row) => {
      Object.keys(row.metrics).forEach((m) => metricSet.add(m));
    });
    return Array.from(metricSet).sort();
  }, [rows]);

  // Filter rows by experiment
  const { baselineRows, challengerRows } = useMemo(() => {
    return {
      baselineRows: rows.filter(
        (r) => (r.experimentName || 'Default') === compareBaselineExperiment
      ),
      challengerRows: rows.filter(
        (r) => (r.experimentName || 'Default') === compareChallengerExperiment
      ),
    };
  }, [rows, compareBaselineExperiment, compareChallengerExperiment]);

  // Calculate per-metric comparisons
  const metricComparisons = useMemo((): MetricComparison[] => {
    return allMetrics.map((metricName) => {
      const baselineValues = baselineRows
        .map((r) => r.metrics[metricName])
        .filter((v): v is number => typeof v === 'number' && !isNaN(v));

      const challengerValues = challengerRows
        .map((r) => r.metrics[metricName])
        .filter((v): v is number => typeof v === 'number' && !isNaN(v));

      return compareMetrics(baselineValues, challengerValues, metricName);
    });
  }, [allMetrics, baselineRows, challengerRows]);

  // Calculate overall summary
  const summary = useMemo(() => {
    const challengerWins = metricComparisons.filter((m) => m.winner === 'challenger').length;
    const baselineWins = metricComparisons.filter((m) => m.winner === 'baseline').length;
    const ties = metricComparisons.filter((m) => m.winner === 'tie').length;

    const significantComparisons = metricComparisons.filter((m) => m.isSignificant);
    const significantChallengerWins = significantComparisons.filter(
      (m) => m.winner === 'challenger'
    ).length;
    const significantBaselineWins = significantComparisons.filter(
      (m) => m.winner === 'baseline'
    ).length;

    // Overall average improvement
    const avgImprovement =
      metricComparisons.length > 0
        ? metricComparisons.reduce((sum, m) => sum + m.percentChange, 0) / metricComparisons.length
        : 0;

    let overallWinner: 'baseline' | 'challenger' | 'tie';
    if (significantChallengerWins > significantBaselineWins) {
      overallWinner = 'challenger';
    } else if (significantBaselineWins > significantChallengerWins) {
      overallWinner = 'baseline';
    } else if (challengerWins > baselineWins) {
      overallWinner = 'challenger';
    } else if (baselineWins > challengerWins) {
      overallWinner = 'baseline';
    } else {
      overallWinner = 'tie';
    }

    return {
      challengerWins,
      baselineWins,
      ties,
      totalMetrics: metricComparisons.length,
      avgImprovement,
      overallWinner,
      significantChallengerWins,
      significantBaselineWins,
    };
  }, [metricComparisons]);

  if (!compareBaselineExperiment || !compareChallengerExperiment) {
    return null;
  }

  if (baselineRows.length === 0 || challengerRows.length === 0) {
    return (
      <div className={cn('border-border/50 rounded-xl border bg-white p-6 text-center', className)}>
        <BarChart3 className="mx-auto mb-2 h-8 w-8 text-text-muted opacity-50" />
        <p className="text-text-muted">No data available for the selected experiments</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'border-border/50 overflow-hidden rounded-xl border bg-white shadow-sm',
        className
      )}
    >
      {/* Header */}
      <div className="border-b border-border bg-gray-50 px-5 py-4">
        <h3 className="flex items-center gap-2 font-semibold text-text-primary">
          <Trophy className="h-5 w-5 text-accent-gold" />
          Head-to-Head Comparison
        </h3>
      </div>

      <div className="p-5">
        {/* Main Comparison Visual */}
        <div className="mb-6 flex items-center justify-center gap-8">
          {/* Baseline */}
          <div className="text-center">
            <div className="mb-1 text-sm text-text-muted">Baseline</div>
            <div className="rounded-lg bg-gray-100 px-4 py-2 text-lg font-semibold text-text-primary">
              {compareBaselineExperiment}
            </div>
          </div>

          {/* VS Badge */}
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200">
              <span className="text-sm font-bold text-text-muted">VS</span>
            </div>
          </div>

          {/* Challenger */}
          <div className="text-center">
            <div className="mb-1 text-sm text-text-muted">Challenger</div>
            <div className="rounded-lg bg-primary-pale px-4 py-2 text-lg font-semibold text-text-primary">
              {compareChallengerExperiment}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          {/* Winner Card */}
          <div
            className={cn(
              'rounded-xl border p-4 text-center',
              summary.overallWinner === 'challenger'
                ? 'border-green-200 bg-green-50'
                : summary.overallWinner === 'baseline'
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-gray-200 bg-gray-50'
            )}
          >
            <div className="mb-2 flex items-center justify-center gap-2">
              <Trophy
                className={cn(
                  'h-5 w-5',
                  summary.overallWinner === 'challenger'
                    ? 'text-green-600'
                    : summary.overallWinner === 'baseline'
                      ? 'text-amber-600'
                      : 'text-gray-500'
                )}
              />
              <span className="text-sm font-medium text-text-secondary">Winner</span>
            </div>
            <div
              className={cn(
                'text-xl font-bold',
                summary.overallWinner === 'challenger'
                  ? 'text-green-700'
                  : summary.overallWinner === 'baseline'
                    ? 'text-amber-700'
                    : 'text-gray-600'
              )}
            >
              {summary.overallWinner === 'tie'
                ? 'Tie'
                : summary.overallWinner === 'challenger'
                  ? 'Challenger'
                  : 'Baseline'}
            </div>
          </div>

          {/* Improvement Card */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
            <div className="mb-2 flex items-center justify-center gap-2">
              {summary.avgImprovement >= 0 ? (
                <TrendingUp className="h-5 w-5 text-green-600" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-600" />
              )}
              <span className="text-sm font-medium text-text-secondary">Overall Change</span>
            </div>
            <div
              className={cn(
                'text-xl font-bold',
                summary.avgImprovement >= 0 ? 'text-green-700' : 'text-red-700'
              )}
            >
              {summary.avgImprovement >= 0 ? '+' : ''}
              {summary.avgImprovement.toFixed(1)}%
            </div>
          </div>

          {/* Metrics Won Card */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
            <div className="mb-2 flex items-center justify-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-text-secondary">Metrics Won</span>
            </div>
            <div className="text-xl font-bold text-text-primary">
              {summary.challengerWins}/{summary.totalMetrics}
            </div>
            <div className="mt-1 text-xs text-text-muted">
              {summary.significantChallengerWins} significant
            </div>
          </div>
        </div>

        {/* Per-Metric Breakdown */}
        <div>
          <h4 className="mb-3 text-sm font-medium text-text-secondary">Per-Metric Breakdown</h4>
          <div className="space-y-3">
            {metricComparisons.map((comparison) => (
              <MetricComparisonRow key={comparison.metricName} comparison={comparison} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricComparisonRowProps {
  comparison: MetricComparison;
}

function MetricComparisonRow({ comparison }: MetricComparisonRowProps) {
  const maxMean = Math.max(comparison.baselineMean, comparison.challengerMean, 0.01);
  const baselineWidth = (comparison.baselineMean / maxMean) * 100;
  const challengerWidth = (comparison.challengerMean / maxMean) * 100;

  return (
    <div className="flex items-center gap-3">
      {/* Metric name */}
      <div className="w-32 flex-shrink-0">
        <span className="text-sm font-medium text-text-primary">{comparison.metricName}</span>
      </div>

      {/* Bars */}
      <div className="flex flex-1 items-center gap-2">
        {/* Baseline bar */}
        <div className="flex flex-1 justify-end">
          <div
            className="flex h-6 items-center justify-end rounded-l-md px-2 text-xs font-medium text-gray-700"
            style={{
              width: `${baselineWidth}%`,
              minWidth: '40px',
              backgroundColor: Colors.accentSilver,
            }}
          >
            {comparison.baselineMean.toFixed(3)}
          </div>
        </div>

        {/* Divider */}
        <div className="h-8 w-px flex-shrink-0 bg-border" />

        {/* Challenger bar */}
        <div className="flex flex-1 justify-start">
          <div
            className={cn(
              'flex h-6 items-center justify-start rounded-r-md px-2 text-xs font-medium',
              comparison.winner === 'challenger' ? 'text-green-800' : 'text-primary-dark'
            )}
            style={{
              width: `${challengerWidth}%`,
              minWidth: '40px',
              backgroundColor:
                comparison.winner === 'challenger' ? Colors.success + '40' : Colors.primarySoft,
            }}
          >
            {comparison.challengerMean.toFixed(3)}
          </div>
        </div>
      </div>

      {/* Winner indicator */}
      <div className="flex w-24 flex-shrink-0 items-center gap-1">
        {comparison.winner === 'tie' ? (
          <div className="flex items-center gap-1 text-text-muted">
            <Minus className="h-4 w-4" />
            <span className="text-xs">Tie</span>
          </div>
        ) : (
          <div
            className={cn(
              'flex items-center gap-1',
              comparison.winner === 'challenger' ? 'text-green-600' : 'text-amber-600'
            )}
          >
            {comparison.winner === 'challenger' ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            <span className="text-xs font-medium">
              {comparison.percentChange >= 0 ? '+' : ''}
              {comparison.percentChange.toFixed(1)}%
            </span>
          </div>
        )}
        <StatisticalBadge
          pValue={comparison.pValue}
          effectSize={comparison.effectSize}
          stars={comparison.stars}
        />
      </div>
    </div>
  );
}
