'use client';

import { GraphNodeColors } from '@/types/memory';

import type { GraphNodeType } from '@/types/memory';

const NODE_TYPES: GraphNodeType[] = ['RiskFactor', 'Rule', 'Outcome', 'Mitigant', 'Source'];

const TYPE_LABELS: Record<GraphNodeType, string> = {
  RiskFactor: 'Risk Factor',
  Rule: 'Rule',
  Outcome: 'Outcome',
  Mitigant: 'Mitigant',
  Source: 'Source',
};

export function GraphLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-text-muted">
      {NODE_TYPES.map((type) => (
        <div key={type} className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: GraphNodeColors[type] }}
          />
          <span>{TYPE_LABELS[type]}</span>
        </div>
      ))}
    </div>
  );
}
