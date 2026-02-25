'use client';

import { ChevronDown, ChevronUp, Layers, Network, Search } from 'lucide-react';
import { useState } from 'react';

import { LearningInsightsPanel } from '@/components/align/analyze/LearningInsightsPanel';
import { cn } from '@/lib/utils';

import type { InsightPattern, InsightResult } from '@/types';

// ── Confidence color helpers ───────────────────────────────────────

function confidenceBorderColor(confidence: number | null) {
  if (confidence === null) return 'border-l-gray-300';
  if (confidence >= 0.7) return 'border-l-green-500';
  if (confidence >= 0.4) return 'border-l-amber-500';
  return 'border-l-red-400';
}

function confidenceBadgeClasses(confidence: number | null) {
  if (confidence === null) return 'bg-gray-100 text-gray-600';
  if (confidence >= 0.7) return 'bg-green-50 text-green-700';
  if (confidence >= 0.4) return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-600';
}

// ── InsightPatternCard ──────────────────────────────────────────────

interface InsightPatternCardProps {
  pattern: InsightPattern;
}

function InsightPatternCard({ pattern }: InsightPatternCardProps) {
  const [expanded, setExpanded] = useState(false);

  const hasExpandable =
    pattern.examples.length > 0 || pattern.issue_ids.length > 0 || pattern.distinct_test_cases > 0;

  return (
    <div
      className={cn(
        'rounded-lg border border-l-4 border-border bg-white p-4',
        confidenceBorderColor(pattern.confidence)
      )}
    >
      {/* Header: category + count + badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-[13px] font-bold text-text-primary">{pattern.category}</h4>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-text-muted">
              {pattern.count}
            </span>
            {pattern.is_cross_metric && (
              <span className="flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                <Network className="h-2.5 w-2.5" />
                Cross-Metric
              </span>
            )}
          </div>
        </div>
        {pattern.confidence !== null && (
          <span
            className={cn(
              'flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
              confidenceBadgeClasses(pattern.confidence)
            )}
          >
            {Math.round(pattern.confidence * 100)}%
          </span>
        )}
      </div>

      {/* Description */}
      <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">{pattern.description}</p>

      {/* Metrics involved */}
      {pattern.metrics_involved.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {pattern.metrics_involved.map((metric) => (
            <span
              key={metric}
              className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
            >
              {metric}
            </span>
          ))}
        </div>
      )}

      {/* Expandable details */}
      {hasExpandable && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2.5 flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-dark"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" /> Less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" /> Details
              </>
            )}
          </button>

          {expanded && (
            <div className="mt-3 space-y-3 border-t border-border pt-3">
              {/* Examples */}
              {pattern.examples.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                    <Search className="h-3 w-3" />
                    Examples
                  </div>
                  <ul className="ml-4 list-disc space-y-1 text-xs text-text-secondary">
                    {pattern.examples.map((example, i) => (
                      <li key={i}>{example}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Stats */}
              <div className="flex items-center gap-4 text-xs text-text-muted">
                {pattern.distinct_test_cases > 0 && (
                  <span>{pattern.distinct_test_cases} distinct test cases</span>
                )}
                {pattern.issue_ids.length > 0 && <span>{pattern.issue_ids.length} issue IDs</span>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── InsightPatternsPanel (main export) ──────────────────────────────

interface InsightPatternsPanelProps {
  insights: InsightResult;
}

export function InsightPatternsPanel({ insights }: InsightPatternsPanelProps) {
  const crossMetricCount = insights.patterns.filter((p) => p.is_cross_metric).length;

  return (
    <div className="space-y-5">
      {/* Patterns Section */}
      {insights.patterns.length > 0 && (
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-text-primary">
              Patterns Discovered
              <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-text-muted">
                {insights.patterns.length}
              </span>
            </h3>
          </div>

          {/* Summary strip */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-gray-50 px-2.5 py-1 text-xs">
              <Layers className="h-3 w-3 text-text-muted" />
              <span className="font-semibold text-text-primary">
                {insights.total_issues_analyzed}
              </span>
              <span className="text-text-muted">analyzed</span>
            </div>
            {crossMetricCount > 0 && (
              <div className="flex items-center gap-1.5 rounded-md border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs">
                <Network className="h-3 w-3 text-purple-600" />
                <span className="font-semibold text-purple-700">{crossMetricCount}</span>
                <span className="text-purple-600">cross-metric</span>
              </div>
            )}
            {insights.pipeline_metadata?.clustering_method && (
              <span className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                {insights.pipeline_metadata.clustering_method}
              </span>
            )}
          </div>

          {/* Pattern cards */}
          <div className="max-h-[400px] space-y-2.5 overflow-y-auto">
            {insights.patterns.map((pattern, idx) => (
              <InsightPatternCard key={idx} pattern={pattern} />
            ))}
          </div>
        </div>
      )}

      {/* Learning Insights (reuse from align) */}
      <LearningInsightsPanel learnings={insights.learnings} metadata={insights.pipeline_metadata} />
    </div>
  );
}
