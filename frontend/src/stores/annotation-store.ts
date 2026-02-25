import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { extractAnnotationsFromData, mergeAnnotationsToData } from '@/lib/annotation-utils';

import type {
  DataFormat,
  EvaluationRecord,
  AnnotationData,
  AnnotationUndoAction,
  AnnotationScoreValue,
} from '@/types';

interface AnnotationState {
  // Raw data
  data: EvaluationRecord[];
  format: DataFormat | null;
  columns: string[];

  // Metadata
  rowCount: number;
  fileName: string | null;
  uploadedAt: string | null;

  // Annotations (keyed by record ID)
  annotations: Record<string, AnnotationData>;
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
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearData: () => void;

  // Annotation actions
  setAnnotation: (id: string, annotation: AnnotationData) => void;
  updateAnnotation: (id: string, updates: Partial<AnnotationData>) => void;
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

export const useAnnotationStore = create<AnnotationState>()(
  persist(
    (set, get) => ({
      // Initial state
      data: [],
      format: null,
      columns: [],
      rowCount: 0,
      fileName: null,
      uploadedAt: null,
      annotations: {},
      importedAnnotationCount: 0,
      annotationUndoStack: [],
      maxUndoStackSize: 20,
      isLoading: false,
      error: null,

      // Actions
      setData: (data, format, columns, fileName) =>
        set({
          data,
          format,
          columns,
          rowCount: data.length,
          fileName: fileName ?? null,
          uploadedAt: new Date().toISOString(),
          error: null,
        }),

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
        return mergeAnnotationsToData(state.data, state.annotations, getRecordId);
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
      name: 'axis-annotation-store',
      partialize: (state) => ({
        // Only persist metadata and annotations, NOT the actual data (too large for localStorage)
        format: state.format,
        columns: state.columns,
        rowCount: state.rowCount,
        fileName: state.fileName,
        uploadedAt: state.uploadedAt,
        annotations: state.annotations,
      }),
    }
  )
);
