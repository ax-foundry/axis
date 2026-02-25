'use client';

import { cn } from '@/lib/utils';

import type { AnnotationScoreMode, AnnotationScoreValue } from '@/types';

interface ScoreSelectorProps {
  mode: AnnotationScoreMode;
  value?: AnnotationScoreValue;
  customRange?: [number, number];
  onChange: (score: AnnotationScoreValue) => void;
  className?: string;
}

export function ScoreSelector({
  mode,
  value,
  customRange = [1, 5],
  onChange,
  className,
}: ScoreSelectorProps) {
  if (mode === 'binary') {
    return (
      <div className={cn('grid grid-cols-2 gap-2.5', className)}>
        <button
          onClick={() => onChange('accept')}
          className={cn(
            'flex items-center justify-center gap-2.5 rounded-lg border-[1.5px] px-4 py-3.5 transition-all active:scale-[0.99]',
            value === 'accept'
              ? 'bg-success/5 border-success shadow-[0_0_0_3px_rgba(39,174,96,0.1)]'
              : 'hover:border-success/40 hover:bg-success/[0.02] border-border bg-white hover:-translate-y-px'
          )}
        >
          <span
            className={cn(
              'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-base transition-all',
              value === 'accept' ? 'scale-105 bg-success text-white' : 'bg-success/10 text-success'
            )}
          >
            &#10003;
          </span>
          <span className="flex flex-col items-start">
            <strong className="text-[13px] font-semibold leading-tight">Accept</strong>
            <small className="text-[10px] text-text-muted">Meets expectations</small>
          </span>
          <kbd
            className={cn(
              'ml-auto rounded border px-1.5 py-0.5 font-mono text-[11px] transition-all',
              value === 'accept'
                ? 'border-success/20 bg-success/10 text-success'
                : 'border-border bg-gray-50 text-text-muted'
            )}
          >
            A
          </kbd>
        </button>
        <button
          onClick={() => onChange('reject')}
          className={cn(
            'flex items-center justify-center gap-2.5 rounded-lg border-[1.5px] px-4 py-3.5 transition-all active:scale-[0.99]',
            value === 'reject'
              ? 'bg-error/5 border-error shadow-[0_0_0_3px_rgba(231,76,60,0.1)]'
              : 'hover:border-error/40 hover:bg-error/[0.02] border-border bg-white hover:-translate-y-px'
          )}
        >
          <span
            className={cn(
              'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-base transition-all',
              value === 'reject' ? 'scale-105 bg-error text-white' : 'bg-error/10 text-error'
            )}
          >
            &#10007;
          </span>
          <span className="flex flex-col items-start">
            <strong className="text-[13px] font-semibold leading-tight">Reject</strong>
            <small className="text-[10px] text-text-muted">Needs improvement</small>
          </span>
          <kbd
            className={cn(
              'ml-auto rounded border px-1.5 py-0.5 font-mono text-[11px] transition-all',
              value === 'reject'
                ? 'border-error/20 bg-error/10 text-error'
                : 'border-border bg-gray-50 text-text-muted'
            )}
          >
            R
          </kbd>
        </button>
      </div>
    );
  }

  // Scale mode (scale-5 or custom)
  const [min, max] = mode === 'scale-5' ? [1, 5] : customRange;
  const scores = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className={cn('flex gap-1.5', className)}>
      {scores.map((score) => (
        <button
          key={score}
          onClick={() => onChange(score)}
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-lg border-[1.5px] text-[15px] font-semibold transition-all active:scale-95',
            value === score
              ? '-translate-y-px border-primary bg-primary text-white shadow-[0_0_0_3px_rgba(139,159,79,0.15),0_2px_8px_rgba(139,159,79,0.25)]'
              : 'border-border bg-white text-text-secondary hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5 hover:text-primary'
          )}
        >
          {score}
        </button>
      ))}
    </div>
  );
}

// Keyboard hints for score selection
export function getScoreKeyboardHints(
  mode: AnnotationScoreMode,
  customRange?: [number, number]
): string[] {
  if (mode === 'binary') {
    return ['a = Accept', 'r = Reject'];
  }
  const [min, max] = mode === 'scale-5' ? [1, 5] : customRange || [1, 5];
  return [`${min}-${max} = Set score`];
}
