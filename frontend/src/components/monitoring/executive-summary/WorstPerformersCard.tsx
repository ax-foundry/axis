'use client';

import { useMemo } from 'react';

import { cn } from '@/lib/utils';

import { HealthIndicator } from './HealthIndicator';

import type { MonitoringHierarchyNode } from '@/types';

interface WorstPerformersCardProps {
  nodes: Map<string, MonitoringHierarchyNode>;
  className?: string;
}

export function WorstPerformersCard({ nodes, className }: WorstPerformersCardProps) {
  const worst = useMemo(() => {
    return Array.from(nodes.values())
      .filter((n) => n.level === 'metric' && n.avgScore !== null)
      .sort((a, b) => (a.avgScore ?? 1) - (b.avgScore ?? 1))
      .slice(0, 5);
  }, [nodes]);

  return (
    <div className={cn('card', className)}>
      <h3 className="mb-3 font-semibold text-text-primary">Worst Performing Metrics</h3>
      {worst.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">No score data available</p>
      ) : (
        <div className="space-y-2">
          {worst.map((node) => (
            <div
              key={node.id}
              className="flex items-center justify-between rounded-lg border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{node.name}</p>
                <p className="truncate text-xs text-text-muted">
                  {node.sourceName}
                  {node.sourceComponent && node.sourceComponent !== '(default)'
                    ? ` / ${node.sourceComponent}`
                    : ''}
                </p>
              </div>
              <div className="ml-3 flex items-center gap-3">
                <span
                  className={cn(
                    'font-mono text-sm font-semibold',
                    (node.avgScore ?? 0) >= 0.7
                      ? 'text-success'
                      : (node.avgScore ?? 0) >= 0.5
                        ? 'text-warning'
                        : 'text-error'
                  )}
                >
                  {node.avgScore?.toFixed(3) ?? '—'}
                </span>
                <HealthIndicator status={node.healthStatus} showLabel={false} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
