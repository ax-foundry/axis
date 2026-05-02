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
  evaluationHierarchies?: Map<string, Map<string, ScorecardMetric>> | null;
  evaluationNames?: string[];
  showWeights?: boolean;
  onMetricClick?: (metricName: string) => void;
  onGenerateReport?: (metricName?: string) => void;
}

type SortField = 'name' | 'score' | 'weight';
type SortDirection = 'asc' | 'desc';

const GREEN_THRESHOLD = 0.7;
const RED_THRESHOLD = 0.3;

function scoreColorClass(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'text-text-primary';
  if (score >= GREEN_THRESHOLD) return 'text-success';
  if (score < RED_THRESHOLD) return 'text-error';
  return 'text-warning';
}

export function ScorecardTable({
  hierarchy,
  evaluationHierarchies,
  evaluationNames,
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

  const isComparisonMode =
    !!evaluationHierarchies && !!evaluationNames && evaluationNames.length >= 2;
  const showDelta = isComparisonMode && evaluationNames!.length === 2;

  const expandedSet = useMemo(() => new Set(scorecardExpandedNodes), [scorecardExpandedNodes]);

  const rows = useMemo(() => {
    return generateDisplayRows(hierarchy, expandedSet);
  }, [hierarchy, expandedSet]);

  const visibleRows = useMemo(() => {
    let filtered = rows.filter((row) => row.isVisible);

    if (sortField !== 'name') {
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

      const sortedFiltered: ScorecardDisplayRow[] = [];
      const addWithChildren = (row: ScorecardDisplayRow) => {
        sortedFiltered.push(row);
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
    <div className="border-border/50 overflow-hidden rounded-xl border bg-surface shadow-sm">
      <div className="border-border/50 flex items-center justify-between border-b bg-gray-50 px-4 py-2 dark:bg-gray-900/50">
        <span className="text-sm text-text-muted">
          {metricColumns.length} metrics • {componentColumns.length} components
          {isComparisonMode && (
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Comparing {evaluationNames!.length} evaluations
            </span>
          )}
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

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-border/50 border-b bg-gray-50 dark:bg-gray-900/30">
              {/* Hierarchy */}
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort('name')}
                  className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary"
                >
                  Hierarchy {getSortIcon('name')}
                </button>
              </th>

              {/* Type */}
              <th className="px-4 py-3 text-left">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Type
                </span>
              </th>

              {/* Score columns */}
              {isComparisonMode ? (
                <>
                  {evaluationNames!.map((name) => (
                    <th key={name} className="px-4 py-3 text-left">
                      <span
                        className="block max-w-[120px] truncate text-xs font-semibold uppercase tracking-wider text-text-muted"
                        title={name}
                      >
                        {name}
                      </span>
                    </th>
                  ))}
                  {showDelta && (
                    <th className="px-4 py-3 text-left">
                      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Δ
                      </span>
                    </th>
                  )}
                </>
              ) : (
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSort('score')}
                    className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary"
                  >
                    Score {getSortIcon('score')}
                  </button>
                </th>
              )}

              {/* Weight columns */}
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

              {/* Distribution — only in single mode */}
              {!isComparisonMode && (
                <th className="px-4 py-3 text-left">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Distribution
                  </span>
                </th>
              )}

              {/* Actions */}
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
                isComparisonMode={isComparisonMode}
                evaluationHierarchies={evaluationHierarchies}
                evaluationNames={evaluationNames}
                showDelta={showDelta}
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
  isComparisonMode: boolean;
  evaluationHierarchies?: Map<string, Map<string, ScorecardMetric>> | null;
  evaluationNames?: string[];
  showDelta: boolean;
  onToggle: () => void;
  onClick: () => void;
  onGenerateReport?: (metricName?: string) => void;
}

function ScorecardTableRow({
  row,
  showWeights,
  isComparisonMode,
  evaluationHierarchies,
  evaluationNames,
  showDelta,
  onToggle,
  onClick,
  onGenerateReport,
}: ScorecardTableRowProps) {
  const Icon = getTypeIcon(row.type);
  const typeLabel = getTypeLabel(row.type);
  const typeColorClass = getTypeColorClass(row.type);

  const indent = (row.level - 1) * 24;

  // Per-evaluation scores for this metric
  const evalScores = useMemo(() => {
    if (!isComparisonMode || !evaluationHierarchies || !evaluationNames) return [];
    return evaluationNames.map((name) => {
      const metric = evaluationHierarchies.get(name)?.get(row.metricName);
      return { name, score: metric?.avgScore ?? null };
    });
  }, [isComparisonMode, evaluationHierarchies, evaluationNames, row.metricName]);

  const delta =
    showDelta && evalScores.length === 2
      ? evalScores[1].score !== null && evalScores[0].score !== null
        ? evalScores[1].score - evalScores[0].score
        : null
      : null;

  return (
    <tr
      className={cn(
        'animate-fade-in-up cursor-pointer transition-colors hover:bg-gray-50 dark:bg-gray-900/50 dark:hover:bg-gray-800',
        row.hasChildren && 'font-medium'
      )}
      onClick={(e) => {
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

      {/* Score columns */}
      {isComparisonMode ? (
        <>
          {evalScores.map(({ name, score }) => (
            <td key={name} className="px-4 py-3">
              <span className={cn('text-sm font-semibold', scoreColorClass(score))}>
                {score !== null ? formatScore(score) : '—'}
              </span>
              {score !== null && row.testCaseCount > 1 && (
                <span className="ml-1 text-xs text-text-muted">
                  (
                  {formatScoreRange(
                    evaluationHierarchies?.get(name)?.get(row.metricName)?.minScore ?? score,
                    evaluationHierarchies?.get(name)?.get(row.metricName)?.maxScore ?? score
                  )}
                  )
                </span>
              )}
            </td>
          ))}
          {showDelta && (
            <td className="px-4 py-3">
              {delta !== null ? (
                <span
                  className={cn(
                    'text-sm font-semibold',
                    delta > 0 ? 'text-success' : delta < 0 ? 'text-error' : 'text-text-muted'
                  )}
                >
                  {delta > 0 ? '+' : ''}
                  {formatScore(delta)}
                </span>
              ) : (
                <span className="text-sm text-text-muted">—</span>
              )}
            </td>
          )}
        </>
      ) : (
        <td className="px-4 py-3">
          <span className="text-sm font-medium text-text-primary">{formatScore(row.avgScore)}</span>
          {row.testCaseCount > 1 && (
            <span className="ml-2 text-xs text-text-muted">
              ({formatScoreRange(row.minScore, row.maxScore)})
            </span>
          )}
        </td>
      )}

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

      {/* Distribution — only in single mode */}
      {!isComparisonMode && (
        <td className="px-4 py-3">
          <ScorecardSparkline distribution={row.scoreDistribution} mean={row.avgScore} />
        </td>
      )}

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
