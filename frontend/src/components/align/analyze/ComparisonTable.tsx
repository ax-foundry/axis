'use client';

import { Check, X, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { useState, useMemo } from 'react';

import { cn } from '@/lib/utils';

import type { AlignmentResult } from '@/types';

interface ComparisonTableProps {
  results: AlignmentResult[];
  filter: 'all' | 'aligned' | 'misaligned';
  onFilterChange: (filter: 'all' | 'aligned' | 'misaligned') => void;
}

export function ComparisonTable({ results, filter, onFilterChange }: ComparisonTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const filteredResults = useMemo(() => {
    switch (filter) {
      case 'aligned':
        return results.filter((r) => r.is_aligned);
      case 'misaligned':
        return results.filter((r) => !r.is_aligned);
      default:
        return results;
    }
  }, [results, filter]);

  const paginatedResults = useMemo(() => {
    const start = page * pageSize;
    return filteredResults.slice(start, start + pageSize);
  }, [filteredResults, page]);

  const totalPages = Math.ceil(filteredResults.length / pageSize);

  const stats = useMemo(() => {
    const aligned = results.filter((r) => r.is_aligned).length;
    const misaligned = results.filter((r) => !r.is_aligned).length;
    return { aligned, misaligned, total: results.length };
  }, [results]);

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(filteredResults, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comparison-${filter}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Filter Pills + Export */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {[
            { id: 'all' as const, label: `All (${stats.total})` },
            { id: 'aligned' as const, label: `Aligned (${stats.aligned})` },
            { id: 'misaligned' as const, label: `Misaligned (${stats.misaligned})` },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => {
                onFilterChange(pill.id);
                setPage(0);
              }}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                filter === pill.id
                  ? 'border-text-primary bg-text-primary text-white'
                  : 'border-border bg-white text-text-muted hover:border-text-muted hover:text-text-primary'
              )}
            >
              {pill.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleExportJson}
          className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-text-muted transition-colors hover:border-text-muted hover:text-text-primary"
        >
          <Download className="h-3 w-3" />
          Export JSON
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/80">
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                ID
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                Query
              </th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-text-muted">
                Human
              </th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-text-muted">
                LLM
              </th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-text-muted">
                Status
              </th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-text-muted"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-white">
            {paginatedResults.map((result) => {
              const isExpanded = expandedRow === result.record_id;

              return (
                <>
                  <tr
                    key={result.record_id}
                    className={cn(
                      'transition-colors hover:bg-gray-50',
                      !result.is_aligned && 'bg-error/5',
                      isExpanded && 'bg-gray-50'
                    )}
                  >
                    <td className="px-3 py-2.5 font-mono text-xs text-text-muted">
                      {result.record_id.slice(0, 8)}...
                    </td>
                    <td className="max-w-xs truncate px-3 py-2.5 text-xs text-text-secondary">
                      {result.query}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {result.human_score === 1 ? (
                        <span className="bg-success/10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-success">
                          <Check className="h-3 w-3" />
                          Accept
                        </span>
                      ) : (
                        <span className="bg-error/10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-error">
                          <X className="h-3 w-3" />
                          Reject
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {result.llm_score === 1 ? (
                        <span className="bg-success/10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-success">
                          <Check className="h-3 w-3" />
                          Accept
                        </span>
                      ) : (
                        <span className="bg-error/10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-error">
                          <X className="h-3 w-3" />
                          Reject
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {result.is_aligned ? (
                        <span className="bg-success/10 rounded-full px-2 py-0.5 text-xs font-medium text-success">
                          Aligned
                        </span>
                      ) : (
                        <span className="bg-error/10 rounded-full px-2 py-0.5 text-xs font-medium text-error">
                          Misaligned
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => setExpandedRow(isExpanded ? null : result.record_id)}
                        className="rounded p-1 text-text-muted hover:bg-gray-100 hover:text-text-primary"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${result.record_id}-expanded`}>
                      <td colSpan={6} className="border-t bg-gray-50 px-4 py-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <div className="mb-1 text-xs font-medium text-text-muted">Response</div>
                            <p className="rounded bg-white p-3 text-sm text-text-secondary">
                              {result.actual_output}
                            </p>
                          </div>
                          <div>
                            <div className="mb-1 text-xs font-medium text-text-muted">
                              LLM Reasoning
                            </div>
                            <p className="rounded bg-white p-3 text-sm italic text-text-muted">
                              {result.llm_reasoning}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-text-muted">
            Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filteredResults.length)}{' '}
            of {filteredResults.length}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
