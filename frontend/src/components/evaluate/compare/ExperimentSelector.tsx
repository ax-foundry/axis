'use client';

import { ArrowLeftRight, FlaskConical, Target } from 'lucide-react';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';

import type { ComparisonRow } from '@/types';

interface ExperimentSelectorProps {
  rows: ComparisonRow[];
  className?: string;
}

export function ExperimentSelector({ rows, className }: ExperimentSelectorProps) {
  const {
    compareBaselineExperiment,
    compareChallengerExperiment,
    setCompareBaselineExperiment,
    setCompareChallengerExperiment,
    swapBaselineChallenger,
  } = useUIStore();

  // Get unique experiments
  const experiments = useMemo(() => {
    const experimentSet = new Set<string>();
    rows.forEach((row) => {
      const exp = row.experimentName || 'Default';
      experimentSet.add(exp);
    });
    return Array.from(experimentSet).sort();
  }, [rows]);

  // Get test case counts per experiment
  const experimentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    rows.forEach((row) => {
      const exp = row.experimentName || 'Default';
      counts[exp] = (counts[exp] || 0) + 1;
    });
    return counts;
  }, [rows]);

  // Auto-select if only 2 experiments and none selected
  useMemo(() => {
    if (experiments.length === 2 && !compareBaselineExperiment && !compareChallengerExperiment) {
      setCompareBaselineExperiment(experiments[0]);
      setCompareChallengerExperiment(experiments[1]);
    }
  }, [
    experiments,
    compareBaselineExperiment,
    compareChallengerExperiment,
    setCompareBaselineExperiment,
    setCompareChallengerExperiment,
  ]);

  const handleBaselineChange = (value: string) => {
    if (value === compareChallengerExperiment) {
      // If selecting the same as challenger, swap them
      swapBaselineChallenger();
    } else {
      setCompareBaselineExperiment(value || null);
    }
  };

  const handleChallengerChange = (value: string) => {
    if (value === compareBaselineExperiment) {
      // If selecting the same as baseline, swap them
      swapBaselineChallenger();
    } else {
      setCompareChallengerExperiment(value || null);
    }
  };

  if (experiments.length < 2) {
    return (
      <div className={cn('border-border/50 rounded-xl border bg-white p-6', className)}>
        <div className="text-center text-text-muted">
          <FlaskConical className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p>Need at least 2 experiments for comparison</p>
          <p className="mt-1 text-sm">
            Found {experiments.length} experiment{experiments.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('border-border/50 rounded-xl border bg-white shadow-sm', className)}>
      <div className="border-border/50 border-b px-5 py-4">
        <h3 className="flex items-center gap-2 font-semibold text-text-primary">
          <FlaskConical className="h-5 w-5 text-primary" />
          Experiment Selection
        </h3>
        <p className="mt-1 text-sm text-text-muted">
          Select baseline and challenger models for head-to-head comparison
        </p>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-center gap-4">
          {/* Baseline Selector */}
          <div className="min-w-[200px] flex-1">
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-text-secondary">
              <div className="h-3 w-3 rounded-full bg-gray-400" />
              Baseline
            </label>
            <select
              value={compareBaselineExperiment || ''}
              onChange={(e) => handleBaselineChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Select baseline...</option>
              {experiments.map((exp) => (
                <option key={exp} value={exp}>
                  {exp} ({experimentCounts[exp]} cases)
                </option>
              ))}
            </select>
          </div>

          {/* Swap Button */}
          <div className="flex-shrink-0 pt-6">
            <button
              onClick={swapBaselineChallenger}
              disabled={!compareBaselineExperiment || !compareChallengerExperiment}
              title="Swap baseline and challenger"
              className={cn(
                'rounded-lg border border-border p-2.5 transition-all',
                compareBaselineExperiment && compareChallengerExperiment
                  ? 'cursor-pointer text-text-secondary hover:border-gray-300 hover:bg-gray-100'
                  : 'cursor-not-allowed text-text-muted opacity-40'
              )}
            >
              <ArrowLeftRight className="h-5 w-5" />
            </button>
          </div>

          {/* Challenger Selector */}
          <div className="min-w-[200px] flex-1">
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-text-secondary">
              <div className="h-3 w-3 rounded-full bg-primary" />
              Challenger
            </label>
            <select
              value={compareChallengerExperiment || ''}
              onChange={(e) => handleChallengerChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Select challenger...</option>
              {experiments.map((exp) => (
                <option key={exp} value={exp}>
                  {exp} ({experimentCounts[exp]} cases)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selection Summary */}
        {compareBaselineExperiment && compareChallengerExperiment && (
          <div className="mt-4 rounded-lg bg-primary-pale/30 p-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-gray-500" />
                  <span className="text-text-muted">Comparing:</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-gray-200 px-2 py-0.5 font-medium text-text-primary">
                    {compareBaselineExperiment}
                  </span>
                  <span className="text-text-muted">vs</span>
                  <span className="rounded bg-primary-pale px-2 py-0.5 font-medium text-text-primary">
                    {compareChallengerExperiment}
                  </span>
                </div>
              </div>
              <span className="text-text-muted">
                {experimentCounts[compareBaselineExperiment]} vs{' '}
                {experimentCounts[compareChallengerExperiment]} cases
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
