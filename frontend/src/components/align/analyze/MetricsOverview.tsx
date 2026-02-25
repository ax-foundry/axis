'use client';

import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { AlignmentMetrics } from '@/types';

interface MetricsOverviewProps {
  metrics: AlignmentMetrics;
}

interface MetricCardProps {
  label: string;
  value: number;
  format?: 'percentage' | 'decimal' | 'integer';
  description?: string;
  threshold?: { good: number; warning: number };
}

function MetricCard({
  label,
  value,
  format = 'percentage',
  description,
  threshold,
}: MetricCardProps) {
  const formattedValue =
    format === 'percentage'
      ? `${(value * 100).toFixed(1)}%`
      : format === 'integer'
        ? value.toString()
        : value.toFixed(3);

  let colorClass = 'text-text-primary';

  if (threshold) {
    if (value >= threshold.good) {
      colorClass = 'text-success';
    } else if (value >= threshold.warning) {
      colorClass = 'text-warning';
    } else {
      colorClass = 'text-error';
    }
  }

  return (
    <div className="rounded-lg border border-border bg-white p-4 transition-all hover:shadow-sm">
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</div>
        {description && (
          <div className="group relative">
            <Info className="h-4 w-4 text-text-muted" />
            <div className="absolute right-0 top-6 z-10 hidden w-48 rounded-lg bg-gray-900 p-2 text-xs text-white shadow-lg group-hover:block">
              {description}
            </div>
          </div>
        )}
      </div>
      <div className={cn('mt-1 text-2xl font-bold', colorClass)}>{formattedValue}</div>
    </div>
  );
}

export function MetricsOverview({ metrics }: MetricsOverviewProps) {
  const kappaInterpretation = (kappa: number): string => {
    if (kappa < 0) return 'Less than chance';
    if (kappa < 0.21) return 'Slight';
    if (kappa < 0.41) return 'Fair';
    if (kappa < 0.61) return 'Moderate';
    if (kappa < 0.81) return 'Substantial';
    return 'Almost perfect';
  };

  return (
    <div className="space-y-6">
      {/* Primary Metrics */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Cohen's Kappa"
          value={metrics.cohens_kappa}
          format="decimal"
          description="Measures agreement beyond chance. Values: <0.2 slight, 0.2-0.4 fair, 0.4-0.6 moderate, 0.6-0.8 substantial, >0.8 almost perfect"
          threshold={{ good: 0.6, warning: 0.4 }}
        />
        <MetricCard
          label="F1 Score"
          value={metrics.f1_score}
          description="Harmonic mean of precision and recall. Balanced measure of accuracy."
          threshold={{ good: 0.8, warning: 0.6 }}
        />
        <MetricCard
          label="Alignment"
          value={metrics.accuracy}
          description="Overall agreement rate between human and LLM judgments."
          threshold={{ good: 0.85, warning: 0.7 }}
        />
        <MetricCard
          label="Samples"
          value={metrics.total_samples}
          format="integer"
          description="Total number of evaluated records."
        />
      </div>

      {/* Kappa Interpretation */}
      <div className="rounded-lg border border-border bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
            {metrics.cohens_kappa >= 0.6 ? (
              <TrendingUp className="h-5 w-5 text-success" />
            ) : metrics.cohens_kappa >= 0.4 ? (
              <Minus className="h-5 w-5 text-warning" />
            ) : (
              <TrendingDown className="h-5 w-5 text-error" />
            )}
          </div>
          <div>
            <div className="font-medium text-text-primary">
              {kappaInterpretation(metrics.cohens_kappa)} Agreement
            </div>
            <div className="text-sm text-text-muted">
              Cohen&apos;s Kappa of {metrics.cohens_kappa.toFixed(3)} indicates{' '}
              {kappaInterpretation(metrics.cohens_kappa).toLowerCase()} agreement between human and
              LLM judgments.
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div>
        <h4 className="mb-3 font-medium text-text-primary">Detailed Metrics</h4>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Precision"
            value={metrics.precision}
            description="Of all LLM accepts, how many were correct."
            threshold={{ good: 0.8, warning: 0.6 }}
          />
          <MetricCard
            label="Recall"
            value={metrics.recall}
            description="Of all human accepts, how many did LLM find."
            threshold={{ good: 0.8, warning: 0.6 }}
          />
          <MetricCard
            label="Specificity"
            value={metrics.specificity}
            description="Of all human rejects, how many did LLM correctly reject."
            threshold={{ good: 0.8, warning: 0.6 }}
          />
          <MetricCard
            label="Agreement Count"
            value={metrics.agreement_count}
            format="integer"
            description="Number of records where human and LLM agreed."
          />
        </div>
      </div>
    </div>
  );
}
