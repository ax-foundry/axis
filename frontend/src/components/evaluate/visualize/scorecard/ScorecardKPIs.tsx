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
    <div className="rounded-lg border border-border bg-white p-5">
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
}

export function ScorecardKPIs({ hierarchy, testCaseCount }: ScorecardKPIsProps) {
  const { metricColumns, componentColumns } = useDataStore();
  const weightedScore = calculateWeightedScore(hierarchy);
  const scoreVariance = calculateScoreVariance(hierarchy);

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
