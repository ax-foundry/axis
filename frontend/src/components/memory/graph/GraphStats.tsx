'use client';

import { AlertTriangle, GitBranch, Loader2, Shield, Target } from 'lucide-react';

import { useMemoryGraphSummary } from '@/lib/hooks/memory-hooks';
import { GraphNodeColors } from '@/types/memory';

import type { GraphNodeType } from '@/types/memory';

interface StatCard {
  label: string;
  type: GraphNodeType;
  icon: typeof Shield;
}

const STAT_CARDS: StatCard[] = [
  { label: 'Risk Factors', type: 'RiskFactor', icon: AlertTriangle },
  { label: 'Rules', type: 'Rule', icon: Shield },
  { label: 'Outcomes', type: 'Outcome', icon: Target },
  { label: 'Mitigants', type: 'Mitigant', icon: GitBranch },
  { label: 'Sources', type: 'Source', icon: GitBranch },
];

export function GraphStats() {
  const { data, isLoading } = useMemoryGraphSummary();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    );
  }

  const nodesByType = data?.nodes_by_type ?? {};

  return (
    <div className="grid grid-cols-5 gap-3">
      {STAT_CARDS.map((card) => {
        const Icon = card.icon;
        const count = nodesByType[card.type] ?? 0;
        return (
          <div
            key={card.type}
            className="flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-3"
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${GraphNodeColors[card.type]}20` }}
            >
              <Icon className="h-4 w-4" style={{ color: GraphNodeColors[card.type] }} />
            </div>
            <div>
              <div className="text-lg font-semibold text-text-primary">{count}</div>
              <div className="text-xs text-text-muted">{card.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
