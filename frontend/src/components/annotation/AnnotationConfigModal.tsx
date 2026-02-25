'use client';

import { X, Settings, Check, AlertCircle } from 'lucide-react';
import { useState, useMemo } from 'react';

import { cn } from '@/lib/utils';
import { useUIStore, useDataStore } from '@/stores';
import { TAG_PRESETS, type TagPreset, type AnnotationScoreMode } from '@/types';
import { Columns } from '@/types';

import { TagManager } from './TagManager';

interface AnnotationConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AnnotationConfigModal({ isOpen, onClose }: AnnotationConfigModalProps) {
  const { columns, data } = useDataStore();
  const {
    annotateIdColumn,
    annotateDisplayColumns,
    annotateScoreMode,
    annotateCustomScoreRange,
    annotateCustomTags,
    setAnnotateIdColumn,
    setAnnotateDisplayColumns,
    setAnnotateScoreMode,
    setAnnotateCustomScoreRange,
    setAnnotateCustomTags,
    addAnnotateCustomTag,
    removeAnnotateCustomTag,
    resetAnnotateTagsToDefault,
  } = useUIStore();

  const [localScoreRange, setLocalScoreRange] = useState(annotateCustomScoreRange);

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
    if (!annotateIdColumn || data.length === 0) return null;
    const ids = data.map((record) => record[annotateIdColumn] as string);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size < ids.length) {
      return `Warning: ${ids.length - uniqueIds.size} duplicate IDs found`;
    }
    return null;
  }, [annotateIdColumn, data]);

  // Default display columns
  const defaultDisplayColumns: string[] = [Columns.QUERY, Columns.ACTUAL_OUTPUT];

  if (!isOpen) return null;

  const handleApplyPreset = (preset: TagPreset) => {
    setAnnotateCustomTags([...TAG_PRESETS[preset]]);
  };

  const handleScoreRangeChange = () => {
    if (localScoreRange[0] < localScoreRange[1]) {
      setAnnotateCustomScoreRange(localScoreRange);
    }
  };

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
              <h2 className="text-xl font-semibold text-text-primary">Configure Annotation</h2>
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
                value={annotateIdColumn || ''}
                onChange={(e) => setAnnotateIdColumn(e.target.value || null)}
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
              <h3 className="mb-2 font-semibold text-text-primary">Display Columns</h3>
              <p className="mb-3 text-sm text-text-muted">
                Select which columns to show in the annotation view.
              </p>
              <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-lg border p-3">
                {columns.map((col) => {
                  const isSelected =
                    annotateDisplayColumns.length === 0
                      ? defaultDisplayColumns.includes(col)
                      : annotateDisplayColumns.includes(col);

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
                            annotateDisplayColumns.length === 0
                              ? [...defaultDisplayColumns]
                              : [...annotateDisplayColumns];
                          if (e.target.checked) {
                            setAnnotateDisplayColumns([...current, col]);
                          } else {
                            setAnnotateDisplayColumns(current.filter((c) => c !== col));
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

            {/* Score Mode */}
            <section>
              <h3 className="mb-2 font-semibold text-text-primary">Score Mode</h3>
              <p className="mb-3 text-sm text-text-muted">Choose how to score annotations.</p>
              <div className="space-y-3">
                {[
                  {
                    value: 'binary' as AnnotationScoreMode,
                    label: 'Binary (Accept/Reject)',
                    description: 'Simple thumbs up/down scoring',
                  },
                  {
                    value: 'scale-5' as AnnotationScoreMode,
                    label: '1-5 Scale',
                    description: 'Five-point quality scale',
                  },
                  {
                    value: 'custom' as AnnotationScoreMode,
                    label: 'Custom Range',
                    description: 'Define your own scoring range',
                  },
                ].map((mode) => (
                  <label
                    key={mode.value}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                      annotateScoreMode === mode.value
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-gray-50'
                    )}
                  >
                    <input
                      type="radio"
                      name="scoreMode"
                      checked={annotateScoreMode === mode.value}
                      onChange={() => setAnnotateScoreMode(mode.value)}
                      className="mt-1 text-primary focus:ring-primary"
                    />
                    <div>
                      <div className="font-medium text-text-primary">{mode.label}</div>
                      <div className="text-sm text-text-muted">{mode.description}</div>
                    </div>
                  </label>
                ))}
              </div>

              {/* Custom range inputs */}
              {annotateScoreMode === 'custom' && (
                <div className="mt-4 flex items-center gap-3">
                  <label className="text-sm text-text-muted">Range:</label>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={localScoreRange[0]}
                    onChange={(e) =>
                      setLocalScoreRange([parseInt(e.target.value) || 0, localScoreRange[1]])
                    }
                    onBlur={handleScoreRangeChange}
                    className="w-20 rounded border px-2 py-1 text-center"
                  />
                  <span className="text-text-muted">to</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={localScoreRange[1]}
                    onChange={(e) =>
                      setLocalScoreRange([localScoreRange[0], parseInt(e.target.value) || 10])
                    }
                    onBlur={handleScoreRangeChange}
                    className="w-20 rounded border px-2 py-1 text-center"
                  />
                </div>
              )}
            </section>

            {/* Tags Configuration */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-text-primary">Tags</h3>
                <TagManager
                  tags={annotateCustomTags}
                  onAddTag={addAnnotateCustomTag}
                  onRemoveTag={removeAnnotateCustomTag}
                  onResetToDefault={resetAnnotateTagsToDefault}
                  onApplyPreset={handleApplyPreset}
                />
              </div>
              <p className="mb-3 text-sm text-text-muted">
                Configure available tags for categorizing annotations.
              </p>
              <div className="flex flex-wrap gap-2">
                {annotateCustomTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-gray-100 px-3 py-1 text-sm text-text-secondary"
                  >
                    {tag}
                  </span>
                ))}
              </div>
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
