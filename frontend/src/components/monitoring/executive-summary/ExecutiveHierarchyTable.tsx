'use client';

import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Circle,
  Eye,
  Layers,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

import { HealthIndicator } from './HealthIndicator';
import { TrendSparkline } from './TrendSparkline';

import type { MetricCategory, MonitoringHierarchyNode } from '@/types';

interface ExecutiveHierarchyTableProps {
  nodes: Map<string, MonitoringHierarchyNode>;
  rootIds: string[];
  expandedNodes: string[];
  onToggleNode: (id: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onViewDetails: (node: MonitoringHierarchyNode) => void;
  className?: string;
}

type SortKey = 'name' | 'score' | 'health' | 'records';
type SortDir = 'asc' | 'desc';

const CATEGORY_BADGE: Record<string, { bg: string; text: string }> = {
  SCORE: { bg: 'bg-success/10', text: 'text-success' },
  CLASSIFICATION: { bg: 'bg-accent-gold/10', text: 'text-accent-gold' },
  ANALYSIS: { bg: 'bg-accent-silver/20', text: 'text-text-secondary' },
};

function CategoryBadge({ category }: { category?: MetricCategory }) {
  if (!category) return null;
  const style = CATEGORY_BADGE[category] || CATEGORY_BADGE.SCORE;
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
        style.bg,
        style.text
      )}
    >
      {category}
    </span>
  );
}

function LevelIcon({ level }: { level: 'source' | 'component' | 'metric' }) {
  if (level === 'metric') {
    return <Circle className="h-4 w-4 flex-shrink-0 text-text-muted" />;
  }
  return <Layers className="h-4 w-4 flex-shrink-0 text-primary" />;
}

function DeltaIndicator({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const isPositive = delta >= 0;
  return (
    <span
      className={cn('ml-1 text-[10px] font-medium', isPositive ? 'text-success' : 'text-error')}
    >
      {isPositive ? '+' : ''}
      {delta.toFixed(3)}
    </span>
  );
}

export function ExecutiveHierarchyTable({
  nodes,
  rootIds,
  expandedNodes,
  onToggleNode,
  onExpandAll,
  onCollapseAll,
  onViewDetails,
  className,
}: ExecutiveHierarchyTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'score' ? 'desc' : 'asc');
    }
  };

  // Build visible rows in order: root → children if expanded → grandchildren if expanded
  const visibleRows = useMemo(() => {
    const sortNodes = (ids: string[]): string[] => {
      return [...ids].sort((a, b) => {
        const na = nodes.get(a);
        const nb = nodes.get(b);
        if (!na || !nb) return 0;
        let cmp = 0;
        switch (sortKey) {
          case 'name':
            cmp = na.name.localeCompare(nb.name);
            break;
          case 'score':
            cmp = (na.avgScore ?? -1) - (nb.avgScore ?? -1);
            break;
          case 'health': {
            const order = { healthy: 0, warning: 1, critical: 2, unknown: 3 };
            cmp = order[na.healthStatus] - order[nb.healthStatus];
            break;
          }
          case 'records':
            cmp = na.recordCount - nb.recordCount;
            break;
        }
        return sortDir === 'desc' ? -cmp : cmp;
      });
    };

    const rows: string[] = [];
    const sortedRoots = sortNodes(rootIds);

    for (const rootId of sortedRoots) {
      rows.push(rootId);
      if (expandedNodes.includes(rootId)) {
        const root = nodes.get(rootId);
        if (root) {
          const sortedChildren = sortNodes(root.childIds);
          for (const childId of sortedChildren) {
            rows.push(childId);
            if (expandedNodes.includes(childId)) {
              const child = nodes.get(childId);
              if (child) {
                const sortedGrandchildren = sortNodes(child.childIds);
                rows.push(...sortedGrandchildren);
              }
            }
          }
        }
      }
    }
    return rows;
  }, [nodes, rootIds, expandedNodes, sortKey, sortDir]);

  const SortHeader = ({
    label,
    field,
    align,
  }: {
    label: string;
    field: SortKey;
    align?: string;
  }) => (
    <th
      className={cn(
        'cursor-pointer select-none px-3 py-2 text-xs font-medium uppercase text-text-muted hover:text-text-primary',
        align
      )}
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === field && <span className="text-primary">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  );

  return (
    <div className={cn('card', className)}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-text-primary">Agent Quality Scorecard</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onExpandAll}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text-muted hover:bg-gray-50 hover:text-text-primary"
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
            Expand All
          </button>
          <button
            onClick={onCollapseAll}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text-muted hover:bg-gray-50 hover:text-text-primary"
          >
            <ChevronsDownUp className="h-3.5 w-3.5" />
            Collapse
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-gray-50 text-left">
              <SortHeader label="Hierarchy" field="name" />
              <th className="px-3 py-2 text-xs font-medium uppercase text-text-muted">Category</th>
              <SortHeader label="Score" field="score" />
              <th className="px-3 py-2 text-xs font-medium uppercase text-text-muted">Trend</th>
              <SortHeader label="Health" field="health" />
              <SortHeader label="Records" field="records" />
              <th className="px-3 py-2 text-center text-xs font-medium uppercase text-text-muted">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((nodeId) => {
              const node = nodes.get(nodeId);
              if (!node) return null;

              const indent = node.level === 'source' ? 0 : node.level === 'component' ? 1 : 2;
              const hasChildren = node.childIds.length > 0;
              const isExpanded = expandedNodes.includes(nodeId);

              return (
                <tr
                  key={nodeId}
                  className={cn(
                    'border-b border-border last:border-0 hover:bg-gray-50',
                    node.level === 'source' && 'bg-gray-50/50 font-medium'
                  )}
                >
                  <td className="px-3 py-2.5">
                    <div
                      className="flex items-center gap-1.5"
                      style={{ paddingLeft: `${indent * 20}px` }}
                    >
                      {hasChildren ? (
                        <button
                          onClick={() => onToggleNode(nodeId)}
                          className="rounded p-0.5 hover:bg-gray-200"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-text-muted" />
                          )}
                        </button>
                      ) : (
                        <span className="w-[18px]" />
                      )}
                      <LevelIcon level={node.level} />
                      <span className={cn(node.level === 'source' && 'font-semibold')}>
                        {node.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {node.level === 'metric' && <CategoryBadge category={node.metricCategory} />}
                  </td>
                  <td className="px-3 py-2.5">
                    {node.avgScore !== null ? (
                      <span
                        className={cn(
                          'font-mono text-sm',
                          node.avgScore >= 0.7
                            ? 'text-success'
                            : node.avgScore >= 0.5
                              ? 'text-warning'
                              : 'text-error'
                        )}
                      >
                        {node.avgScore.toFixed(3)}
                        <DeltaIndicator delta={node.scoreDelta} />
                      </span>
                    ) : (
                      <span className="text-xs text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <TrendSparkline points={node.trendPoints} />
                  </td>
                  <td className="px-3 py-2.5">
                    <HealthIndicator status={node.healthStatus} />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-text-muted">
                    {node.recordCount}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {node.level === 'metric' && (
                      <button
                        onClick={() => onViewDetails(node)}
                        className="rounded p-1 text-text-muted hover:bg-primary/10 hover:text-primary"
                        title="View details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-text-muted">
                  No hierarchy data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
