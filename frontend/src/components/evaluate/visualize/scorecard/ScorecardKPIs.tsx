'use client';

import { TrendingUp, Activity, FileText, Hash, Layers } from 'lucide-react';

import { calculateWeightedScore, calculateScoreVariance, formatScore } from '@/lib/scorecard-utils';
import { cn } from '@/lib/utils';
import { useDataStore } from '@/stores';

import type { ScorecardMetric } from '@/lib/scorecard-utils';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: typeof TrendingUp;
  color: 'primary' | 'success' | 'warning' | 'info';
}

function KPICard({ title, value, subtitle, icon: Icon, color }: KPICardProps) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    info: 'bg-blue-500/10 text-blue-500',
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-text-muted">{title}</p>
          <p className="mt-1 text-2xl font-bold text-text-primary">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-text-muted">{subtitle}</p>}
        </div>
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            colorClasses[color]
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

interface ScorecardKPIsProps {
  hierarchy: Map<string, ScorecardMetric>;
  testCaseCount: number;
  evaluationHierarchies?: Map<string, Map<string, ScorecardMetric>> | null;
  evaluationNames?: string[];
}

export function ScorecardKPIs({
  hierarchy,
  testCaseCount,
  evaluationHierarchies,
  evaluationNames,
}: ScorecardKPIsProps) {
  const { metricColumns, componentColumns } = useDataStore();
  const weightedScore = calculateWeightedScore(hierarchy);
  const scoreVariance = calculateScoreVariance(hierarchy);

  const isComparison = evaluationHierarchies && evaluationNames && evaluationNames.length >= 2;

  if (isComparison) {
    const scores = evaluationNames.map((name) => {
      const h = evaluationHierarchies.get(name);
      return { name, score: h ? calculateWeightedScore(h) : null };
    });

    const maxScore = Math.max(...scores.map((s) => s.score ?? 0));

    return (
      <div className="space-y-4">
        {/* Per-evaluation score strip */}
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-border bg-gray-50 px-4 py-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-text-primary">Overall Weighted Score</span>
            {scores.length === 2 && (
              <span className="ml-auto text-xs text-text-muted">
                Δ{' '}
                {scores[1].score !== null && scores[0].score !== null
                  ? (scores[1].score - scores[0].score >= 0 ? '+' : '') +
                    formatScore(scores[1].score - scores[0].score)
                  : '-'}
              </span>
            )}
          </div>
          <div
            className="grid divide-x divide-border"
            style={{ gridTemplateColumns: `repeat(${scores.length}, 1fr)` }}
          >
            {scores.map(({ name, score }) => {
              const isTop = score !== null && score === maxScore && scores.length > 1;
              return (
                <div key={name} className="px-5 py-4">
                  <p className="mb-0.5 truncate text-xs font-medium text-text-muted" title={name}>
                    {name}
                  </p>
                  <p
                    className={cn(
                      'text-2xl font-bold',
                      isTop ? 'text-primary' : 'text-text-primary'
                    )}
                  >
                    {score !== null ? formatScore(score) : '—'}
                  </p>
                  {isTop && scores.length > 1 && (
                    <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      Best
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Supporting KPIs */}
        <div className="grid grid-cols-4 gap-4">
          <KPICard
            title="Score Variance"
            value={formatScore(scoreVariance)}
            subtitle="Consistency measure"
            icon={Activity}
            color="warning"
          />
          <KPICard
            title="Test Cases"
            value={testCaseCount.toLocaleString()}
            subtitle="Unique evaluations"
            icon={FileText}
            color="info"
          />
          <KPICard
            title="Metrics"
            value={metricColumns.length.toLocaleString()}
            subtitle="metric_type = metric"
            icon={Hash}
            color="success"
          />
          <KPICard
            title="Components"
            value={componentColumns.length.toLocaleString()}
            subtitle="metric_type = component"
            icon={Layers}
            color="info"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-4">
      <KPICard
        title="Overall Weighted Score"
        value={formatScore(weightedScore)}
        subtitle="Weighted avg across hierarchy"
        icon={TrendingUp}
        color="primary"
      />
      <KPICard
        title="Score Variance"
        value={formatScore(scoreVariance)}
        subtitle="Consistency measure"
        icon={Activity}
        color="warning"
      />
      <KPICard
        title="Test Cases"
        value={testCaseCount.toLocaleString()}
        subtitle="Unique evaluations"
        icon={FileText}
        color="info"
      />
      <KPICard
        title="Metrics"
        value={metricColumns.length.toLocaleString()}
        subtitle="metric_type = metric"
        icon={Hash}
        color="success"
      />
      <KPICard
        title="Components"
        value={componentColumns.length.toLocaleString()}
        subtitle="metric_type = component"
        icon={Layers}
        color="info"
      />
    </div>
  );
}
