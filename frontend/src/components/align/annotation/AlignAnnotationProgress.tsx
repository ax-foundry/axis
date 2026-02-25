'use client';

import { useMemo } from 'react';

import { cn } from '@/lib/utils';
import { Columns } from '@/types';

import type { EvaluationRecord, AnnotationWithNotes } from '@/types';

interface AlignAnnotationProgressProps {
  records: EvaluationRecord[];
  annotations: Record<string, AnnotationWithNotes>;
  currentIndex: number;
  onSelectRecord: (index: number) => void;
}

export function AlignAnnotationProgress({
  records,
  annotations,
  currentIndex,
  onSelectRecord,
}: AlignAnnotationProgressProps) {
  const stats = useMemo(() => {
    const total = records.length;
    const annotated = Object.keys(annotations).length;
    const accepted = Object.values(annotations).filter((v) => v.score === 1).length;
    const rejected = Object.values(annotations).filter((v) => v.score === 0).length;
    const pending = total - annotated;
    const percentage = total > 0 ? Math.round((annotated / total) * 100) : 0;

    return { total, annotated, accepted, rejected, pending, percentage };
  }, [records, annotations]);

  return (
    <div className="flex flex-col gap-4">
      {/* Card 1: Progress */}
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {/* Header: percentage + label */}
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-2xl font-bold text-primary">{stats.percentage}%</div>
            <div className="text-xs text-text-muted">
              {stats.annotated} of {stats.total} records
            </div>
          </div>
        </div>

        {/* Thin progress bar */}
        <div className="mx-4 h-[3px] overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${stats.percentage}%` }}
          />
        </div>

        <div className="h-2" />

        {/* Stats grid with borders */}
        <div className="grid grid-cols-3 border-t border-border">
          <div className="py-2.5 text-center">
            <div className="text-base font-bold text-success">{stats.accepted}</div>
            <div className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Accepted
            </div>
          </div>
          <div className="border-x border-border py-2.5 text-center">
            <div className="text-base font-bold text-error">{stats.rejected}</div>
            <div className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Rejected
            </div>
          </div>
          <div className="py-2.5 text-center">
            <div className="text-base font-bold text-text-muted">{stats.pending}</div>
            <div className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Pending
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: Record List */}
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5 text-xs font-semibold text-text-primary">
          Records
          <span className="font-normal text-text-muted">{stats.total} total</span>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {records.map((record, index) => {
            const recordId = record[Columns.DATASET_ID];
            const isAccepted = annotations[recordId]?.score === 1;
            const isRejected = annotations[recordId]?.score === 0;
            const isCurrent = index === currentIndex;

            return (
              <button
                key={recordId}
                onClick={() => onSelectRecord(index)}
                className={cn(
                  'flex w-full items-center gap-2 border-b border-gray-100 px-3.5 py-2 text-left text-xs transition-colors last:border-b-0 hover:bg-gray-50',
                  isCurrent && 'border-l-[3px] border-l-primary bg-primary/5'
                )}
              >
                <span
                  className={cn(
                    'h-[7px] w-[7px] flex-shrink-0 rounded-full',
                    isAccepted ? 'bg-success' : isRejected ? 'bg-error' : 'bg-border'
                  )}
                />
                <span className="flex-1 truncate text-text-secondary">
                  <strong className="font-semibold text-text-primary">#{index + 1}</strong>{' '}
                  {String(recordId)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Card 3: Keyboard Shortcuts (always visible) */}
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <div className="border-b border-border px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Keyboard Shortcuts
        </div>
        <div className="px-3.5 py-2.5">
          {[
            { label: 'Accept', key: 'A' },
            { label: 'Reject', key: 'R' },
            { label: 'Navigate', keys: ['\u2190', '\u2192'] },
            { label: 'Focus notes', key: 'N' },
          ].map((shortcut, idx) => (
            <div
              key={shortcut.label}
              className={cn(
                'flex items-center justify-between py-1.5',
                idx > 0 && 'border-t border-gray-100'
              )}
            >
              <span className="text-xs text-text-secondary">{shortcut.label}</span>
              {'keys' in shortcut && shortcut.keys ? (
                <div className="flex gap-1">
                  {shortcut.keys.map((k) => (
                    <kbd
                      key={k}
                      className="min-w-[26px] rounded border border-border bg-gray-50 px-2 py-0.5 text-center font-mono text-xs text-text-primary"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              ) : (
                <kbd className="min-w-[26px] rounded border border-border bg-gray-50 px-2 py-0.5 text-center font-mono text-xs text-text-primary">
                  {shortcut.key}
                </kbd>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
