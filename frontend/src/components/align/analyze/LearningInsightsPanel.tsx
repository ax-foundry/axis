'use client';

import {
  ChevronDown,
  ChevronUp,
  Filter,
  Layers,
  Lightbulb,
  ListChecks,
  ShieldAlert,
  Target,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

import type { LearningArtifact, PipelineMetadata } from '@/types';

// ── Confidence color helpers ───────────────────────────────────────

function confidenceColor(confidence: number) {
  if (confidence >= 0.7) return 'border-l-green-500';
  if (confidence >= 0.4) return 'border-l-amber-500';
  return 'border-l-red-400';
}

function confidenceBadgeClasses(confidence: number) {
  if (confidence >= 0.7) return 'bg-green-50 text-green-700';
  if (confidence >= 0.4) return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-600';
}

// ── LearningCard ───────────────────────────────────────────────────

interface LearningCardProps {
  artifact: LearningArtifact;
}

function LearningCard({ artifact }: LearningCardProps) {
  const [expanded, setExpanded] = useState(false);

  const hasExpandable =
    artifact.recommended_actions.length > 0 ||
    artifact.scope ||
    artifact.when_not_to_apply ||
    artifact.counterexamples.length > 0;

  return (
    <div
      className={cn(
        'rounded-lg border border-l-4 border-border bg-white p-4',
        confidenceColor(artifact.confidence)
      )}
    >
      {/* Header: title + confidence */}
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-[13px] font-bold text-text-primary">{artifact.title}</h4>
        <span
          className={cn(
            'flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
            confidenceBadgeClasses(artifact.confidence)
          )}
        >
          {Math.round(artifact.confidence * 100)}%
        </span>
      </div>

      {/* Content */}
      <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">{artifact.content}</p>

      {/* Tags */}
      {artifact.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {artifact.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-text-muted"
            >
              {tag}
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
                <ChevronDown className="h-3 w-3" /> More details
              </>
            )}
          </button>

          {expanded && (
            <div className="mt-3 space-y-3 border-t border-border pt-3">
              {/* Recommended actions */}
              {artifact.recommended_actions.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                    <ListChecks className="h-3 w-3" />
                    Recommended Actions
                  </div>
                  <ol className="ml-4 list-decimal space-y-1 text-xs text-text-secondary">
                    {artifact.recommended_actions.map((action, i) => (
                      <li key={i}>{action}</li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Scope */}
              {artifact.scope && (
                <div>
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                    <Target className="h-3 w-3" />
                    Scope
                  </div>
                  <p className="text-xs text-text-secondary">{artifact.scope}</p>
                </div>
              )}

              {/* When not to apply */}
              {artifact.when_not_to_apply && (
                <div>
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                    <ShieldAlert className="h-3 w-3" />
                    When Not to Apply
                  </div>
                  <p className="text-xs text-text-secondary">{artifact.when_not_to_apply}</p>
                </div>
              )}

              {/* Counterexamples */}
              {artifact.counterexamples.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                    <ShieldAlert className="h-3 w-3" />
                    Counterexamples
                  </div>
                  <ul className="ml-4 list-disc space-y-1 text-xs text-text-secondary">
                    {artifact.counterexamples.map((ce, i) => (
                      <li key={i}>{ce}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Supporting records */}
              {artifact.supporting_item_ids.length > 0 && (
                <p className="text-xs text-text-muted">
                  {artifact.supporting_item_ids.length} supporting record
                  {artifact.supporting_item_ids.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── PipelineMetadataStrip ──────────────────────────────────────────

interface PipelineMetadataStripProps {
  metadata: PipelineMetadata;
}

function PipelineMetadataStrip({ metadata }: PipelineMetadataStripProps) {
  const kpis = [
    { label: 'Analyzed', value: metadata.total_analyzed, icon: Layers },
    { label: 'Filtered', value: metadata.filtered_count, icon: Filter },
    { label: 'Deduped', value: metadata.deduplicated_count, icon: Filter },
    { label: 'Repairs', value: metadata.validation_repairs, icon: Wrench },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <div
            key={kpi.label}
            className="flex items-center gap-1.5 rounded-md border border-border bg-gray-50 px-2.5 py-1 text-xs"
          >
            <Icon className="h-3 w-3 text-text-muted" />
            <span className="font-semibold text-text-primary">{kpi.value}</span>
            <span className="text-text-muted">{kpi.label}</span>
          </div>
        );
      })}
      {metadata.clustering_method && (
        <span className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
          {metadata.clustering_method}
        </span>
      )}
    </div>
  );
}

// ── LearningInsightsPanel (main export) ────────────────────────────

interface LearningInsightsPanelProps {
  learnings: LearningArtifact[];
  metadata: PipelineMetadata | null;
}

export function LearningInsightsPanel({ learnings, metadata }: LearningInsightsPanelProps) {
  if (learnings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-accent-gold" />
        <h3 className="text-sm font-bold text-text-primary">
          Learning Insights
          <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-text-muted">
            {learnings.length}
          </span>
        </h3>
      </div>

      {/* Metadata strip */}
      {metadata && <PipelineMetadataStrip metadata={metadata} />}

      {/* Scrollable card list */}
      <div className="max-h-[600px] space-y-2.5 overflow-y-auto">
        {learnings.map((artifact, idx) => (
          <LearningCard key={idx} artifact={artifact} />
        ))}
      </div>
    </div>
  );
}
