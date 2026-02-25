'use client';

import { X, Settings, Check, AlertCircle, Eye, Bot } from 'lucide-react';
import { useMemo } from 'react';

import { useCalibrationStore } from '@/stores/calibration-store';
import { Columns } from '@/types';

interface CaliberConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CaliberConfigModal({ isOpen, onClose }: CaliberConfigModalProps) {
  const {
    data,
    columns,
    idColumn,
    displayColumns,
    llmColumns,
    setIdColumn,
    setDisplayColumns,
    setLlmColumns,
  } = useCalibrationStore();

  // Auto-detect ID-like columns
  const idLikeColumns = useMemo(() => {
    return columns.filter(
      (col) =>
        col.toLowerCase().includes('id') ||
        col.toLowerCase().includes('uuid') ||
        col.toLowerCase() === '_id'
    );
  }, [columns]);

  // Check for duplicate IDs in selected column
  const duplicateIdWarning = useMemo(() => {
    if (!idColumn || data.length === 0) return null;
    const ids = data.map((record) => record[idColumn] as string);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size < ids.length) {
      return `Warning: ${ids.length - uniqueIds.size} duplicate IDs found`;
    }
    return null;
  }, [idColumn, data]);

  // Default display columns for CaliberHQ
  const defaultDisplayColumns: string[] = [Columns.QUERY, Columns.ACTUAL_OUTPUT];

  // Default LLM columns (what gets passed to the judge)
  const defaultLlmColumns: string[] = [
    Columns.QUERY,
    Columns.ACTUAL_OUTPUT,
    Columns.EXPECTED_OUTPUT,
  ];

  // Get effective display columns
  const effectiveDisplayColumns =
    displayColumns.length === 0 ? defaultDisplayColumns : displayColumns;

  // Get effective LLM columns
  const effectiveLlmColumns = llmColumns.length === 0 ? defaultLlmColumns : llmColumns;

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Settings className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-text-primary">Configure Calibration</h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 transition-colors hover:bg-gray-100"
            >
              <X className="h-5 w-5 text-text-muted" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 space-y-6 overflow-y-auto p-6">
            {/* ID Column Selection */}
            <section>
              <h3 className="mb-2 font-semibold text-text-primary">ID Column</h3>
              <p className="mb-3 text-sm text-text-muted">
                Select which column serves as the unique identifier for records.
              </p>
              <select
                value={idColumn || ''}
                onChange={(e) => setIdColumn(e.target.value || null)}
                className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Use row index (fallback)</option>
                {idLikeColumns.length > 0 && (
                  <optgroup label="Detected ID Columns">
                    {idLikeColumns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="All Columns">
                  {columns
                    .filter((col) => !idLikeColumns.includes(col))
                    .map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                </optgroup>
              </select>
              {duplicateIdWarning && (
                <div className="mt-2 flex items-center gap-2 text-sm text-warning">
                  <AlertCircle className="h-4 w-4" />
                  {duplicateIdWarning}
                </div>
              )}
            </section>

            {/* Display Columns */}
            <section>
              <div className="mb-2 flex items-center gap-2">
                <Eye className="h-4 w-4 text-text-muted" />
                <h3 className="font-semibold text-text-primary">Display Columns</h3>
              </div>
              <p className="mb-3 text-sm text-text-muted">
                Select which columns to show when reviewing records for annotation.
              </p>
              <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-lg border p-3">
                {columns.map((col) => {
                  const isSelected = effectiveDisplayColumns.includes(col);

                  return (
                    <label
                      key={col}
                      className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const current =
                            displayColumns.length === 0
                              ? [...defaultDisplayColumns]
                              : [...displayColumns];
                          if (e.target.checked) {
                            setDisplayColumns([...current, col]);
                          } else {
                            setDisplayColumns(current.filter((c) => c !== col));
                          }
                        }}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <span className="truncate text-sm text-text-secondary">{col}</span>
                    </label>
                  );
                })}
              </div>
            </section>

            {/* LLM Columns */}
            <section>
              <div className="mb-2 flex items-center gap-2">
                <Bot className="h-4 w-4 text-accent-gold" />
                <h3 className="font-semibold text-text-primary">LLM Evaluation Columns</h3>
              </div>
              <p className="mb-3 text-sm text-text-muted">
                Select which columns to pass to the LLM judge for evaluation. More context can help
                the judge make better decisions, but may increase cost.
              </p>
              <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-lg border p-3">
                {columns.map((col) => {
                  const isSelected = effectiveLlmColumns.includes(col);

                  return (
                    <label
                      key={col}
                      className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const current =
                            llmColumns.length === 0 ? [...defaultLlmColumns] : [...llmColumns];
                          if (e.target.checked) {
                            setLlmColumns([...current, col]);
                          } else {
                            setLlmColumns(current.filter((c) => c !== col));
                          }
                        }}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <span className="truncate text-sm text-text-secondary">{col}</span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-text-muted">
                Default: query, actual_output, expected_output
              </p>
            </section>
          </div>

          {/* Footer */}
          <div className="border-t bg-gray-50 px-6 py-4">
            <button onClick={onClose} className="btn-primary flex items-center gap-2">
              <Check className="h-4 w-4" />
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
