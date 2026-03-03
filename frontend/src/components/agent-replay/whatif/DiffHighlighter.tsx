'use client';

import { computeWordDiff, stringifyForDiff } from '@/lib/diff-utils';

import type { DiffSegment } from '@/lib/diff-utils';

interface DiffHighlighterProps {
  original: unknown;
  simulated: unknown;
}

export function DiffHighlighter({ original, simulated }: DiffHighlighterProps) {
  const origStr = stringifyForDiff(original);
  const simStr = stringifyForDiff(simulated);

  if (origStr === simStr) {
    return (
      <div className="rounded-md border border-border bg-gray-50 px-3 py-2 text-xs text-text-muted">
        No differences detected
      </div>
    );
  }

  const segments = computeWordDiff(origStr, simStr);

  return (
    <div className="max-h-[300px] overflow-y-auto rounded-md border border-border bg-white">
      <div className="border-b border-border bg-gray-50 px-3 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">
          Changes
        </span>
      </div>
      <pre className="whitespace-pre-wrap px-3 py-2 font-mono text-[11px] leading-relaxed">
        {segments.map((seg: DiffSegment, i: number) => {
          if (seg.type === 'equal') {
            return <span key={i}>{seg.value}</span>;
          }
          if (seg.type === 'delete') {
            return (
              <span key={i} className="rounded-sm bg-red-100 text-red-700 line-through">
                {seg.value}
              </span>
            );
          }
          return (
            <span key={i} className="rounded-sm bg-emerald-100 text-emerald-700">
              {seg.value}
            </span>
          );
        })}
      </pre>
    </div>
  );
}
