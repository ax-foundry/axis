'use client';

import { Minus, ThumbsDown, ThumbsUp } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { ReviewVerdict } from '@/types/replay';

interface VerdictSelectorProps {
  value: ReviewVerdict | null;
  onChange: (v: ReviewVerdict) => void;
}

const OPTIONS: { verdict: ReviewVerdict; label: string; icon: typeof ThumbsUp; color: string }[] = [
  {
    verdict: 'positive',
    label: 'Positive',
    icon: ThumbsUp,
    color: 'border-green-500 bg-green-50 text-green-700',
  },
  {
    verdict: 'neutral',
    label: 'Neutral',
    icon: Minus,
    color: 'border-gray-400 bg-gray-50 text-gray-600',
  },
  {
    verdict: 'negative',
    label: 'Negative',
    icon: ThumbsDown,
    color: 'border-red-500 bg-red-50 text-red-700',
  },
];

export function VerdictSelector({ value, onChange }: VerdictSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {OPTIONS.map(({ verdict, label, icon: Icon, color }) => {
        const isSelected = value === verdict;
        return (
          <button
            key={verdict}
            type="button"
            onClick={() => onChange(verdict)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg border-2 px-2 py-2.5 text-xs font-medium transition-all',
              isSelected ? color : 'border-border bg-white text-text-muted hover:border-gray-300'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
