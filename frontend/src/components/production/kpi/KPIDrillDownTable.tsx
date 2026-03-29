'use client';

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useKpiDrillDown } from '@/lib/hooks/useKpiData';
import { formatKpiValue } from '@/lib/kpi-format';
import { cn } from '@/lib/utils';
import { useKpiStore } from '@/stores';

import type { KpiUnit } from '@/types';

interface KPIDrillDownTableProps {
  kpiName: string;
  displayName: string;
  unit: KpiUnit;
}

const COLUMNS = [
  { key: 'dataset_id', label: 'Case ID', sortable: true },
  { key: 'created_at', label: 'Date', sortable: true },
  { key: 'numeric_value', label: 'Value', sortable: true },
  { key: 'segment', label: 'Segment', sortable: true },
  { key: 'source_component', label: 'Component', sortable: true },
  { key: 'environment', label: 'Environment', sortable: false },
] as const;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function KPIDrillDownTable({ kpiName, displayName, unit }: KPIDrillDownTableProps) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const drillDownDateFilter = useKpiStore((s) => s.drillDownDateFilter);
  const setDrillDownDateFilter = useKpiStore((s) => s.setDrillDownDateFilter);
  const drillDownValueRange = useKpiStore((s) => s.drillDownValueRange);
  const setDrillDownValueRange = useKpiStore((s) => s.setDrillDownValueRange);
  const drillDownSegment = useKpiStore((s) => s.drillDownSegment);
  const setDrillDownSegment = useKpiStore((s) => s.setDrillDownSegment);
  const setCaseProfileDatasetId = useKpiStore((s) => s.setCaseProfileDatasetId);

  // Reset page when dependencies change
  useEffect(() => {
    setPage(1);
  }, [kpiName, drillDownDateFilter, drillDownValueRange, drillDownSegment, sortBy, sortDir]);

  const { data, isLoading } = useKpiDrillDown(
    kpiName,
    { page, pageSize, sortBy, sortDir },
    drillDownDateFilter,
    drillDownValueRange,
    drillDownSegment,
    true
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  const handleSort = useCallback(
    (col: string) => {
      if (sortBy === col) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(col);
        setSortDir('desc');
      }
    },
    [sortBy]
  );

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 text-text-muted" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-primary" />
    ) : (
      <ArrowDown className="h-3 w-3 text-primary" />
    );
  };

  // Page button range (max 5 centered on current)
  const maxButtons = 5;
  let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
  const endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }
  const pages: number[] = [];
  for (let i = startPage; i <= endPage; i++) pages.push(i);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-text-primary">Cases: {displayName}</h3>
          {data && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-text-muted dark:bg-gray-800">
              {data.total.toLocaleString()}
            </span>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1.5">
          {drillDownDateFilter && (
            <div className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <span>
                Date:{' '}
                {new Date(drillDownDateFilter + 'T00:00:00').toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
              <button
                onClick={() => setDrillDownDateFilter(null)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {drillDownValueRange && (
            <div className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <span>
                Value: {formatKpiValue(drillDownValueRange.min, unit)} –{' '}
                {formatKpiValue(drillDownValueRange.max, unit)}
              </span>
              <button
                onClick={() => setDrillDownValueRange(null)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {drillDownSegment && (
            <div className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <span>Segment: {drillDownSegment}</span>
              <button
                onClick={() => setDrillDownSegment(null)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-text-muted">Loading cases...</span>
        </div>
      ) : !data || data.data.length === 0 ? (
        <div className="py-12 text-center text-sm text-text-muted">No cases found</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50 dark:bg-gray-900">
                  {COLUMNS.map((col) => (
                    <th key={col.key} className="px-4 py-2 text-xs font-semibold text-text-muted">
                      {col.sortable ? (
                        <button
                          onClick={() => handleSort(col.key)}
                          className="flex items-center gap-1 hover:text-text-primary"
                        >
                          {col.label}
                          <SortIcon col={col.key} />
                        </button>
                      ) : (
                        col.label
                      )}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-xs font-semibold text-text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row, i) => (
                  <tr
                    key={`${row.dataset_id}-${i}`}
                    className="border-b border-border last:border-0 hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    <td className="max-w-[200px] truncate px-4 py-2.5 font-mono text-xs text-text-secondary">
                      {row.dataset_id}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-text-secondary">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-text-primary">
                      {formatKpiValue(row.numeric_value, unit)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-text-secondary">
                      {row.segment ?? '--'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-text-secondary">
                      {row.source_component ?? '--'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-text-secondary">
                      {row.environment ?? '--'}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => setCaseProfileDatasetId(row.dataset_id)}
                        className="rounded p-1 text-text-muted transition-colors hover:bg-gray-100 hover:text-primary dark:hover:bg-gray-800"
                        title="View case profile"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-2">
              <span className="text-xs text-text-muted">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.total)} of{' '}
                {data.total.toLocaleString()} cases
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={cn(
                    'rounded p-1',
                    page === 1
                      ? 'text-text-muted/40 cursor-not-allowed'
                      : 'text-text-muted hover:bg-gray-100 dark:hover:bg-gray-800'
                  )}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {pages.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={cn(
                      'min-w-[28px] rounded px-1.5 py-0.5 text-xs font-medium',
                      p === page
                        ? 'bg-primary text-white'
                        : 'text-text-muted hover:bg-gray-100 dark:hover:bg-gray-800'
                    )}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className={cn(
                    'rounded p-1',
                    page === totalPages
                      ? 'text-text-muted/40 cursor-not-allowed'
                      : 'text-text-muted hover:bg-gray-100 dark:hover:bg-gray-800'
                  )}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
