'use client';

import { Check, X, Trash2, Edit2 } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { FewShotExample } from '@/types';

interface FewShotExampleCardProps {
  example: FewShotExample;
  index: number;
  onEdit?: (index: number) => void;
  onDelete: (index: number) => void;
}

export function FewShotExampleCard({ example, index, onEdit, onDelete }: FewShotExampleCardProps) {
  const isAccepted = example.score === 1;

  return (
    <div className="rounded-lg border border-border bg-white transition-shadow hover:shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-muted">Example {index + 1}</span>
          <div
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
              isAccepted ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
            )}
          >
            {isAccepted ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {isAccepted ? 'Accept' : 'Reject'}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onEdit && (
            <button
              onClick={() => onEdit(index)}
              className="rounded p-1.5 text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary"
            >
              <Edit2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => onDelete(index)}
            className="hover:bg-error/10 rounded p-1.5 text-text-muted transition-colors hover:text-error"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-3 p-4">
        {/* Query */}
        <div>
          <div className="mb-1 text-xs font-medium text-text-muted">Query</div>
          <p className="line-clamp-2 text-sm text-text-secondary">{example.query}</p>
        </div>

        {/* Response */}
        <div>
          <div className="mb-1 text-xs font-medium text-text-muted">Response</div>
          <p className="line-clamp-2 text-sm text-text-secondary">{example.actual_output}</p>
        </div>

        {/* Reasoning */}
        <div>
          <div className="mb-1 text-xs font-medium text-text-muted">Reasoning</div>
          <p className="line-clamp-2 text-sm italic text-text-muted">{example.reasoning}</p>
        </div>
      </div>
    </div>
  );
}
