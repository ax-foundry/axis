'use client';

import { ChevronLeft, ChevronRight, Columns3 } from 'lucide-react';
import { useState } from 'react';

import { cn, truncateText } from '@/lib/utils';
import { useDataStore } from '@/stores';

export function DataPreview() {
  const { data, columns } = useDataStore();
  const [page, setPage] = useState(0);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(columns.slice(0, 6));
  const [showColumnSelector, setShowColumnSelector] = useState(false);

  const pageSize = 10;
  const totalPages = Math.ceil(data.length / pageSize);
  const pageData = data.slice(page * pageSize, (page + 1) * pageSize);

  const toggleColumn = (column: string) => {
    if (visibleColumns.includes(column)) {
      setVisibleColumns(visibleColumns.filter((c) => c !== column));
    } else {
      setVisibleColumns([...visibleColumns, column]);
    }
  };

  if (data.length === 0) {
    return <div className="py-8 text-center text-text-muted">No data to preview</div>;
  }

  return (
    <div className="space-y-4">
      {/* Column Selector */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">
          Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, data.length)} of{' '}
          {data.length} records
        </p>
        <div className="relative">
          <button
            onClick={() => setShowColumnSelector(!showColumnSelector)}
            className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200"
          >
            <Columns3 className="h-4 w-4" />
            Columns ({visibleColumns.length})
          </button>
          {showColumnSelector && (
            <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded-lg border border-border bg-white p-3 shadow-lg">
              <p className="mb-2 text-sm font-medium text-text-primary">Show Columns</p>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {columns.map((column) => (
                  <label key={column} className="flex cursor-pointer items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(column)}
                      onChange={() => toggleColumn(column)}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="truncate text-sm text-text-secondary">{column}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-gray-50">
            <tr>
              {visibleColumns.map((column) => (
                <th key={column} className="px-4 py-3 text-left font-medium text-text-primary">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pageData.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-gray-50">
                {visibleColumns.map((column) => {
                  const value = row[column];
                  const displayValue =
                    typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');

                  return (
                    <td
                      key={column}
                      className="max-w-xs px-4 py-3 text-text-secondary"
                      title={displayValue}
                    >
                      <span className="block truncate">{truncateText(displayValue, 50)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="rounded-lg p-2 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i;
              } else if (page < 3) {
                pageNum = i;
              } else if (page > totalPages - 4) {
                pageNum = totalPages - 5 + i;
              } else {
                pageNum = page - 2 + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={cn(
                    'h-8 w-8 rounded-lg text-sm font-medium',
                    page === pageNum
                      ? 'bg-primary text-white'
                      : 'text-text-secondary hover:bg-gray-100'
                  )}
                >
                  {pageNum + 1}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page === totalPages - 1}
            className="rounded-lg p-2 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
