'use client';

import { AlertCircle, ArrowLeft, ChevronDown, Download, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import * as api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useDataStore } from '@/stores/data-store';
import { useDatabaseStore } from '@/stores/database-store';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { useUIStore } from '@/stores/ui-store';

import type { DataFormat, EvaluationRecord, MonitoringRecord, UploadResponse } from '@/types';

function truncateValue(value: unknown, maxLen: number = 100): string {
  if (value === null || value === undefined) return '-';
  const str = String(value);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

// Column name normalization mapping for monitoring data
const MONITORING_COLUMN_NORMALIZATION: Record<string, string> = {
  dataset_created_at: 'timestamp',
  time: 'timestamp',
  created_at: 'timestamp',
  id: 'dataset_id',
  record_id: 'dataset_id',
  model: 'model_name',
  agent: 'model_name',
  agent_name: 'model_name',
  latency_ms: 'latency',
  response_time: 'latency',
  input: 'query',
  prompt: 'query',
  user_input: 'query',
  output: 'actual_output',
  response: 'actual_output',
  model_output: 'actual_output',
  completion: 'actual_output',
  env: 'environment',
  stage: 'environment',
  error: 'has_errors',
  evaluationname: 'evaluation_name',
  eval_name: 'evaluation_name',
  experiment: 'evaluation_name',
  experiment_name: 'evaluation_name',
};

function normalizeMonitoringData(
  data: Record<string, unknown>[],
  columns: string[]
): { normalizedData: MonitoringRecord[]; normalizedColumns: string[] } {
  const columnMapping: Record<string, string> = {};
  columns.forEach((col) => {
    const normalized = col.toLowerCase().trim().replace(/\s+/g, '_').replace(/-/g, '_');
    const target = MONITORING_COLUMN_NORMALIZATION[normalized];
    columnMapping[col] = target || col;
  });

  const normalizedColumns = Array.from(new Set(Object.values(columnMapping)));

  const normalizedData = data.map((record) => {
    const normalizedRecord: Record<string, unknown> = {};
    Object.entries(record).forEach(([key, value]) => {
      const normalizedKey = columnMapping[key] || key;
      normalizedRecord[normalizedKey] = value;
    });
    return normalizedRecord as MonitoringRecord;
  });

  return { normalizedData, normalizedColumns };
}

export function ImportPreview() {
  const {
    handle,
    selectedTable,
    dataSelectMode,
    sqlQuery,
    activeFilters,
    previewData,
    setPreviewData,
    dedupeOnId,
    setDedupeOnId,
    rowLimit,
    setRowLimit,
    goBack,
    reset,
    isLoading,
    setLoading,
    error,
    setError,
    setStep,
  } = useDatabaseStore();

  const { setData: setEvaluationData } = useDataStore();
  const { setData: setMonitoringData } = useMonitoringStore();
  const { setDatabaseModalOpen, databaseTargetStore } = useUIStore();
  const [isImporting, setIsImporting] = useState(false);

  // Build filter conditions from active filters
  const filterConditions = useMemo(() => {
    return activeFilters
      .filter((f) => f.value !== null)
      .map((f) => ({ column: f.column, value: f.value! }));
  }, [activeFilters]);

  // Load preview data on mount
  useEffect(() => {
    async function loadPreview() {
      if (!handle) return;

      setLoading(true);
      setError(null);

      try {
        let response: api.PreviewResponse;

        if (dataSelectMode === 'query') {
          response = await api.databaseQueryPreview(handle, sqlQuery, 10);
        } else {
          if (!selectedTable) return;
          response = await api.databasePreview(
            handle,
            selectedTable,
            null,
            filterConditions.length > 0 ? filterConditions : undefined,
            10
          );
        }

        if (response.success) {
          setPreviewData(response.data);
        } else {
          setError('Failed to load preview');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load preview');
      }

      setLoading(false);
    }

    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, selectedTable, dataSelectMode, sqlQuery, filterConditions]);

  // Handle import
  const handleImport = async () => {
    if (!handle) return;

    setIsImporting(true);
    setStep('importing');
    setError(null);

    try {
      let response: UploadResponse;

      if (dataSelectMode === 'query') {
        response = await api.databaseQueryImport({
          handle,
          query: sqlQuery,
          limit: rowLimit,
          dedupe_on_id: dedupeOnId,
        });
      } else {
        if (!selectedTable) return;
        response = await api.databaseImport({
          handle,
          table: selectedTable,
          filters: filterConditions.length > 0 ? filterConditions : undefined,
          limit: rowLimit,
          dedupe_on_id: dedupeOnId,
        });
      }

      if (response.success && response.data) {
        if (databaseTargetStore === 'monitoring') {
          const { normalizedData, normalizedColumns } = normalizeMonitoringData(
            response.data as Record<string, unknown>[],
            response.columns
          );

          const isLongFormat =
            normalizedColumns.includes('metric_name') && normalizedColumns.includes('metric_score');
          const metricColumns = isLongFormat
            ? ['metric_score']
            : normalizedColumns.filter(
                (col) =>
                  col.endsWith('_score') ||
                  (normalizedData.length > 0 &&
                    typeof normalizedData[0][col] === 'number' &&
                    !['latency', 'dataset_id', 'id', 'timestamp'].includes(col))
              );

          setMonitoringData(
            normalizedData,
            'monitoring',
            normalizedColumns,
            metricColumns,
            'database_import'
          );
        } else {
          setEvaluationData(
            (response.data || []) as EvaluationRecord[],
            response.format as DataFormat,
            response.columns,
            undefined
          );
        }

        setDatabaseModalOpen(false);
        reset();
      } else {
        setError(response.message || 'Import failed');
        setStep('preview');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setStep('preview');
    }

    setIsImporting(false);
  };

  // Display columns from preview data
  const displayColumns = useMemo(() => {
    if (previewData.length === 0) return [];
    return Object.keys(previewData[0]);
  }, [previewData]);

  // Source label for header
  const sourceLabel =
    dataSelectMode === 'query'
      ? 'SQL Query'
      : selectedTable
        ? `${selectedTable.schema_name}.${selectedTable.name}`
        : '';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={goBack}
          disabled={isLoading || isImporting}
          className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h3 className="font-medium text-text-primary">Preview & Import</h3>
          <p className="text-sm text-text-muted">{sourceLabel}</p>
        </div>
      </div>

      {/* Options */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Row Limit */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-primary">Max Rows</label>
          <div className="relative">
            <select
              value={rowLimit}
              onChange={(e) => setRowLimit(parseInt(e.target.value, 10))}
              className="w-full appearance-none rounded-lg border border-border bg-white px-3 py-2 pr-8 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              disabled={isLoading || isImporting}
            >
              <option value={100}>100 rows</option>
              <option value={500}>500 rows</option>
              <option value={1000}>1,000 rows</option>
              <option value={5000}>5,000 rows</option>
              <option value={10000}>10,000 rows (max)</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          </div>
        </div>

        {/* Dedupe Option */}
        <div className="flex items-end">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-white px-3 py-2">
            <input
              type="checkbox"
              checked={dedupeOnId}
              onChange={(e) => setDedupeOnId(e.target.checked)}
              disabled={isLoading || isImporting}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
            />
            <span className="text-sm text-text-primary">Dedupe by ID</span>
          </label>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="border-error/20 bg-error/5 mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm text-error">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Preview Table */}
      <div className="flex-1 overflow-hidden rounded-lg border border-border">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <p className="mt-2 text-sm text-text-muted">Loading preview...</p>
            </div>
          </div>
        ) : previewData.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-text-muted">No data to preview</p>
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <table className="w-full min-w-max text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  {displayColumns.map((col) => (
                    <th
                      key={col}
                      className="border-b border-border px-3 py-2 text-left font-medium text-text-primary"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-gray-50">
                    {displayColumns.map((col) => (
                      <td
                        key={col}
                        className="border-b border-border px-3 py-2 text-text-secondary"
                      >
                        <div className="max-w-xs truncate" title={String(row[col] ?? '')}>
                          {truncateValue(row[col])}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Preview Info */}
      <div className="mt-3 text-center text-xs text-text-muted">
        Showing first {previewData.length} rows. Import will fetch up to {rowLimit.toLocaleString()}{' '}
        rows.
      </div>

      {/* Import Button */}
      <div className="mt-4 border-t border-border pt-4">
        <button
          onClick={handleImport}
          disabled={isLoading || isImporting || previewData.length === 0}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-medium text-white transition-all',
            'bg-gradient-to-r from-violet-500 to-violet-600 shadow-lg shadow-violet-500/25',
            'hover:shadow-xl hover:shadow-violet-500/30',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          {isImporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Import Data
            </>
          )}
        </button>
      </div>
    </div>
  );
}
