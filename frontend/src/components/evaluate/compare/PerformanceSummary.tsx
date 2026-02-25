'use client';

import { ChevronDown, ChevronRight, BarChart3 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';
import { Thresholds } from '@/types';

import type { ComparisonRow, ExperimentPerformanceSummary } from '@/types';

interface PerformanceSummaryProps {
  rows: ComparisonRow[];
}

function getScoreColor(score: number): string {
  if (score >= Thresholds.GREEN_THRESHOLD) return 'text-success';
  if (score <= Thresholds.RED_THRESHOLD) return 'text-error';
  return 'text-warning';
}

function getScoreBgColor(score: number): string {
  if (score >= Thresholds.GREEN_THRESHOLD) return 'bg-success/10';
  if (score <= Thresholds.RED_THRESHOLD) return 'bg-error/10';
  return 'bg-warning/10';
}

function calculateStd(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

export function PerformanceSummary({ rows }: PerformanceSummaryProps) {
  const { compareShowPerformanceSummary, toggleComparePerformanceSummary } = useUIStore();
  const [expandedExperiment, setExpandedExperiment] = useState<string | null>(null);

  // Calculate performance summaries per experiment
  const summaries = useMemo((): ExperimentPerformanceSummary[] => {
    const experimentData = new Map<
      string,
      {
        scores: number[];
        metricScores: Record<string, number[]>;
      }
    >();

    rows.forEach((row) => {
      const name = row.experimentName || 'Default';
      if (!experimentData.has(name)) {
        experimentData.set(name, { scores: [], metricScores: {} });
      }

      const data = experimentData.get(name)!;
      data.scores.push(row.overallScore);

      Object.entries(row.metrics).forEach(([metric, score]) => {
        if (!data.metricScores[metric]) {
          data.metricScores[metric] = [];
        }
        data.metricScores[metric].push(score);
      });
    });

    return Array.from(experimentData.entries())
      .map(([name, data]) => ({
        experimentName: name,
        testCaseCount: data.scores.length,
        averageScore: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
        metrics: Object.fromEntries(
          Object.entries(data.metricScores).map(([metric, scores]) => [
            metric,
            {
              mean: scores.reduce((a, b) => a + b, 0) / scores.length,
              std: calculateStd(scores),
            },
          ])
        ),
      }))
      .sort((a, b) => b.averageScore - a.averageScore);
  }, [rows]);

  if (summaries.length === 0) return null;

  return (
    <div className="border-border/50 overflow-hidden rounded-xl border bg-white shadow-sm">
      {/* Header - toggle button */}
      <button
        onClick={toggleComparePerformanceSummary}
        className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-text-primary">
            Performance Summary by Experiment
          </span>
          <span className="text-xs text-text-muted">({summaries.length} experiments)</span>
        </div>
        {compareShowPerformanceSummary ? (
          <ChevronDown className="h-4 w-4 text-text-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 text-text-muted" />
        )}
      </button>

      {/* Collapsible content */}
      {compareShowPerformanceSummary && (
        <div className="border-border/50 border-t">
          {summaries.map((summary, idx) => {
            const isExpanded = expandedExperiment === summary.experimentName;
            const metricEntries = Object.entries(summary.metrics);

            return (
              <div
                key={summary.experimentName}
                className={cn(
                  'border-border/30 border-b last:border-b-0',
                  idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                )}
              >
                {/* Experiment row */}
                <button
                  onClick={() => setExpandedExperiment(isExpanded ? null : summary.experimentName)}
                  className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-gray-100/50"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-text-muted" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-text-muted" />
                    )}
                    <span className="font-medium text-text-primary">{summary.experimentName}</span>
                    <span className="text-xs text-text-muted">
                      ({summary.testCaseCount} test cases)
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={cn(
                        'rounded-lg px-2.5 py-1 text-sm font-semibold',
                        getScoreColor(summary.averageScore),
                        getScoreBgColor(summary.averageScore)
                      )}
                    >
                      {(summary.averageScore * 100).toFixed(1)}%
                    </span>
                  </div>
                </button>

                {/* Expanded metric details */}
                {isExpanded && metricEntries.length > 0 && (
                  <div className="px-4 pb-4 pt-1">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {metricEntries.map(([metricName, stats]) => (
                        <div
                          key={metricName}
                          className={cn(
                            'border-border/50 rounded-lg border p-3',
                            getScoreBgColor(stats.mean)
                          )}
                        >
                          <p className="mb-1 truncate text-xs text-text-muted" title={metricName}>
                            {metricName}
                          </p>
                          <p className={cn('text-lg font-semibold', getScoreColor(stats.mean))}>
                            {(stats.mean * 100).toFixed(1)}%
                          </p>
                          <p className="text-xs text-text-muted">
                            {'\u00B1'} {(stats.std * 100).toFixed(1)}%
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
