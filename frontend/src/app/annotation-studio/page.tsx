'use client';

import {
  MessageSquare,
  Download,
  Settings,
  Flag,
  Undo2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState, useCallback, useMemo, useEffect } from 'react';

import {
  AnnotationConfigModal,
  AnnotationProgress,
  AnnotationControls,
  useAnnotationKeyboard,
} from '@/components/annotation';
import { FileUpload } from '@/components/file-upload';
import { ContentRenderer } from '@/components/ui/ContentRenderer';
import { PageHeader } from '@/components/ui/PageHeader';
import { cn } from '@/lib/utils';
import { useAnnotationStore, useUIStore } from '@/stores';
import { Columns } from '@/types';

import type { AnnotationScoreValue, EvaluationRecord } from '@/types';

export default function AnnotationPage() {
  const {
    data,
    columns,
    annotations,
    setAnnotation,
    updateAnnotation,
    toggleAnnotationFlag,
    setAnnotationScore,
    undoLastAnnotation,
    canUndo,
    importAnnotationsFromData,
    getAnnotatedData,
  } = useAnnotationStore();

  const {
    annotateIdColumn,
    annotateDisplayColumns,
    annotateScoreMode,
    annotateCustomScoreRange,
    annotateCustomTags,
    annotateFilter,
    annotateShowShortcuts,
    annotateCurrentIndex,
    setAnnotateFilter,
    toggleAnnotateShowShortcuts,
    setAnnotateCurrentIndex,
  } = useUIStore();

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [undoToast, setUndoToast] = useState<string | null>(null);

  // Auto-detect best ID column if not configured
  const effectiveIdColumn = useMemo(() => {
    const exactIdColumn = columns.find((col) => col === 'id');
    if (exactIdColumn) return exactIdColumn;

    if (annotateIdColumn && columns.includes(annotateIdColumn)) {
      return annotateIdColumn;
    }

    const idLikeColumns = columns.filter(
      (col) => col.toLowerCase().endsWith('_id') || col.toLowerCase().includes('uuid')
    );
    if (idLikeColumns.length > 0) return idLikeColumns[0];

    return Columns.DATASET_ID;
  }, [annotateIdColumn, columns]);

  // Get record ID - use the effective ID column
  const getRecordId = useCallback(
    (record: EvaluationRecord, index: number): string => {
      const idValue = record[effectiveIdColumn];

      if (idValue !== undefined && idValue !== null) {
        const strValue = String(idValue);
        if (strValue.length > 0) {
          return strValue;
        }
      }

      return `record-${index}`;
    },
    [effectiveIdColumn]
  );

  // Auto-import existing annotations from data on load
  const [hasImported, setHasImported] = useState(false);
  useEffect(() => {
    if (data.length > 0 && !hasImported) {
      const count = importAnnotationsFromData(getRecordId);
      if (count > 0) {
        setUndoToast(`Imported ${count} existing annotation${count > 1 ? 's' : ''}`);
        setTimeout(() => setUndoToast(null), 3000);
      }
      setHasImported(true);
    }
  }, [data.length, hasImported, getRecordId, importAnnotationsFromData]);

  // Reset import flag when data changes
  useEffect(() => {
    setHasImported(false);
  }, [data]);

  // Get display columns (default to Query + Actual Output)
  const displayColumns = useMemo(() => {
    if (annotateDisplayColumns.length > 0) {
      return annotateDisplayColumns;
    }
    return [Columns.QUERY, Columns.ACTUAL_OUTPUT];
  }, [annotateDisplayColumns]);

  // Deduplicate records by ID
  const uniqueRecords = useMemo(() => {
    const seen = new Set<string>();
    const unique: { id: string; firstIndex: number; record: EvaluationRecord }[] = [];

    data.forEach((record, index) => {
      const id = getRecordId(record, index);
      if (seen.has(id) || id.startsWith('record-')) return;
      seen.add(id);
      unique.push({ id, firstIndex: index, record });
    });

    return unique;
  }, [data, getRecordId]);

  // Clamp index
  useEffect(() => {
    if (uniqueRecords.length > 0 && annotateCurrentIndex >= uniqueRecords.length) {
      setAnnotateCurrentIndex(uniqueRecords.length - 1);
    }
  }, [uniqueRecords.length, annotateCurrentIndex, setAnnotateCurrentIndex]);

  const currentUniqueRecord = uniqueRecords[annotateCurrentIndex];
  const currentRecord = currentUniqueRecord?.record || null;
  const currentId = currentUniqueRecord?.id || null;
  const currentAnnotation = currentId ? annotations[currentId] || null : null;

  // Navigation handlers
  const handlePrev = useCallback(() => {
    setAnnotateCurrentIndex(Math.max(0, annotateCurrentIndex - 1));
  }, [annotateCurrentIndex, setAnnotateCurrentIndex]);

  const handleNext = useCallback(() => {
    setAnnotateCurrentIndex(Math.min(uniqueRecords.length - 1, annotateCurrentIndex + 1));
  }, [annotateCurrentIndex, uniqueRecords.length, setAnnotateCurrentIndex]);

  // Annotation handlers
  const handleScoreChange = useCallback(
    (score: AnnotationScoreValue) => {
      if (!currentId) return;
      setAnnotationScore(currentId, score);
    },
    [currentId, setAnnotationScore]
  );

  const handleTagToggle = useCallback(
    (tag: string) => {
      if (!currentId) return;
      const current = annotations[currentId] || { tags: [], critique: '' };
      const newTags = current.tags.includes(tag)
        ? current.tags.filter((t) => t !== tag)
        : [...current.tags, tag];
      setAnnotation(currentId, { ...current, tags: newTags });
    },
    [currentId, annotations, setAnnotation]
  );

  const handleCritiqueChange = useCallback(
    (critique: string) => {
      if (!currentId) return;
      updateAnnotation(currentId, { critique });
    },
    [currentId, updateAnnotation]
  );

  const handleSkip = useCallback(() => {
    if (!currentId) return;
    toggleAnnotationFlag(currentId);
  }, [currentId, toggleAnnotationFlag]);

  const handleUndo = useCallback(() => {
    const action = undoLastAnnotation();
    if (action) {
      setUndoToast('Annotation undone');
      setTimeout(() => setUndoToast(null), 2000);
    }
  }, [undoLastAnnotation]);

  // Keyboard shortcuts
  useAnnotationKeyboard({
    enabled: uniqueRecords.length > 0,
    scoreMode: annotateScoreMode,
    customScoreRange: annotateCustomScoreRange,
    totalRecords: uniqueRecords.length,
    currentIndex: annotateCurrentIndex,
    onNavigatePrev: handlePrev,
    onNavigateNext: handleNext,
    onSetScore: handleScoreChange,
    onSkip: handleSkip,
    onUndo: handleUndo,
  });

  // Export handler
  const handleExportAnnotations = useCallback(() => {
    const annotatedData = getAnnotatedData(getRecordId);

    if (annotatedData.length === 0) {
      setUndoToast('No data to export');
      setTimeout(() => setUndoToast(null), 2000);
      return;
    }

    const allColumns = new Set<string>();
    annotatedData.forEach((record) => {
      Object.keys(record).forEach((key) => allColumns.add(key));
    });

    ['judgment', 'critique', 'user_tags', 'annotation_flagged'].forEach((col) => {
      allColumns.add(col);
    });

    const columnList = Array.from(allColumns);

    const escapeCSV = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvHeader = columnList.map(escapeCSV).join(',');
    const csvRows = annotatedData.map((record) =>
      columnList.map((col) => escapeCSV(record[col])).join(',')
    );

    const csvContent = [csvHeader, ...csvRows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `annotated-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    setUndoToast(`Exported ${annotatedData.length} records`);
    setTimeout(() => setUndoToast(null), 2000);
  }, [getAnnotatedData, getRecordId]);

  const isFlagged = currentAnnotation?.flagged;

  // Column display labels
  const getColumnLabel = (col: string): string => {
    const labels: Record<string, string> = {
      [Columns.QUERY]: 'User Query',
      [Columns.ACTUAL_OUTPUT]: 'AI Response',
      [Columns.EXPECTED_OUTPUT]: 'Expected Output',
    };
    return labels[col] ?? col.replace(/_/g, ' ');
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={MessageSquare}
        title="Annotation Studio"
        subtitle="Human-in-the-loop annotation for quality assurance"
        actions={
          <>
            <button
              onClick={() => setConfigModalOpen(true)}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-[7px] text-xs font-medium text-text-secondary transition-all hover:border-primary hover:text-primary"
            >
              <Settings className="h-3.5 w-3.5" />
              Configure
            </button>
            <button
              onClick={handleExportAnnotations}
              disabled={Object.keys(annotations).length === 0}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-[7px] text-xs font-medium text-text-secondary transition-all hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          </>
        }
      />

      {/* Content */}
      <div className="mx-auto max-w-6xl px-6 py-6">
        {uniqueRecords.length === 0 ? (
          <div className="card">
            <div className="mb-8 py-8 text-center">
              <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <MessageSquare className="h-6 w-6 text-primary/50" />
              </div>
              <h2 className="mb-2 text-xl font-semibold text-text-primary">No Data Loaded</h2>
              <p className="mx-auto mb-6 max-w-md text-text-muted">
                Upload evaluation data to start annotating. The annotation workflow is independent
                from the evaluation workflow.
              </p>
            </div>
            <FileUpload targetStore="annotation" />
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_280px] items-start gap-6">
            {/* Left: Annotation Card */}
            <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md">
              {/* Accent gradient bar */}
              <div
                className="h-[3px] opacity-70"
                style={{
                  background: 'linear-gradient(90deg, #8B9F4F, #A4B86C, #D4AF37)',
                }}
              />

              {/* Navigation header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex gap-0.5">
                    <button
                      onClick={handlePrev}
                      disabled={annotateCurrentIndex === 0}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-base leading-none text-text-muted transition-all hover:border-primary hover:bg-primary/5 hover:text-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      &#8249;
                    </button>
                    <button
                      onClick={handleNext}
                      disabled={annotateCurrentIndex === uniqueRecords.length - 1}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-base leading-none text-text-muted transition-all hover:border-primary hover:bg-primary/5 hover:text-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      &#8250;
                    </button>
                  </div>
                  <div className="text-[13px] font-semibold text-text-primary">
                    Record {annotateCurrentIndex + 1}{' '}
                    <span className="font-normal text-text-muted">of {uniqueRecords.length}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-gray-50 px-2 py-0.5 font-mono text-[11px] text-text-muted">
                    {currentId}
                  </span>
                  {/* Flag button */}
                  <button
                    onClick={handleSkip}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-md border transition-all',
                      isFlagged
                        ? 'border-orange-300 bg-orange-50 text-orange-500'
                        : 'border-border text-text-muted hover:border-primary hover:text-primary'
                    )}
                    title="Flag / Skip (S)"
                  >
                    <Flag className="h-3.5 w-3.5" />
                  </button>
                  {/* Undo button */}
                  {canUndo() && (
                    <button
                      onClick={handleUndo}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text-muted transition-all hover:border-text-secondary hover:text-text-secondary"
                      title="Undo (Ctrl+Z)"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Content sections */}
              {currentRecord && (
                <>
                  <div className="space-y-5 p-5">
                    {displayColumns.map((column) => {
                      const value = currentRecord[column];
                      const displayValue =
                        value !== undefined && value !== null
                          ? typeof value === 'object'
                            ? JSON.stringify(value, null, 2)
                            : String(value)
                          : '';
                      const isEmpty = !displayValue;
                      const isActualOutput = column === Columns.ACTUAL_OUTPUT;

                      return (
                        <div key={column}>
                          <div className="mb-2 flex items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                              {getColumnLabel(column)}
                            </span>
                            {isActualOutput && (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-dark">
                                To Evaluate
                              </span>
                            )}
                          </div>
                          <div
                            className={cn(
                              'max-h-80 overflow-y-auto rounded-lg border p-3.5 text-[13px] leading-[1.7] text-text-secondary',
                              isActualOutput
                                ? 'border-l-[3px] border-b-gray-100 border-l-primary border-r-gray-100 border-t-gray-100 bg-gradient-to-r from-primary/[0.02] to-gray-50'
                                : 'border-gray-100 bg-gray-50'
                            )}
                          >
                            {isEmpty ? (
                              <span className="italic text-text-muted">No {column}</span>
                            ) : (
                              <ContentRenderer content={displayValue} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Annotation Controls (scoring, tags, critique) */}
                  <AnnotationControls
                    annotation={currentAnnotation}
                    scoreMode={annotateScoreMode}
                    customScoreRange={annotateCustomScoreRange}
                    availableTags={annotateCustomTags}
                    onScoreChange={handleScoreChange}
                    onTagToggle={handleTagToggle}
                    onCritiqueChange={handleCritiqueChange}
                  />
                </>
              )}
            </div>

            {/* Right: Sidebar */}
            <AnnotationProgress
              uniqueRecords={uniqueRecords}
              annotations={annotations}
              currentIndex={annotateCurrentIndex}
              filter={annotateFilter}
              showShortcuts={annotateShowShortcuts}
              scoreMode={annotateScoreMode}
              customScoreRange={annotateCustomScoreRange}
              onSelectRecord={setAnnotateCurrentIndex}
              onFilterChange={setAnnotateFilter}
              onToggleShortcuts={toggleAnnotateShowShortcuts}
            />
          </div>
        )}

        {/* Footer Navigation */}
        {uniqueRecords.length > 0 && (
          <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
            <button
              onClick={handlePrev}
              disabled={annotateCurrentIndex === 0}
              className="flex items-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-[13px] font-medium text-text-muted transition-all hover:border-text-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <div className="flex items-center gap-2 text-[11px] text-text-muted">
              <kbd className="min-w-[24px] rounded border border-border bg-gray-50 px-1.5 py-0.5 text-center font-mono text-[10px] text-text-primary">
                ←
              </kbd>
              <span>/</span>
              <kbd className="min-w-[24px] rounded border border-border bg-gray-50 px-1.5 py-0.5 text-center font-mono text-[10px] text-text-primary">
                →
              </kbd>
              <span className="ml-1">to navigate</span>
            </div>
            <button
              onClick={handleNext}
              disabled={annotateCurrentIndex === uniqueRecords.length - 1}
              className="flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-[13px] font-semibold text-white shadow-sm transition-all hover:-translate-y-px hover:bg-primary-dark hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Config Modal */}
        <AnnotationConfigModal isOpen={configModalOpen} onClose={() => setConfigModalOpen(false)} />

        {/* Toast */}
        {undoToast && (
          <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-text-primary px-4 py-2.5 text-[13px] font-medium text-white shadow-lg">
            {undoToast}
          </div>
        )}
      </div>
    </div>
  );
}
