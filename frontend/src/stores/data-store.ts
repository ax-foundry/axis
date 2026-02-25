import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { Columns } from '@/types';

import type {
  DataFormat,
  EvaluationRecord,
  MetricSummary,
  AnnotationData,
  AnnotationUndoAction,
  AnnotationScoreValue,
} from '@/types';

/**
 * Extract metric and component names from data based on format.
 * For tree_format: metrics/components are rows where metric_type is 'metric' or 'component'
 * For other formats: metrics are numeric columns
 */
function extractMetricsAndComponents(
  data: EvaluationRecord[],
  format: DataFormat,
  columns: string[]
): { metrics: string[]; components: string[] } {
  if (format === 'tree_format') {
    // For tree format, extract unique metric_name values by metric_type
    const metrics = new Set<string>();
    const components = new Set<string>();

    data.forEach((record) => {
      const metricType = record[Columns.METRIC_TYPE];
      const metricName = record[Columns.METRIC_NAME];
      if (metricName) {
        if (metricType === 'metric') {
          metrics.add(String(metricName));
        } else if (metricType === 'component') {
          components.add(String(metricName));
        }
      }
    });

    return {
      metrics: Array.from(metrics).sort(),
      components: Array.from(components).sort(),
    };
  }

  // For other formats, find numeric columns (excluding known non-metric columns)
  const excludeColumns = new Set([
    'dataset_id',
    'query',
    'actual_output',
    'expected_output',
    'conversation',
    'timestamp',
    'run_id',
    'evaluation_name',
    'source',
    'version',
    Columns.DATASET_ID,
    Columns.QUERY,
    Columns.ACTUAL_OUTPUT,
    Columns.EXPECTED_OUTPUT,
  ]);

  const metricColumns: string[] = [];

  if (data.length > 0) {
    const sample = data.slice(0, Math.min(100, data.length));
    columns.forEach((col) => {
      if (excludeColumns.has(col.toLowerCase())) return;

      // Check if column has numeric values
      const hasNumericValues = sample.some((record) => {
        const val = record[col];
        return typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)));
      });

      if (hasNumericValues) {
        metricColumns.push(col);
      }
    });
  }

  return { metrics: metricColumns, components: [] };
}

// Re-export for backwards compatibility
export type Annotation = AnnotationData;

// Annotation column names to check for existing annotations
const ANNOTATION_COLUMNS = {
  judgment: Columns.JUDGMENT,
  critique: Columns.CRITIQUE,
  userTags: Columns.USER_TAGS,
  flagged: Columns.ANNOTATION_FLAGGED,
} as const;

/**
 * Extract existing annotations from uploaded data
 */
function extractAnnotationsFromData(
  data: EvaluationRecord[],
  columns: string[],
  getRecordId: (record: EvaluationRecord, index: number) => string
): Record<string, AnnotationData> {
  const annotations: Record<string, AnnotationData> = {};

  // Check which annotation columns exist
  const hasJudgment = columns.includes(ANNOTATION_COLUMNS.judgment);
  const hasCritique = columns.includes(ANNOTATION_COLUMNS.critique);
  const hasUserTags = columns.includes(ANNOTATION_COLUMNS.userTags);
  const hasFlagged = columns.includes(ANNOTATION_COLUMNS.flagged);

  if (!hasJudgment && !hasCritique && !hasUserTags && !hasFlagged) {
    return annotations;
  }

  const seen = new Set<string>();

  data.forEach((record, index) => {
    const id = getRecordId(record, index);

    // Skip duplicates and fallback IDs
    if (seen.has(id) || id.startsWith('record-')) return;
    seen.add(id);

    const judgment = hasJudgment ? record[ANNOTATION_COLUMNS.judgment] : undefined;
    const critique = hasCritique ? record[ANNOTATION_COLUMNS.critique] : undefined;
    const userTags = hasUserTags ? record[ANNOTATION_COLUMNS.userTags] : undefined;
    const flagged = hasFlagged ? record[ANNOTATION_COLUMNS.flagged] : undefined;

    // Skip if no annotation data exists for this record
    if (judgment === undefined && !critique && !userTags && !flagged) return;
    if (judgment === null && !critique && !userTags && !flagged) return;

    // Parse score from judgment
    let score: AnnotationScoreValue | undefined;
    if (judgment !== undefined && judgment !== null && judgment !== '') {
      if (judgment === 'accept' || judgment === 1 || judgment === '1' || judgment === true) {
        score = 'accept';
      } else if (
        judgment === 'reject' ||
        judgment === 0 ||
        judgment === '0' ||
        judgment === false
      ) {
        score = 'reject';
      } else if (typeof judgment === 'number') {
        score = judgment;
      } else if (typeof judgment === 'string' && !isNaN(Number(judgment))) {
        score = Number(judgment);
      }
    }

    // Parse tags
    let tags: string[] = [];
    if (userTags) {
      if (Array.isArray(userTags)) {
        tags = userTags.map(String);
      } else if (typeof userTags === 'string') {
        try {
          const parsed = JSON.parse(userTags);
          tags = Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          // Try comma-separated
          tags = userTags
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean);
        }
      }
    }

    // Parse flagged
    const isFlagged = flagged === true || flagged === 1 || flagged === '1' || flagged === 'true';

    // Only create annotation if there's actual data
    if (score !== undefined || tags.length > 0 || critique || isFlagged) {
      annotations[id] = {
        score,
        tags,
        critique: critique ? String(critique) : '',
        flagged: isFlagged || undefined,
      };
    }
  });

  return annotations;
}

interface DataState {
  // Raw data
  data: EvaluationRecord[];
  format: DataFormat | null;
  columns: string[];

  // Metadata
  rowCount: number;
  fileName: string | null;
  uploadedAt: string | null;

  // Derived data
  metricColumns: string[];
  componentColumns: string[];
  summary: MetricSummary[];

  // Annotations (keyed by record ID)
  annotations: Record<string, Annotation>;
  importedAnnotationCount: number;

  // Undo history for annotations
  annotationUndoStack: AnnotationUndoAction[];
  maxUndoStackSize: number;

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions
  setData: (
    data: EvaluationRecord[],
    format: DataFormat,
    columns: string[],
    fileName?: string
  ) => void;
  setMetricColumns: (columns: string[]) => void;
  setSummary: (summary: MetricSummary[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearData: () => void;

  // Annotation actions
  setAnnotation: (id: string, annotation: Annotation) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  toggleAnnotationFlag: (id: string) => void;
  setAnnotationScore: (id: string, score: AnnotationScoreValue) => void;
  clearAnnotations: () => void;
  importAnnotationsFromData: (
    getRecordId: (record: EvaluationRecord, index: number) => string
  ) => number;

  // Export helper
  getAnnotatedData: (
    getRecordId: (record: EvaluationRecord, index: number) => string
  ) => EvaluationRecord[];

  // Undo actions
  undoLastAnnotation: () => AnnotationUndoAction | null;
  canUndo: () => boolean;
  clearUndoStack: () => void;
}

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      // Initial state
      data: [],
      format: null,
      columns: [],
      rowCount: 0,
      fileName: null,
      uploadedAt: null,
      metricColumns: [],
      componentColumns: [],
      summary: [],
      annotations: {},
      importedAnnotationCount: 0,
      annotationUndoStack: [],
      maxUndoStackSize: 20,
      isLoading: false,
      error: null,

      // Actions
      setData: (data, format, columns, fileName) => {
        // Extract metric and component names based on format
        const { metrics, components } = extractMetricsAndComponents(data, format, columns);

        set({
          data,
          format,
          columns,
          rowCount: data.length,
          fileName: fileName ?? null,
          uploadedAt: new Date().toISOString(),
          metricColumns: metrics,
          componentColumns: components,
          error: null,
        });
      },

      setMetricColumns: (metricColumns) => set({ metricColumns }),

      setSummary: (summary) => set({ summary }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error, isLoading: false }),

      clearData: () =>
        set({
          data: [],
          format: null,
          columns: [],
          rowCount: 0,
          fileName: null,
          uploadedAt: null,
          metricColumns: [],
          componentColumns: [],
          summary: [],
          annotations: {},
          importedAnnotationCount: 0,
          annotationUndoStack: [],
          error: null,
        }),

      // Annotation actions
      setAnnotation: (id, annotation) =>
        set((state) => {
          const previousState = state.annotations[id] || null;
          const undoAction: AnnotationUndoAction = {
            type: 'update',
            id,
            previousState,
            timestamp: new Date().toISOString(),
          };
          const newStack = [undoAction, ...state.annotationUndoStack].slice(
            0,
            state.maxUndoStackSize
          );
          return {
            annotations: {
              ...state.annotations,
              [id]: {
                ...annotation,
                annotatedAt: annotation.annotatedAt || new Date().toISOString(),
              },
            },
            annotationUndoStack: newStack,
          };
        }),

      updateAnnotation: (id, updates) =>
        set((state) => {
          const previousState = state.annotations[id] || null;
          const undoAction: AnnotationUndoAction = {
            type: 'update',
            id,
            previousState,
            timestamp: new Date().toISOString(),
          };
          const newStack = [undoAction, ...state.annotationUndoStack].slice(
            0,
            state.maxUndoStackSize
          );
          return {
            annotations: {
              ...state.annotations,
              [id]: {
                ...(state.annotations[id] || { tags: [], critique: '' }),
                ...updates,
                annotatedAt: new Date().toISOString(),
              },
            },
            annotationUndoStack: newStack,
          };
        }),

      toggleAnnotationFlag: (id) =>
        set((state) => {
          const current = state.annotations[id] || { tags: [], critique: '' };
          const previousState = state.annotations[id] || null;
          const undoAction: AnnotationUndoAction = {
            type: 'update',
            id,
            previousState,
            timestamp: new Date().toISOString(),
          };
          const newStack = [undoAction, ...state.annotationUndoStack].slice(
            0,
            state.maxUndoStackSize
          );
          return {
            annotations: {
              ...state.annotations,
              [id]: {
                ...current,
                flagged: !current.flagged,
                annotatedAt: new Date().toISOString(),
              },
            },
            annotationUndoStack: newStack,
          };
        }),

      setAnnotationScore: (id, score) =>
        set((state) => {
          const current = state.annotations[id] || { tags: [], critique: '' };
          const previousState = state.annotations[id] || null;
          const undoAction: AnnotationUndoAction = {
            type: 'update',
            id,
            previousState,
            timestamp: new Date().toISOString(),
          };
          const newStack = [undoAction, ...state.annotationUndoStack].slice(
            0,
            state.maxUndoStackSize
          );
          return {
            annotations: {
              ...state.annotations,
              [id]: {
                ...current,
                score,
                annotatedAt: new Date().toISOString(),
              },
            },
            annotationUndoStack: newStack,
          };
        }),

      clearAnnotations: () =>
        set({ annotations: {}, importedAnnotationCount: 0, annotationUndoStack: [] }),

      importAnnotationsFromData: (getRecordId) => {
        const state = get();
        const imported = extractAnnotationsFromData(state.data, state.columns, getRecordId);
        const count = Object.keys(imported).length;

        if (count > 0) {
          set({
            annotations: { ...imported, ...state.annotations },
            importedAnnotationCount: count,
          });
        }

        return count;
      },

      getAnnotatedData: (getRecordId) => {
        const state = get();
        const seen = new Set<string>();
        const result: EvaluationRecord[] = [];

        state.data.forEach((record, index) => {
          const id = getRecordId(record, index);

          // Skip duplicates - only keep first occurrence
          if (seen.has(id) || id.startsWith('record-')) return;
          seen.add(id);

          const annotation = state.annotations[id];
          const annotatedRecord = { ...record };

          // Add annotation columns
          if (annotation) {
            // Convert score to judgment
            if (annotation.score !== undefined) {
              annotatedRecord[ANNOTATION_COLUMNS.judgment] = annotation.score;
            }
            // Add critique
            if (annotation.critique) {
              annotatedRecord[ANNOTATION_COLUMNS.critique] = annotation.critique;
            }
            // Add tags as JSON array string
            if (annotation.tags && annotation.tags.length > 0) {
              annotatedRecord[ANNOTATION_COLUMNS.userTags] = JSON.stringify(annotation.tags);
            }
            // Add flagged status
            if (annotation.flagged) {
              annotatedRecord[ANNOTATION_COLUMNS.flagged] = true;
            }
          }

          result.push(annotatedRecord);
        });

        return result;
      },

      // Undo actions
      undoLastAnnotation: () => {
        const state = get();
        if (state.annotationUndoStack.length === 0) return null;

        const [lastAction, ...remainingStack] = state.annotationUndoStack;
        const { id, previousState } = lastAction;

        set((state) => {
          const newAnnotations = { ...state.annotations };
          if (previousState === null) {
            delete newAnnotations[id];
          } else {
            newAnnotations[id] = previousState;
          }
          return {
            annotations: newAnnotations,
            annotationUndoStack: remainingStack,
          };
        });

        return lastAction;
      },

      canUndo: () => get().annotationUndoStack.length > 0,

      clearUndoStack: () => set({ annotationUndoStack: [] }),
    }),
    {
      name: 'axis-data-store',
      partialize: (state) => ({
        // Only persist metadata and annotations, NOT the actual data (too large for localStorage)
        format: state.format,
        columns: state.columns,
        rowCount: state.rowCount,
        fileName: state.fileName,
        uploadedAt: state.uploadedAt,
        metricColumns: state.metricColumns,
        componentColumns: state.componentColumns,
        annotations: state.annotations,
      }),
    }
  )
);
