'use client';

import { ChevronUp, ChevronDown, Eye } from 'lucide-react';
import { useState, useMemo } from 'react';

import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';
import { Thresholds } from '@/types';

import type { CompareTextMode } from '@/stores/ui-store';
import type { ComparisonRow } from '@/types';

interface ComparisonTableProps {
  rows: ComparisonRow[];
  metrics: string[];
}

type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  column: string | null;
  direction: SortDirection;
}

function getScoreColor(score: number): string {
  if (score >= Thresholds.GREEN_THRESHOLD) return 'text-success';
  if (score <= Thresholds.RED_THRESHOLD) return 'text-error';
  return 'text-warning';
}

function getScoreBgColor(score: number): string {
  if (score >= Thresholds.GREEN_THRESHOLD) return 'bg-success/10';
  if (score <= Thresholds.RED_THRESHOLD) return 'bg-error/10';
  return 'bg-warning/10';
}

function ScoreCell({ score }: { score: number | undefined }) {
  if (score === undefined) {
    return <span className="text-text-muted">-</span>;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-sm font-medium',
        getScoreColor(score),
        getScoreBgColor(score)
      )}
    >
      {(score * 100).toFixed(1)}%
    </span>
  );
}

function getTextModeStyles(mode: CompareTextMode): string {
  switch (mode) {
    case 'clip':
      return 'truncate max-w-[200px]';
    case 'wrap':
      return 'whitespace-pre-wrap break-words max-w-[300px]';
    case 'full':
      return 'whitespace-pre-wrap break-words';
  }
}

function TextCell({ content, mode }: { content: string; mode: CompareTextMode }) {
  const maxLength = mode === 'clip' ? 100 : mode === 'wrap' ? 300 : Infinity;
  const displayContent =
    content.length > maxLength ? content.substring(0, maxLength) + '...' : content;

  return (
    <span
      className={cn('text-sm text-text-secondary', getTextModeStyles(mode))}
      title={mode === 'clip' ? content : undefined}
    >
      {displayContent}
    </span>
  );
}

export function ComparisonTable({ rows, metrics }: ComparisonTableProps) {
  const { openTestCaseDetail, comparePageSize, compareTextMode } = useUIStore();
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = comparePageSize;

  // Handle sort
  const handleSort = (column: string) => {
    setSortState((prev) => {
      if (prev.column === column) {
        if (prev.direction === 'asc') return { column, direction: 'desc' };
        if (prev.direction === 'desc') return { column: null, direction: null };
        return { column, direction: 'asc' };
      }
      return { column, direction: 'asc' };
    });
  };

  // Sort rows
  const sortedRows = useMemo(() => {
    const { column, direction } = sortState;
    if (!column || !direction) return rows;

    return [...rows].sort((a, b) => {
      let aVal: number;
      let bVal: number;

      if (column === 'overall') {
        aVal = a.overallScore;
        bVal = b.overallScore;
      } else if (column === 'id') {
        return direction === 'asc' ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
      } else {
        aVal = a.metrics[column] ?? 0;
        bVal = b.metrics[column] ?? 0;
      }

      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [rows, sortState]);

  // Paginate
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedRows.slice(start, start + itemsPerPage);
  }, [sortedRows, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(rows.length / itemsPerPage);

  // Limit displayed metrics for readability (show up to 6 metrics)
  const displayMetrics = metrics.slice(0, 6);

  // Show text columns based on text mode
  const showTextColumns = compareTextMode !== 'clip';

  const SortIcon = ({ column }: { column: string }) => {
    if (sortState.column !== column) {
      return <ChevronUp className="text-text-muted/50 h-3 w-3" />;
    }
    return sortState.direction === 'asc' ? (
      <ChevronUp className="h-3 w-3 text-primary" />
    ) : (
      <ChevronDown className="h-3 w-3 text-primary" />
    );
  };

  if (rows.length === 0) {
    return (
      <div className="border-border/50 flex h-48 items-center justify-center rounded-xl border bg-white text-text-muted">
        No test cases match the current filters
      </div>
    );
  }

  return (
    <div className="border-border/50 overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-border/50 border-b bg-gray-50">
              <th className="p-4 text-left">
                <button
                  onClick={() => handleSort('id')}
                  className="flex items-center gap-1 text-sm font-semibold text-text-primary hover:text-primary"
                >
                  Test Case ID
                  <SortIcon column="id" />
                </button>
              </th>
              {showTextColumns && (
                <>
                  <th className="p-4 text-left">
                    <span className="text-sm font-semibold text-text-primary">Query</span>
                  </th>
                  <th className="p-4 text-left">
                    <span className="text-sm font-semibold text-text-primary">Response</span>
                  </th>
                </>
              )}
              {displayMetrics.map((metric) => (
                <th key={metric} className="p-4 text-center">
                  <button
                    onClick={() => handleSort(metric)}
                    className="mx-auto flex items-center justify-center gap-1 text-sm font-semibold text-text-primary hover:text-primary"
                  >
                    {metric.length > 12 ? `${metric.substring(0, 12)}...` : metric}
                    <SortIcon column={metric} />
                  </button>
                </th>
              ))}
              <th className="p-4 text-center">
                <button
                  onClick={() => handleSort('overall')}
                  className="mx-auto flex items-center justify-center gap-1 text-sm font-semibold text-text-primary hover:text-primary"
                >
                  Overall
                  <SortIcon column="overall" />
                </button>
              </th>
              <th className="w-16 p-4 text-center">
                <span className="text-sm font-semibold text-text-primary">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, idx) => (
              <tr
                key={`${row.id}-${row.experimentName || idx}`}
                className={cn(
                  'border-border/30 border-b transition-colors hover:bg-gray-50/50',
                  idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                )}
              >
                <td className="p-4">
                  <span
                    className="block max-w-[200px] truncate text-sm font-medium text-text-primary"
                    title={row.id}
                  >
                    {row.id.length > 25 ? `${row.id.substring(0, 25)}...` : row.id}
                  </span>
                  {row.experimentName && (
                    <span className="mt-0.5 block text-xs text-text-muted">
                      {row.experimentName}
                    </span>
                  )}
                </td>
                {showTextColumns && (
                  <>
                    <td className="p-4">
                      <TextCell content={row.query} mode={compareTextMode} />
                    </td>
                    <td className="p-4">
                      <TextCell content={row.actualOutput} mode={compareTextMode} />
                    </td>
                  </>
                )}
                {displayMetrics.map((metric) => (
                  <td key={metric} className="p-4 text-center">
                    <ScoreCell score={row.metrics[metric]} />
                  </td>
                ))}
                <td className="p-4 text-center">
                  <ScoreCell score={row.overallScore} />
                </td>
                <td className="p-4 text-center">
                  <button
                    onClick={() => openTestCaseDetail(row.id)}
                    className="rounded-lg p-2 text-text-muted transition-colors hover:bg-primary/10 hover:text-primary"
                    title="View details"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-border/50 flex items-center justify-between border-t bg-gray-50/50 px-4 py-3">
          <span className="text-sm text-text-muted">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
