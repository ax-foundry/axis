'use client';

import { ChevronDown, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  generateDisplayRows,
  getTypeIcon,
  getTypeLabel,
  getTypeColorClass,
  formatScore,
  formatScoreRange,
} from '@/lib/scorecard-utils';
import { cn } from '@/lib/utils';
import { useDataStore, useUIStore } from '@/stores';

import { ScorecardSparkline } from './ScorecardSparkline';

import type { ScorecardDisplayRow, ScorecardMetric } from '@/lib/scorecard-utils';

interface ScorecardTableProps {
  hierarchy: Map<string, ScorecardMetric>;
  showWeights?: boolean;
  onMetricClick?: (metricName: string) => void;
  onGenerateReport?: (metricName?: string) => void;
}

type SortField = 'name' | 'score' | 'weight';
type SortDirection = 'asc' | 'desc';

export function ScorecardTable({
  hierarchy,
  showWeights = true,
  onMetricClick,
  onGenerateReport,
}: ScorecardTableProps) {
  const { metricColumns, componentColumns } = useDataStore();
  const {
    scorecardExpandedNodes,
    toggleScorecardNode,
    expandAllScorecardNodes,
    collapseAllScorecardNodes,
  } = useUIStore();
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const expandedSet = useMemo(() => new Set(scorecardExpandedNodes), [scorecardExpandedNodes]);

  const rows = useMemo(() => {
    return generateDisplayRows(hierarchy, expandedSet);
  }, [hierarchy, expandedSet]);

  // Get visible rows only
  const visibleRows = useMemo(() => {
    let filtered = rows.filter((row) => row.isVisible);

    // Sort only root-level nodes, keep hierarchy structure
    if (sortField !== 'name') {
      // Group by parent to maintain hierarchy while sorting
      const rootRows = filtered.filter((r) => r.level === 1);

      rootRows.sort((a, b) => {
        let comparison = 0;
        if (sortField === 'score') {
          comparison = a.avgScore - b.avgScore;
        } else if (sortField === 'weight') {
          comparison = a.weight - b.weight;
        }
        return sortDirection === 'desc' ? -comparison : comparison;
      });

      // Rebuild filtered array maintaining hierarchy
      const sortedFiltered: ScorecardDisplayRow[] = [];
      const addWithChildren = (row: ScorecardDisplayRow) => {
        sortedFiltered.push(row);
        // Find and add children
        filtered
          .filter((r) => r.parent === row.metricName && r.isVisible)
          .forEach((child) => addWithChildren(child));
      };

      rootRows.forEach((root) => addWithChildren(root));
      filtered = sortedFiltered;
    }

    return filtered;
  }, [rows, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowDown className="h-3 w-3" />
    );
  };

  // Get all expandable node IDs
  const allExpandableNodes = useMemo(() => {
    const expandable: string[] = [];
    hierarchy.forEach((metric, name) => {
      if (metric.childMetrics.length > 0) {
        expandable.push(name);
      }
    });
    return expandable;
  }, [hierarchy]);

  const allExpanded = allExpandableNodes.every((id) => expandedSet.has(id));

  if (visibleRows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-text-muted">
        No metrics to display
      </div>
    );
  }

  return (
    <div className="border-border/50 overflow-hidden rounded-xl border bg-white shadow-sm">
      {/* Header actions */}
      <div className="border-border/50 flex items-center justify-between border-b bg-gray-50/50 px-4 py-2">
        <span className="text-sm text-text-muted">
          {metricColumns.length} metrics • {componentColumns.length} components
        </span>
        <button
          onClick={() =>
            allExpanded ? collapseAllScorecardNodes() : expandAllScorecardNodes(allExpandableNodes)
          }
          className="text-xs text-primary transition-colors hover:text-primary-dark"
        >
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-border/50 border-b bg-gray-50/30">
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort('name')}
                  className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary"
                >
                  Hierarchy {getSortIcon('name')}
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Type
                </span>
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort('score')}
                  className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary"
                >
                  Score {getSortIcon('score')}
                </button>
              </th>
              {showWeights && (
                <>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort('weight')}
                      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary"
                    >
                      Weight {getSortIcon('weight')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                      Norm. Weight
                    </span>
                  </th>
                </>
              )}
              <th className="px-4 py-3 text-left">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Distribution
                </span>
              </th>
              {onGenerateReport && (
                <th className="px-4 py-3 text-center">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Actions
                  </span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-border/30 divide-y">
            {visibleRows.map((row) => (
              <ScorecardTableRow
                key={row.metricName}
                row={row}
                showWeights={showWeights}
                onToggle={() => toggleScorecardNode(row.metricName)}
                onClick={() => onMetricClick?.(row.metricName)}
                onGenerateReport={onGenerateReport}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface ScorecardTableRowProps {
  row: ScorecardDisplayRow;
  showWeights: boolean;
  onToggle: () => void;
  onClick: () => void;
  onGenerateReport?: (metricName?: string) => void;
}

function ScorecardTableRow({
  row,
  showWeights,
  onToggle,
  onClick,
  onGenerateReport,
}: ScorecardTableRowProps) {
  const Icon = getTypeIcon(row.type);
  const typeLabel = getTypeLabel(row.type);
  const typeColorClass = getTypeColorClass(row.type);

  // Calculate indent based on level
  const indent = (row.level - 1) * 24;

  return (
    <tr
      className={cn(
        'animate-fade-in-up cursor-pointer transition-colors hover:bg-gray-50/50',
        row.hasChildren && 'font-medium'
      )}
      onClick={(e) => {
        // Don't trigger row click if clicking expand button
        if ((e.target as HTMLElement).closest('button')) return;
        onClick();
      }}
    >
      {/* Hierarchy column */}
      <td className="px-4 py-3">
        <div className="flex items-center" style={{ paddingLeft: indent }}>
          {row.hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="mr-2 rounded p-0.5 transition-colors hover:bg-gray-200"
            >
              {row.isExpanded ? (
                <ChevronDown className="h-4 w-4 text-text-muted" />
              ) : (
                <ChevronRight className="h-4 w-4 text-text-muted" />
              )}
            </button>
          ) : (
            <span className="mr-2 w-5" />
          )}
          <Icon className={cn('mr-2 h-4 w-4', typeColorClass.split(' ')[0])} />
          <span className="text-sm text-text-primary">{row.metricName}</span>
        </div>
      </td>

      {/* Type column */}
      <td className="px-4 py-3">
        <span
          className={cn(
            'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium',
            typeColorClass
          )}
        >
          {typeLabel}
        </span>
      </td>

      {/* Score column */}
      <td className="px-4 py-3">
        <span className="text-sm font-medium text-text-primary">{formatScore(row.avgScore)}</span>
        {row.testCaseCount > 1 && (
          <span className="ml-2 text-xs text-text-muted">
            ({formatScoreRange(row.minScore, row.maxScore)})
          </span>
        )}
      </td>

      {/* Weight columns */}
      {showWeights && (
        <>
          <td className="px-4 py-3">
            <span className="text-sm text-text-secondary">{row.weight.toFixed(2)}</span>
          </td>
          <td className="px-4 py-3">
            <span className="text-sm text-text-secondary">
              {(row.normalizedWeight * 100).toFixed(1)}%
            </span>
          </td>
        </>
      )}

      {/* Distribution column */}
      <td className="px-4 py-3">
        <ScorecardSparkline distribution={row.scoreDistribution} mean={row.avgScore} />
      </td>

      {/* Actions column */}
      {onGenerateReport && (
        <td className="px-4 py-3 text-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onGenerateReport(row.metricName);
            }}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-muted transition-colors hover:bg-primary/10 hover:text-primary"
            title={`Generate report for ${row.metricName}`}
          >
            <FileText className="h-3.5 w-3.5" />
            Report
          </button>
        </td>
      )}
    </tr>
  );
}
