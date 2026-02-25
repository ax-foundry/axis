import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type {
  DataFormat,
  EvaluationRecord,
  AlignStep,
  JudgeConfig,
  FewShotExample,
  AlignmentMetrics,
  AlignmentResult,
  LearningArtifact,
  MisalignmentAnalysis,
  OptimizedPrompt,
  PipelineMetadata,
  AnnotationWithNotes,
  ErrorPattern,
} from '@/types';

// Default judge configuration
const DEFAULT_SYSTEM_PROMPT = `You are an expert evaluator assessing the quality of AI-generated responses.

## Evaluation Criteria
{evaluation_criteria}

## Instructions
1. Carefully read the query and response
2. Apply the evaluation criteria strictly
3. Provide your judgment as ACCEPT (score 1) or REJECT (score 0)
4. Explain your reasoning briefly

## Output Format
You must respond in exactly this format:
Score: [0 or 1]
Reasoning: [Your explanation in 1-2 sentences]`;

const DEFAULT_EVALUATION_CRITERIA = `Evaluate whether the response:
1. Directly addresses the user's query
2. Provides accurate and factual information
3. Is clear, coherent, and well-structured
4. Is free from harmful, biased, or inappropriate content

Accept (1) if the response meets all criteria satisfactorily.
Reject (0) if the response fails any criteria significantly.`;

const DEFAULT_JUDGE_CONFIG: JudgeConfig = {
  model: 'gpt-4o',
  provider: 'openai',
  system_prompt: DEFAULT_SYSTEM_PROMPT,
  evaluation_criteria: DEFAULT_EVALUATION_CRITERIA,
  few_shot_examples: [],
  temperature: 0,
};

interface CalibrationState {
  // Step tracking
  currentStep: AlignStep;

  // Raw data
  data: EvaluationRecord[];
  format: DataFormat | null;
  columns: string[];

  // Column configuration
  idColumn: string | null; // Column to use as unique ID
  displayColumns: string[]; // Columns to show in annotation view
  llmColumns: string[]; // Columns to pass to LLM for evaluation

  // Metadata
  rowCount: number;
  fileName: string | null;
  uploadedAt: string | null;

  // Human annotations - maps record ID to annotation with optional notes
  humanAnnotations: Record<string, AnnotationWithNotes>;

  // Current annotation index
  currentAnnotationIndex: number;

  // AI-clustered patterns from annotation notes
  errorPatterns: ErrorPattern[];
  isClusteringPatterns: boolean;

  // Learning artifacts from EvidencePipeline
  learningArtifacts: LearningArtifact[];
  pipelineMetadata: PipelineMetadata | null;

  // Judge configuration
  judgeConfig: JudgeConfig;

  // Evaluation results
  evaluationResults: AlignmentResult[];
  alignmentMetrics: AlignmentMetrics | null;
  isEvaluating: boolean;
  evaluationProgress: number;
  evaluationError: string | null;

  // Analysis results
  misalignmentAnalysis: MisalignmentAnalysis | null;
  optimizedPrompt: OptimizedPrompt | null;
  isAnalyzing: boolean;

  // Analyze tab state
  analyzeFilter: 'all' | 'aligned' | 'misaligned';
  analyzeSubTab: 'comparison' | 'metrics' | 'insights';

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions - Step navigation
  setCurrentStep: (step: AlignStep) => void;
  canNavigateToStep: (step: AlignStep) => boolean;

  // Actions - Data management
  setData: (
    data: EvaluationRecord[],
    format: DataFormat,
    columns: string[],
    fileName?: string
  ) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearData: () => void;

  // Actions - Annotation
  setAnnotation: (recordId: string, score: 0 | 1, notes?: string) => void;
  setAnnotationNotes: (recordId: string, notes: string) => void;
  removeAnnotation: (recordId: string) => void;
  setCurrentAnnotationIndex: (index: number) => void;
  getAnnotationProgress: () => { total: number; annotated: number; percentage: number };

  // Actions - Pattern clustering
  setErrorPatterns: (patterns: ErrorPattern[]) => void;
  setIsClusteringPatterns: (isClustering: boolean) => void;
  setLearningArtifacts: (learnings: LearningArtifact[]) => void;
  setPipelineMetadata: (metadata: PipelineMetadata | null) => void;

  // Actions - Judge configuration
  setJudgeConfig: (config: Partial<JudgeConfig>) => void;
  resetJudgeConfig: () => void;
  addFewShotExample: (example: FewShotExample) => void;
  removeFewShotExample: (index: number) => void;
  updateFewShotExample: (index: number, example: FewShotExample) => void;

  // Actions - Evaluation
  setEvaluationResults: (results: AlignmentResult[], metrics: AlignmentMetrics) => void;
  setIsEvaluating: (isEvaluating: boolean) => void;
  setEvaluationProgress: (progress: number) => void;
  setEvaluationError: (error: string | null) => void;
  clearEvaluationResults: () => void;

  // Actions - Analysis
  setMisalignmentAnalysis: (analysis: MisalignmentAnalysis | null) => void;
  setOptimizedPrompt: (prompt: OptimizedPrompt | null) => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  applyOptimizedPrompt: () => void;

  // Actions - Analyze tab
  setAnalyzeFilter: (filter: 'all' | 'aligned' | 'misaligned') => void;
  setAnalyzeSubTab: (tab: 'metrics' | 'comparison' | 'insights') => void;

  // Actions - Column configuration
  setIdColumn: (column: string | null) => void;
  setDisplayColumns: (columns: string[]) => void;
  setLlmColumns: (columns: string[]) => void;

  // Actions - Reset
  resetAll: () => void;
}

export const useCalibrationStore = create<CalibrationState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentStep: 'upload',
      data: [],
      format: null,
      columns: [],
      idColumn: null,
      displayColumns: [],
      llmColumns: [],
      rowCount: 0,
      fileName: null,
      uploadedAt: null,
      humanAnnotations: {},
      currentAnnotationIndex: 0,
      errorPatterns: [],
      isClusteringPatterns: false,
      learningArtifacts: [],
      pipelineMetadata: null,
      judgeConfig: { ...DEFAULT_JUDGE_CONFIG },
      evaluationResults: [],
      alignmentMetrics: null,
      isEvaluating: false,
      evaluationProgress: 0,
      evaluationError: null,
      misalignmentAnalysis: null,
      optimizedPrompt: null,
      isAnalyzing: false,
      analyzeFilter: 'all',
      analyzeSubTab: 'comparison',
      isLoading: false,
      error: null,

      // Step navigation
      setCurrentStep: (step) => set({ currentStep: step }),

      canNavigateToStep: (step) => {
        const state = get();
        switch (step) {
          case 'upload':
            return true;
          case 'review':
            return state.data.length > 0;
          case 'build':
            return Object.keys(state.humanAnnotations).length > 0;
          default:
            return false;
        }
      },

      // Data management
      setData: (data, format, columns, fileName) =>
        set({
          data,
          format,
          columns,
          rowCount: data.length,
          fileName: fileName ?? null,
          uploadedAt: new Date().toISOString(),
          error: null,
          currentStep: 'review',
          currentAnnotationIndex: 0,
        }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error, isLoading: false }),

      clearData: () =>
        set({
          data: [],
          format: null,
          columns: [],
          idColumn: null,
          displayColumns: [],
          llmColumns: [],
          rowCount: 0,
          fileName: null,
          uploadedAt: null,
          error: null,
          humanAnnotations: {},
          currentAnnotationIndex: 0,
          currentStep: 'upload',
        }),

      // Annotation
      setAnnotation: (recordId, score, notes) =>
        set((state) => ({
          humanAnnotations: {
            ...state.humanAnnotations,
            [recordId]: {
              score,
              notes: notes ?? state.humanAnnotations[recordId]?.notes,
              timestamp: new Date().toISOString(),
            },
          },
        })),

      setAnnotationNotes: (recordId, notes) =>
        set((state) => {
          const existing = state.humanAnnotations[recordId];
          if (!existing) return state;
          return {
            humanAnnotations: {
              ...state.humanAnnotations,
              [recordId]: {
                ...existing,
                notes,
              },
            },
          };
        }),

      removeAnnotation: (recordId) =>
        set((state) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [recordId]: _removed, ...rest } = state.humanAnnotations;
          return { humanAnnotations: rest };
        }),

      setCurrentAnnotationIndex: (index) => set({ currentAnnotationIndex: index }),

      getAnnotationProgress: () => {
        const state = get();
        const total = state.data.length;
        const annotated = Object.keys(state.humanAnnotations).length;
        const percentage = total > 0 ? Math.round((annotated / total) * 100) : 0;
        return { total, annotated, percentage };
      },

      // Pattern clustering
      setErrorPatterns: (patterns) => set({ errorPatterns: patterns }),
      setIsClusteringPatterns: (isClusteringPatterns) => set({ isClusteringPatterns }),
      setLearningArtifacts: (learningArtifacts) => set({ learningArtifacts }),
      setPipelineMetadata: (pipelineMetadata) => set({ pipelineMetadata }),

      // Judge configuration
      setJudgeConfig: (config) =>
        set((state) => ({
          judgeConfig: { ...state.judgeConfig, ...config },
        })),

      resetJudgeConfig: () => set({ judgeConfig: { ...DEFAULT_JUDGE_CONFIG } }),

      addFewShotExample: (example) =>
        set((state) => ({
          judgeConfig: {
            ...state.judgeConfig,
            few_shot_examples: [...state.judgeConfig.few_shot_examples, example],
          },
        })),

      removeFewShotExample: (index) =>
        set((state) => ({
          judgeConfig: {
            ...state.judgeConfig,
            few_shot_examples: state.judgeConfig.few_shot_examples.filter((_, i) => i !== index),
          },
        })),

      updateFewShotExample: (index, example) =>
        set((state) => ({
          judgeConfig: {
            ...state.judgeConfig,
            few_shot_examples: state.judgeConfig.few_shot_examples.map((e, i) =>
              i === index ? example : e
            ),
          },
        })),

      // Evaluation
      setEvaluationResults: (results, metrics) =>
        set({
          evaluationResults: results,
          alignmentMetrics: metrics,
          isEvaluating: false,
          evaluationProgress: 100,
          evaluationError: null,
          // Stay on 'build' step - results display inline now
        }),

      setIsEvaluating: (isEvaluating) => set({ isEvaluating }),

      setEvaluationProgress: (progress) => set({ evaluationProgress: progress }),

      setEvaluationError: (error) => set({ evaluationError: error, isEvaluating: false }),

      clearEvaluationResults: () =>
        set({
          evaluationResults: [],
          alignmentMetrics: null,
          evaluationProgress: 0,
          evaluationError: null,
          misalignmentAnalysis: null,
          optimizedPrompt: null,
        }),

      // Analysis
      setMisalignmentAnalysis: (analysis) => set({ misalignmentAnalysis: analysis }),

      setOptimizedPrompt: (prompt) => set({ optimizedPrompt: prompt }),

      setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),

      applyOptimizedPrompt: () =>
        set((state) => {
          if (!state.optimizedPrompt) return state;
          return {
            judgeConfig: {
              ...state.judgeConfig,
              system_prompt: state.optimizedPrompt.optimized_prompt,
              evaluation_criteria: state.optimizedPrompt.evaluation_criteria,
            },
            optimizedPrompt: null, // Clear after applying
          };
        }),

      // Analyze tab
      setAnalyzeFilter: (filter) => set({ analyzeFilter: filter }),
      setAnalyzeSubTab: (tab) => set({ analyzeSubTab: tab }),

      // Column configuration
      setIdColumn: (column) => set({ idColumn: column }),
      setDisplayColumns: (columns) => set({ displayColumns: columns }),
      setLlmColumns: (columns) => set({ llmColumns: columns }),

      // Reset all
      resetAll: () =>
        set({
          currentStep: 'upload',
          data: [],
          format: null,
          columns: [],
          idColumn: null,
          displayColumns: [],
          llmColumns: [],
          rowCount: 0,
          fileName: null,
          uploadedAt: null,
          humanAnnotations: {},
          currentAnnotationIndex: 0,
          errorPatterns: [],
          isClusteringPatterns: false,
          learningArtifacts: [],
          pipelineMetadata: null,
          judgeConfig: { ...DEFAULT_JUDGE_CONFIG },
          evaluationResults: [],
          alignmentMetrics: null,
          isEvaluating: false,
          evaluationProgress: 0,
          evaluationError: null,
          misalignmentAnalysis: null,
          optimizedPrompt: null,
          isAnalyzing: false,
          analyzeFilter: 'all',
          analyzeSubTab: 'comparison',
          isLoading: false,
          error: null,
        }),
    }),
    {
      name: 'axis-calibration-store',
      partialize: (state) => ({
        // Persist human annotations and judge config (but not raw data - too large)
        humanAnnotations: state.humanAnnotations,
        judgeConfig: state.judgeConfig,
        format: state.format,
        columns: state.columns,
        idColumn: state.idColumn,
        displayColumns: state.displayColumns,
        llmColumns: state.llmColumns,
        rowCount: state.rowCount,
        fileName: state.fileName,
        uploadedAt: state.uploadedAt,
      }),
    }
  )
);

// Export default config for use elsewhere
export { DEFAULT_JUDGE_CONFIG, DEFAULT_SYSTEM_PROMPT, DEFAULT_EVALUATION_CRITERIA };
