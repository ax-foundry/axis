'use client';

import { ArrowLeftRight, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { computeWordDiff, stringifyForDiff } from '@/lib/diff-utils';
import { cn } from '@/lib/utils';

import type { DiffSegment } from '@/lib/diff-utils';

interface DiffHighlighterProps {
  original: unknown;
  simulated: unknown;
}

export function DiffHighlighter({ original, simulated }: DiffHighlighterProps) {
  const origStr = stringifyForDiff(original);
  const simStr = stringifyForDiff(simulated);
  const [modalOpen, setModalOpen] = useState(false);

  if (origStr === simStr) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/15 bg-primary/[0.03] px-4 py-2.5 text-xs font-semibold text-primary transition-all hover:border-primary/30 hover:bg-primary/[0.06] hover:shadow-sm"
      >
        <ArrowLeftRight className="h-3.5 w-3.5" />
        View Side-by-Side Diff
      </button>

      {modalOpen && (
        <DiffModal origStr={origStr} simStr={simStr} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Full-screen diff modal
// ---------------------------------------------------------------------------

interface DiffModalProps {
  origStr: string;
  simStr: string;
  onClose: () => void;
}

function DiffModal({ origStr, simStr, onClose }: DiffModalProps) {
  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  const segments = useMemo(() => computeWordDiff(origStr, simStr), [origStr, simStr]);

  // Split segments into "original" (equal + delete) and "simulated" (equal + insert)
  const originalSegments = useMemo(() => segments.filter((s) => s.type !== 'insert'), [segments]);
  const simulatedSegments = useMemo(() => segments.filter((s) => s.type !== 'delete'), [segments]);

  // Count changes
  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const seg of segments) {
      if (seg.type === 'insert') added += seg.value.split(/\s+/).filter(Boolean).length;
      if (seg.type === 'delete') removed += seg.value.split(/\s+/).filter(Boolean).length;
    }
    return { added, removed };
  }, [segments]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[85vh] w-[92vw] max-w-7xl flex-col overflow-hidden rounded-2xl border-2 border-primary/20 bg-surface shadow-2xl shadow-primary/10">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 bg-gradient-to-r from-primary to-primary-dark px-5 py-3">
          <ArrowLeftRight className="h-4 w-4 text-white/80" />
          <h2 className="text-sm font-bold text-white">Side-by-Side Diff</h2>
          <div className="ml-3 flex items-center gap-2">
            {stats.removed > 0 && (
              <span className="rounded-full bg-red-500/20 px-2.5 py-0.5 text-[10px] font-bold text-white">
                −{stats.removed} words
              </span>
            )}
            {stats.added > 0 && (
              <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[10px] font-bold text-white">
                +{stats.added} words
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-auto rounded-md p-1 text-white/60 transition-colors hover:bg-white/20 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Side-by-side panes */}
        <div className="grid min-h-0 flex-1 grid-cols-2">
          {/* Original */}
          <div className="flex min-h-0 flex-col overflow-hidden border-r border-primary/10">
            <div className="shrink-0 border-b border-border bg-red-50/50 px-4 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-600">
                Original
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <DiffContent segments={originalSegments} side="original" />
            </div>
          </div>

          {/* Simulated */}
          <div className="flex min-h-0 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-primary/10 bg-emerald-50/50 px-4 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                Simulated
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <DiffContent segments={simulatedSegments} side="simulated" />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Diff content renderer
// ---------------------------------------------------------------------------

function DiffContent({
  segments,
  side,
}: {
  segments: DiffSegment[];
  side: 'original' | 'simulated';
}) {
  return (
    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-text-primary">
      {segments.map((seg, i) => {
        if (seg.type === 'equal') {
          return <span key={i}>{seg.value}</span>;
        }
        if (seg.type === 'delete' && side === 'original') {
          return (
            <span
              key={i}
              className={cn(
                'rounded-sm bg-red-100 px-0.5 text-red-800 line-through decoration-red-400/60'
              )}
            >
              {seg.value}
            </span>
          );
        }
        if (seg.type === 'insert' && side === 'simulated') {
          return (
            <span key={i} className="rounded-sm bg-emerald-100 px-0.5 text-emerald-800">
              {seg.value}
            </span>
          );
        }
        return null;
      })}
    </pre>
  );
}
