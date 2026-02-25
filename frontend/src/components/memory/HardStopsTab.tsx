'use client';

import { ChevronLeft, ChevronRight, OctagonX } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useFilteredMemoryData } from '@/lib/hooks/useFilteredMemoryData';
import { getField, getListField, useMemoryConfig } from '@/lib/hooks/useMemoryConfig';
import { cn } from '@/lib/utils';

const HARD_STOPS_PER_PAGE = 10;

export function HardStopsTab() {
  const data = useFilteredMemoryData();
  const { data: config } = useMemoryConfig();
  const [currentPage, setCurrentPage] = useState(1);

  const actionValue = config?.hard_stops.action_value ?? 'decline';
  const requireEmpty = config?.hard_stops.require_empty_mitigants ?? true;

  const hardStops = useMemo(() => {
    return data.filter((r) => {
      if (getField(r, 'action') !== actionValue) return false;
      if (requireEmpty && getListField(r, 'mitigants').length > 0) return false;
      return true;
    });
  }, [data, actionValue, requireEmpty]);

  const totalPages = Math.ceil(hardStops.length / HARD_STOPS_PER_PAGE);
  const paginatedStops = hardStops.slice(
    (currentPage - 1) * HARD_STOPS_PER_PAGE,
    currentPage * HARD_STOPS_PER_PAGE
  );

  if (hardStops.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-text-muted">
        No unmitigated decline rules found.
      </div>
    );
  }

  // Pagination page numbers
  const maxButtons = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  const endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }
  const pages: number[] = [];
  for (let i = startPage; i <= endPage; i++) pages.push(i);

  const start = (currentPage - 1) * HARD_STOPS_PER_PAGE + 1;
  const end = Math.min(currentPage * HARD_STOPS_PER_PAGE, hardStops.length);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">{hardStops.length}</span> hard stop rule
          {hardStops.length !== 1 ? 's' : ''} &mdash; unmitigated declines with no available
          mitigants
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {paginatedStops.map((rule) => (
          <div
            key={rule.id}
            className="rounded-lg border border-l-4 border-border border-l-red-400 bg-white p-4 transition-colors hover:bg-gray-50/50"
          >
            <div className="flex items-start gap-3">
              <OctagonX className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-text-primary">
                  {getField(rule, 'name')}
                </div>
                <div className="mt-0.5 text-xs text-text-muted">
                  {getField(rule, 'group_by')} / {getField(rule, 'category')} /{' '}
                  {getField(rule, 'product')}
                </div>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-text-secondary">
                  {getField(rule, 'description')}
                </p>

                {/* Metadata */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {getField(rule, 'threshold_type') && (
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-text-muted">
                      Threshold: {getField(rule, 'threshold_type')}
                      {getField(rule, 'threshold_value') &&
                        ` (${getField(rule, 'threshold_value')})`}
                    </span>
                  )}
                  {getField(rule, 'compound_trigger') && (
                    <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs text-red-600">
                      Compound: {getField(rule, 'compound_trigger')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-1 pt-3">
          <span className="text-xs text-text-muted">
            Showing {start}&ndash;{end} of {hardStops.length} hard stops
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {pages.map((p) => (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                className={cn(
                  'flex h-7 min-w-[28px] items-center justify-center rounded px-1.5 text-xs font-medium transition-colors',
                  p === currentPage
                    ? 'bg-primary text-white'
                    : 'text-text-muted hover:bg-gray-100 hover:text-text-primary'
                )}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
