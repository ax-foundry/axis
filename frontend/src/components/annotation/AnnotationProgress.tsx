'use client';

import { useMemo } from 'react';

import { cn } from '@/lib/utils';

import { getAnnotationShortcuts } from './hooks/useAnnotationKeyboard';

import type {
  AnnotationFilter,
  EvaluationRecord,
  AnnotationData,
  AnnotationScoreMode,
} from '@/types';

interface UniqueRecord {
  id: string;
  firstIndex: number;
  record: EvaluationRecord;
}

interface AnnotationProgressProps {
  uniqueRecords: UniqueRecord[];
  annotations: Record<string, AnnotationData>;
  currentIndex: number;
  filter: AnnotationFilter;
  showShortcuts: boolean;
  scoreMode: AnnotationScoreMode;
  customScoreRange?: [number, number];
  onSelectRecord: (index: number) => void;
  onFilterChange: (filter: AnnotationFilter) => void;
  onToggleShortcuts: () => void;
}

export function AnnotationProgress({
  uniqueRecords,
  annotations,
  currentIndex,
  filter,
  scoreMode,
  customScoreRange,
  onSelectRecord,
  onFilterChange,
}: AnnotationProgressProps) {
  // Calculate stats based on unique records
  const stats = useMemo(() => {
    const total = uniqueRecords.length;
    let annotated = 0;
    let flagged = 0;

    uniqueRecords.forEach(({ id }) => {
      const annotation = annotations[id];
      if (annotation) {
        if (annotation.score !== undefined || annotation.tags.length > 0 || annotation.critique) {
          annotated++;
        }
        if (annotation.flagged) {
          flagged++;
        }
      }
    });

    return {
      total,
      annotated,
      pending: total - annotated,
      flagged,
      percentage: total > 0 ? Math.round((annotated / total) * 100) : 0,
    };
  }, [uniqueRecords, annotations]);

  // Filter unique records based on current filter, preserving original index
  const filteredRecords = useMemo(() => {
    return uniqueRecords
      .map((record, index) => ({ ...record, uniqueIndex: index }))
      .filter(({ id }) => {
        const annotation = annotations[id];
        const isAnnotated =
          annotation &&
          (annotation.score !== undefined || annotation.tags.length > 0 || annotation.critique);
        const isFlagged = annotation?.flagged;

        switch (filter) {
          case 'pending':
            return !isAnnotated;
          case 'done':
            return isAnnotated;
          case 'flagged':
            return isFlagged;
          default:
            return true;
        }
      });
  }, [uniqueRecords, annotations, filter]);

  const shortcuts = getAnnotationShortcuts(scoreMode, customScoreRange);

  const filterOptions: { value: AnnotationFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: stats.total },
    { value: 'pending', label: 'Pending', count: stats.pending },
    { value: 'done', label: 'Done', count: stats.annotated },
    { value: 'flagged', label: 'Flagged', count: stats.flagged },
  ];

  return (
    <div className="sticky top-5 flex flex-col gap-4">
      {/* Card 1: Progress */}
      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        <div className="px-4 pb-3 pt-4">
          <div className="text-[28px] font-bold leading-none tracking-tight text-primary">
            {stats.percentage}%
          </div>
          <div className="mt-0.5 text-[11px] text-text-muted">
            {stats.annotated} of {stats.total} records
          </div>
        </div>

        {/* Thin progress bar with glowing dot */}
        <div className="relative mx-4 h-[3px] overflow-visible rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light transition-all duration-500"
            style={{ width: `${stats.percentage}%` }}
          />
          {stats.percentage > 0 && (
            <div
              className="absolute top-1/2 h-[5px] w-[5px] -translate-y-1/2 rounded-full bg-primary shadow-[0_0_6px_rgba(139,159,79,0.4)]"
              style={{ left: `${stats.percentage}%`, marginLeft: '-2.5px' }}
            />
          )}
        </div>

        <div className="h-3" />

        {/* Stats grid — 4 columns */}
        <div className="grid grid-cols-4 border-t border-gray-100">
          <div className="py-2.5 text-center">
            <div className="text-base font-bold text-success">{stats.annotated}</div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
              Done
            </div>
          </div>
          <div className="border-l border-gray-100 py-2.5 text-center">
            <div className="text-base font-bold text-text-muted">{stats.pending}</div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
              Pending
            </div>
          </div>
          <div className="border-l border-gray-100 py-2.5 text-center">
            <div className="text-base font-bold text-orange-500">{stats.flagged}</div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
              Flagged
            </div>
          </div>
          <div className="border-l border-gray-100 py-2.5 text-center">
            <div className="text-base font-bold text-text-primary">{stats.total}</div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
              Total
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: Record List */}
      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        {/* Filter Tabs */}
        <div className="mx-3 mt-2 flex gap-0 rounded-md bg-gray-50 p-[3px]">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onFilterChange(opt.value)}
              className={cn(
                'flex-1 rounded px-1 py-[5px] text-center text-[10px] font-medium transition-all',
                filter === opt.value
                  ? 'bg-white font-semibold text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              )}
            >
              {opt.label}
              <span className="ml-0.5 text-[9px] text-text-muted">({opt.count})</span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
          <span className="text-xs font-semibold text-text-primary">Records</span>
          <span className="text-[10px] text-text-muted">{filteredRecords.length} shown</span>
        </div>

        <div className="max-h-64 overflow-y-auto">
          {filteredRecords.slice(0, 100).map(({ id, uniqueIndex }) => {
            const annotation = annotations[id];
            const isAnnotated =
              annotation &&
              (annotation.score !== undefined || annotation.tags.length > 0 || annotation.critique);
            const isFlagged = annotation?.flagged;
            const isCurrent = uniqueIndex === currentIndex;

            return (
              <button
                key={id}
                onClick={() => onSelectRecord(uniqueIndex)}
                className={cn(
                  'flex w-full items-center gap-2 border-b border-gray-50 px-4 py-[7px] text-left text-[11px] transition-all last:border-b-0 hover:bg-primary/[0.03]',
                  isCurrent && 'border-l-[3px] border-l-primary bg-primary/5'
                )}
              >
                <span
                  className={cn(
                    'h-[7px] w-[7px] flex-shrink-0 rounded-full transition-transform',
                    isCurrent && 'animate-pulse',
                    isAnnotated ? 'bg-success' : isFlagged ? 'bg-orange-500' : 'bg-border'
                  )}
                />
                <span className="font-semibold text-text-primary">#{uniqueIndex + 1}</span>
                <span className="flex-1 truncate font-mono text-[10px] text-text-muted">{id}</span>
              </button>
            );
          })}
          {filteredRecords.length > 100 && (
            <p className="py-2 text-center text-[10px] text-text-muted">
              +{filteredRecords.length - 100} more records
            </p>
          )}
          {filteredRecords.length === 0 && (
            <p className="py-4 text-center text-xs text-text-muted">No records match this filter</p>
          )}
        </div>
      </div>

      {/* Card 3: Keyboard Shortcuts (always visible) */}
      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-2.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-text-muted">
          Keyboard Shortcuts
        </div>
        <div className="px-4 py-2">
          {shortcuts.map((shortcut, idx) => (
            <div
              key={shortcut.key}
              className={cn(
                'flex items-center justify-between py-[5px]',
                idx > 0 && 'border-t border-gray-50'
              )}
            >
              <span className="text-[11px] text-text-secondary">{shortcut.description}</span>
              <kbd className="min-w-[24px] rounded border border-border bg-gray-50 px-1.5 py-0.5 text-center font-mono text-[10px] font-medium text-text-primary">
                {shortcut.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
