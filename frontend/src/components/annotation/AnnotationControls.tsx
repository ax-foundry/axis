'use client';

import { ScoreSelector } from './ScoreSelector';
import { TagSelector } from './TagManager';

import type { AnnotationScoreMode, AnnotationScoreValue, AnnotationData } from '@/types';

interface AnnotationControlsProps {
  annotation: AnnotationData | null;
  scoreMode: AnnotationScoreMode;
  customScoreRange?: [number, number];
  availableTags: string[];
  onScoreChange: (score: AnnotationScoreValue) => void;
  onTagToggle: (tag: string) => void;
  onCritiqueChange: (critique: string) => void;
}

export function AnnotationControls({
  annotation,
  scoreMode,
  customScoreRange,
  availableTags,
  onScoreChange,
  onTagToggle,
  onCritiqueChange,
}: AnnotationControlsProps) {
  const currentAnnotation = annotation || { tags: [], critique: '' };

  return (
    <div className="space-y-0">
      {/* Gradient divider */}
      <div
        className="mx-5 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, #E1E5EA, transparent)',
        }}
      />

      {/* Score */}
      <div className="px-5 pb-5 pt-5">
        <div className="mb-3.5 flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
            {scoreMode === 'binary'
              ? 'Verdict'
              : `Score (${scoreMode === 'scale-5' ? '1-5' : `${customScoreRange?.[0]}-${customScoreRange?.[1]}`})`}
          </span>
          <span className="text-text-muted/60 text-[10px]">Rate this response</span>
        </div>
        <ScoreSelector
          mode={scoreMode}
          value={currentAnnotation.score}
          customRange={customScoreRange}
          onChange={onScoreChange}
        />
      </div>

      {/* Tags */}
      <div className="px-5 pb-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
            Tags
          </span>
        </div>
        <TagSelector
          availableTags={availableTags}
          selectedTags={currentAnnotation.tags}
          onToggleTag={onTagToggle}
        />
      </div>

      {/* Critique / Notes */}
      <div className="px-5 pb-5">
        <div className="mb-1.5 flex items-baseline gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
            Critique / Notes
          </span>
          <span className="text-text-muted/50 text-[10px]">optional</span>
        </div>
        <textarea
          value={currentAnnotation.critique || ''}
          onChange={(e) => onCritiqueChange(e.target.value)}
          placeholder="Add detailed feedback..."
          rows={2}
          className="placeholder:text-text-muted/40 w-full rounded-lg border border-border p-2.5 text-xs leading-relaxed text-text-secondary transition-all focus:border-primary focus:shadow-[0_0_0_3px_rgba(139,159,79,0.12)] focus:outline-none"
        />
        <p className="text-text-muted/70 mt-1 text-[10px]">
          Critique is exported with your annotations and helps reviewers understand your reasoning.
        </p>
      </div>
    </div>
  );
}
