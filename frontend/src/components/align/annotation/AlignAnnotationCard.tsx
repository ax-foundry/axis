'use client';

import { Settings } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';
import { Columns } from '@/types';

import type { EvaluationRecord } from '@/types';

// Column display configuration
const COLUMN_CONFIG: Record<string, { label: string }> = {
  [Columns.QUERY]: { label: 'User Query' },
  [Columns.ACTUAL_OUTPUT]: { label: 'AI Response' },
  [Columns.EXPECTED_OUTPUT]: { label: 'Expected Output' },
};

interface AlignAnnotationCardProps {
  record: EvaluationRecord;
  index: number;
  total: number;
  currentScore?: 0 | 1;
  currentNotes?: string;
  displayColumns?: string[];
  onScore: (score: 0 | 1) => void;
  onNotesChange: (notes: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onConfigure?: () => void;
}

export function AlignAnnotationCard({
  record,
  index,
  total,
  currentScore,
  currentNotes = '',
  displayColumns = [],
  onScore,
  onNotesChange,
  onNext,
  onPrevious,
  onConfigure,
}: AlignAnnotationCardProps) {
  const defaultColumns: string[] = [Columns.QUERY, Columns.ACTUAL_OUTPUT];
  const columnsToShow = displayColumns.length > 0 ? displayColumns : defaultColumns;

  // Only expected output is collapsed by default
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    [Columns.EXPECTED_OUTPUT]: true,
  });

  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Keyboard shortcut: N to focus notes field
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        notesRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const getColumnLabel = (col: string) => {
    return COLUMN_CONFIG[col]?.label ?? col;
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Accent gradient bar */}
      <div
        className="h-[3px] opacity-70"
        style={{
          background: 'linear-gradient(90deg, #8B9F4F, #A4B86C, #D4AF37)',
        }}
      />

      {/* Compact Header: nav arrows + record label + record ID */}
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-0.5">
            <button
              onClick={onPrevious}
              disabled={index === 0}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-base leading-none text-text-muted transition-all hover:border-primary hover:bg-primary/5 hover:text-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              &#8249;
            </button>
            <button
              onClick={onNext}
              disabled={index === total - 1}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-base leading-none text-text-muted transition-all hover:border-primary hover:bg-primary/5 hover:text-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              &#8250;
            </button>
          </div>
          <div className="text-[13px] font-semibold text-text-primary">
            Record {index + 1} <span className="font-normal text-text-muted">of {total}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-gray-50 px-2 py-0.5 font-mono text-[11px] text-text-muted">
            {record[Columns.DATASET_ID]}
          </span>
          {onConfigure && (
            <button
              onClick={onConfigure}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text-muted transition-all hover:border-primary hover:text-primary"
              title="Configure columns"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Content Sections */}
      <div className="space-y-5 p-5">
        {columnsToShow.map((col) => {
          const value = record[col];
          if (
            (value === null || value === undefined || value === '') &&
            !defaultColumns.includes(col)
          ) {
            return null;
          }

          const isExpectedOutput = col === Columns.EXPECTED_OUTPUT;
          const isActualOutput = col === Columns.ACTUAL_OUTPUT;
          const isCollapsed = collapsedSections[col];

          return (
            <div key={col}>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                    {getColumnLabel(col)}
                  </span>
                  {isActualOutput && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-dark">
                      To Evaluate
                    </span>
                  )}
                </div>
                {isExpectedOutput && (
                  <button
                    onClick={() => toggleSection(col)}
                    className="flex items-center gap-1 text-[11px] font-medium text-text-muted hover:text-text-primary"
                  >
                    {isCollapsed ? 'Show \u25B6' : 'Hide \u25BC'}
                  </button>
                )}
              </div>
              {!(isExpectedOutput && isCollapsed) && (
                <div
                  className={cn(
                    'max-h-80 overflow-y-auto rounded-lg border p-3.5 text-[13px] leading-[1.7] text-text-secondary',
                    isActualOutput
                      ? 'border-l-[3px] border-b-gray-100 border-l-primary border-r-gray-100 border-t-gray-100 bg-gradient-to-r from-primary/[0.02] to-gray-50'
                      : 'border-gray-100 bg-gray-50'
                  )}
                >
                  <p className="whitespace-pre-wrap">{formatValue(value)}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Gradient divider */}
      <div
        className="mx-5 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, #E1E5EA, transparent)',
        }}
      />

      {/* Scoring Section */}
      <div className="px-5 pb-5 pt-5">
        <div className="mb-3.5 flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
            Your Assessment
          </span>
          <span className="text-text-muted/60 text-[10px]">
            Does the response meet quality standards?
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => onScore(1)}
            className={cn(
              'flex items-center justify-center gap-2.5 rounded-lg border-[1.5px] px-4 py-3.5 transition-all active:scale-[0.99]',
              currentScore === 1
                ? 'bg-success/5 border-success shadow-[0_0_0_3px_rgba(39,174,96,0.1)]'
                : 'hover:border-success/40 hover:bg-success/[0.02] border-border bg-white hover:-translate-y-px'
            )}
          >
            <span
              className={cn(
                'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-base transition-all',
                currentScore === 1
                  ? 'scale-105 bg-success text-white'
                  : 'bg-success/10 text-success'
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
                currentScore === 1
                  ? 'border-success/20 bg-success/10 text-success'
                  : 'border-border bg-gray-50 text-text-muted'
              )}
            >
              A
            </kbd>
          </button>
          <button
            onClick={() => onScore(0)}
            className={cn(
              'flex items-center justify-center gap-2.5 rounded-lg border-[1.5px] px-4 py-3.5 transition-all active:scale-[0.99]',
              currentScore === 0
                ? 'bg-error/5 border-error shadow-[0_0_0_3px_rgba(231,76,60,0.1)]'
                : 'hover:border-error/40 hover:bg-error/[0.02] border-border bg-white hover:-translate-y-px'
            )}
          >
            <span
              className={cn(
                'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-base transition-all',
                currentScore === 0 ? 'scale-105 bg-error text-white' : 'bg-error/10 text-error'
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
                currentScore === 0
                  ? 'border-error/20 bg-error/10 text-error'
                  : 'border-border bg-gray-50 text-text-muted'
              )}
            >
              R
            </kbd>
          </button>
        </div>
      </div>

      {/* Notes Section */}
      <div className="px-5 pb-5">
        <div className="mb-1.5 flex items-baseline gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
            Notes
          </span>
          <span className="text-text-muted/50 text-[10px]">
            optional — powers pattern discovery
          </span>
        </div>
        <textarea
          ref={notesRef}
          placeholder="What did you observe? e.g., 'Missing billing tier breakdown...'"
          value={currentNotes}
          onChange={(e) => onNotesChange(e.target.value)}
          className="placeholder:text-text-muted/40 w-full rounded-lg border border-border p-2.5 text-xs leading-relaxed text-text-secondary transition-all focus:border-primary focus:shadow-[0_0_0_3px_rgba(139,159,79,0.12)] focus:outline-none"
          rows={2}
        />
        <p className="text-text-muted/70 mt-1 text-[10px]">
          Detailed notes help CaliberHQ discover annotation patterns and auto-generate evaluation
          criteria.
        </p>
      </div>
    </div>
  );
}
