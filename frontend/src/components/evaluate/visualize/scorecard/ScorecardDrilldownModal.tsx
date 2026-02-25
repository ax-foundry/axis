'use client';

import { X, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useMemo } from 'react';

import { getTestCasesForMetric, formatScore } from '@/lib/scorecard-utils';
import { cn } from '@/lib/utils';

import type { DataFormat } from '@/types';

interface ScorecardDrilldownModalProps {
  isOpen: boolean;
  onClose: () => void;
  metricName: string;
  data: Record<string, unknown>[];
  format: DataFormat;
  onViewTestCase?: (testCaseId: string) => void;
}

const PAGE_SIZE = 10;

export function ScorecardDrilldownModal({
  isOpen,
  onClose,
  metricName,
  data,
  format,
  onViewTestCase,
}: ScorecardDrilldownModalProps) {
  const [currentPage, setCurrentPage] = useState(0);

  const testCases = useMemo(() => {
    return getTestCasesForMetric(data, metricName, format);
  }, [data, metricName, format]);

  const totalPages = Math.ceil(testCases.length / PAGE_SIZE);
  const paginatedTestCases = testCases.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="animate-fade-in-up relative max-h-[80vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="border-border/50 flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{metricName}</h2>
            <p className="text-sm text-text-muted">
              {testCases.length} test case{testCases.length !== 1 ? 's' : ''} with this metric
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 transition-colors hover:bg-gray-100">
            <X className="h-5 w-5 text-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[calc(80vh-140px)] overflow-y-auto">
          {testCases.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-text-muted">
              No test cases found for this metric
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="border-border/50 border-b">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Query
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Explanation
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border/30 divide-y">
                {paginatedTestCases.map((tc) => (
                  <tr key={tc.id} className="transition-colors hover:bg-gray-50/50">
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm text-text-secondary">
                        {tc.id.slice(0, 8)}...
                      </span>
                    </td>
                    <td className="max-w-md px-6 py-4">
                      <p className="truncate text-sm text-text-primary" title={tc.query}>
                        {tc.query || '-'}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-text-primary">
                        {formatScore(tc.score)}
                      </span>
                    </td>
                    <td className="max-w-xs px-6 py-4">
                      <p className="truncate text-sm text-text-muted" title={tc.explanation}>
                        {tc.explanation || '-'}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {onViewTestCase && (
                        <button
                          onClick={() => onViewTestCase(tc.id)}
                          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5 hover:text-primary-dark"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer with pagination */}
        {totalPages > 1 && (
          <div className="border-border/50 flex items-center justify-between border-t bg-gray-50/50 px-6 py-3">
            <span className="text-sm text-text-muted">
              Showing {currentPage * PAGE_SIZE + 1}-
              {Math.min((currentPage + 1) * PAGE_SIZE, testCases.length)} of {testCases.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className={cn(
                  'rounded-lg p-2 transition-colors',
                  currentPage === 0
                    ? 'text-text-muted/50 cursor-not-allowed'
                    : 'text-text-muted hover:bg-gray-100'
                )}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-text-secondary">
                Page {currentPage + 1} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className={cn(
                  'rounded-lg p-2 transition-colors',
                  currentPage >= totalPages - 1
                    ? 'text-text-muted/50 cursor-not-allowed'
                    : 'text-text-muted hover:bg-gray-100'
                )}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
