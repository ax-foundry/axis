'use client';

import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Columns3,
  Check,
  RotateCcw,
} from 'lucide-react';
import { useMemo, useCallback, useState, useRef, useEffect } from 'react';

import { useHumanSignalsStore } from '@/stores/human-signals-store';

import type { SignalsCaseRecord, SignalsTableColumn, SignalsDisplayConfig } from '@/types';

// Default columns shown when user hasn't customized yet (max 7 for readability)
const DEFAULT_MAX_COLUMNS = 7;

// Only highlight columns for the most important signals
const HIGHLIGHTED_SIGNALS = new Set(['failed_step', 'intervention_type', 'sentiment']);

interface DynamicCaseTableProps {
  cases: SignalsCaseRecord[];
  columns: SignalsTableColumn[];
  displayConfig: SignalsDisplayConfig;
  onViewCase?: (caseId: string) => void;
}

function getDefaultVisibleKeys(columns: SignalsTableColumn[]): string[] {
  // Always show Case_ID + last column (Timestamp) + limit middle columns
  if (columns.length <= DEFAULT_MAX_COLUMNS) return columns.map((c) => c.key);
  const keys: string[] = [];
  for (let i = 0; i < Math.min(DEFAULT_MAX_COLUMNS - 1, columns.length - 1); i++) {
    keys.push(columns[i].key);
  }
  // Always include Timestamp if present
  const last = columns[columns.length - 1];
  if (last && !keys.includes(last.key)) keys.push(last.key);
  return keys;
}

function CellBadge({ value, color }: { value: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {value.replace(/_/g, ' ')}
    </span>
  );
}

function ColumnPicker({
  allColumns,
  visibleKeys,
  onToggle,
  onReset,
}: {
  allColumns: SignalsTableColumn[];
  visibleKeys: string[];
  onToggle: (key: string) => void;
  onReset: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-gray-50 hover:text-text-primary"
      >
        <Columns3 className="h-3.5 w-3.5" />
        Columns
        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-text-muted">
          {visibleKeys.length}/{allColumns.length}
        </span>
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-medium text-text-primary">Show Columns</span>
            <button
              onClick={onReset}
              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              Reset
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {allColumns.map((col) => {
              const isVisible = visibleKeys.includes(col.key);
              return (
                <button
                  key={col.key}
                  onClick={() => onToggle(col.key)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-gray-50"
                >
                  <div
                    className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border ${
                      isVisible ? 'border-primary bg-primary text-white' : 'border-gray-300'
                    }`}
                  >
                    {isVisible && <Check className="h-2.5 w-2.5" />}
                  </div>
                  <span className="text-text-primary">{col.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function DynamicCaseTable({
  cases,
  columns,
  displayConfig,
  onViewCase,
}: DynamicCaseTableProps) {
  const {
    currentPage,
    pageSize,
    sortColumn,
    sortDirection,
    visibleColumns,
    setSort,
    setPage,
    setPageSize,
    setVisibleColumns,
    toggleColumn,
  } = useHumanSignalsStore();

  const colorMaps = displayConfig.color_maps;

  // Resolve visible columns: user selection or sensible defaults
  const activeKeys = useMemo(() => {
    if (visibleColumns && visibleColumns.length > 0) return visibleColumns;
    return getDefaultVisibleKeys(columns);
  }, [visibleColumns, columns]);

  const visibleCols = useMemo(
    () => columns.filter((c) => activeKeys.includes(c.key)),
    [columns, activeKeys]
  );

  // Sort
  const sortedCases = useMemo(() => {
    if (!sortColumn || !sortDirection) return cases;
    return [...cases].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDirection === 'desc' ? -cmp : cmp;
    });
  }, [cases, sortColumn, sortDirection]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sortedCases.length / pageSize));
  const paginatedCases = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedCases.slice(start, start + pageSize);
  }, [sortedCases, currentPage, pageSize]);

  const handleSort = useCallback(
    (col: string) => {
      if (sortColumn === col) {
        if (sortDirection === 'asc') setSort(col, 'desc');
        else if (sortDirection === 'desc') setSort(null, null);
        else setSort(col, 'asc');
      } else {
        setSort(col, 'asc');
      }
    },
    [sortColumn, sortDirection, setSort]
  );

  const handleResetColumns = useCallback(() => {
    setVisibleColumns(getDefaultVisibleKeys(columns));
  }, [columns, setVisibleColumns]);

  const handleToggleColumn = useCallback(
    (key: string) => {
      // If visibleColumns is null (defaults), initialize from current defaults first
      if (!visibleColumns || visibleColumns.length === 0) {
        const defaults = getDefaultVisibleKeys(columns);
        if (defaults.includes(key)) {
          setVisibleColumns(defaults.filter((k) => k !== key));
        } else {
          setVisibleColumns([...defaults, key]);
        }
      } else {
        toggleColumn(key);
      }
    },
    [visibleColumns, columns, setVisibleColumns, toggleColumn]
  );

  // Look up badge color for a cell value
  const getCellColor = useCallback(
    (columnKey: string, value: unknown): string | null => {
      if (value == null || typeof value !== 'string') return null;
      // Only apply color badges to important signals
      const signal = columnKey.split('__')[1];
      if (!signal || !HIGHLIGHTED_SIGNALS.has(signal)) return null;
      const map = colorMaps[columnKey];
      if (!map) return null;
      return map[value] || null;
    },
    [colorMaps]
  );

  const renderCell = useCallback(
    (col: SignalsTableColumn, value: unknown) => {
      if (value == null) return <span className="text-text-muted">&mdash;</span>;
      if (typeof value === 'boolean')
        return (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
              value ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-text-muted'
            }`}
          >
            {value ? 'Yes' : 'No'}
          </span>
        );
      if (Array.isArray(value)) {
        if (value.length === 0) return <span className="text-text-muted">&mdash;</span>;
        // Array of objects: show count
        if (typeof value[0] === 'object' && value[0] !== null) {
          return (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-text-muted">
              {value.length} items
            </span>
          );
        }
        return <span className="text-text-primary">{value.join(', ')}</span>;
      }

      // Object/dict values: show key count badge
      if (typeof value === 'object' && value !== null) {
        const keys = Object.keys(value);
        return (
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {keys.length} fields
          </span>
        );
      }

      const strVal = String(value);

      // Check for color badge (only important fields have color maps)
      const color = getCellColor(col.key, strVal);
      if (color) return <CellBadge value={strVal} color={color} />;

      // Timestamp formatting
      if (col.key === 'Timestamp' || col.key === 'timestamp') {
        const d = new Date(strVal);
        if (!isNaN(d.getTime())) {
          return <span className="text-text-secondary">{d.toLocaleDateString()}</span>;
        }
      }

      // Numeric fields
      if (col.key === 'Message_Count') {
        return <span className="font-medium text-text-primary">{strVal}</span>;
      }

      // String that looks like a Python dict: show as structured preview
      if (strVal.trim().startsWith('{') && strVal.length > 50) {
        return (
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            Structured data
          </span>
        );
      }

      return <span className="text-text-primary">{strVal}</span>;
    },
    [getCellColor]
  );

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [currentPage, totalPages]);

  if (cases.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-border bg-white text-sm text-text-muted">
        No cases match the current filters
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      {/* Header bar with column picker */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-sm font-medium text-text-primary">Cases ({cases.length} total)</span>
        <ColumnPicker
          allColumns={columns}
          visibleKeys={activeKeys}
          onToggle={handleToggleColumn}
          onReset={handleResetColumns}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-gray-50/50">
              {visibleCols.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 text-left font-medium text-text-muted ${
                    col.sortable ? 'cursor-pointer select-none hover:text-text-primary' : ''
                  }`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortColumn === col.key && (
                      <>
                        {sortDirection === 'asc' && <ChevronUp className="h-3 w-3" />}
                        {sortDirection === 'desc' && <ChevronDown className="h-3 w-3" />}
                      </>
                    )}
                  </div>
                </th>
              ))}
              {onViewCase && (
                <th className="px-3 py-2.5 text-left font-medium text-text-muted">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {paginatedCases.map((c, i) => (
              <tr
                key={c.Case_ID || i}
                className="border-border/50 border-b transition-colors hover:bg-gray-50/50"
              >
                {visibleCols.map((col) => (
                  <td key={col.key} className="max-w-[200px] truncate whitespace-nowrap px-3 py-2">
                    {renderCell(col, c[col.key])}
                  </td>
                ))}
                {onViewCase && (
                  <td className="px-3 py-2">
                    <button
                      onClick={() => onViewCase(c.Case_ID || '')}
                      className="rounded p-1 text-text-muted hover:bg-gray-100 hover:text-text-primary"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted">
            {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, sortedCases.length)} of {sortedCases.length}
          </span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded border border-border px-2 py-1 text-xs"
          >
            {[10, 25, 50, 100].map((s) => (
              <option key={s} value={s}>
                {s} / page
              </option>
            ))}
          </select>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="rounded p-1 text-text-muted hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {pageNumbers.map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`h-7 w-7 rounded text-xs ${
                  p === currentPage ? 'bg-primary text-white' : 'text-text-muted hover:bg-gray-100'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="rounded p-1 text-text-muted hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
