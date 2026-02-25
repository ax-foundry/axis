import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type {
  EvalRunnerStep,
  EvalRunnerMetricInfo,
  EvalRunnerColumnMapping,
  EvalRunnerAgentConfig,
  EvalRunnerSummary,
  EvalRunnerLogEvent,
  LLMProvider,
} from '@/types';

// Default column mapping
const DEFAULT_COLUMN_MAPPING: EvalRunnerColumnMapping = {
  dataset_id: 'dataset_id',
  query: 'query',
  actual_output: null,
  expected_output: null,
  retrieved_content: null,
  conversation: null,
  latency: null,
  tools_called: null,
  expected_tools: null,
  acceptance_criteria: null,
  additional_input: null,
  document_text: null,
  actual_reference: null,
  expected_reference: null,
  trace_id: null,
  observation_id: null,
};

// Default agent config
const DEFAULT_AGENT_CONFIG: EvalRunnerAgentConfig = {
  type: 'none',
  api_config: null,
  prompt_config: null,
};

interface EvalRunnerState {
  // Step navigation
  currentStep: EvalRunnerStep;

  // Step 1: Upload
  uploadedData: Record<string, unknown>[] | null;
  columns: string[];
  columnMapping: EvalRunnerColumnMapping;
  rowCount: number;
  fileName: string | null;

  // Step 2: Agent (optional)
  agentConfig: EvalRunnerAgentConfig;
  agentTestResult: {
    success: boolean;
    output?: string;
    error?: string;
    latency?: number;
  } | null;

  // Step 3: Metrics
  availableMetrics: EvalRunnerMetricInfo[];
  selectedMetrics: string[];
  metricsLoading: boolean;

  // Step 4: Run
  evaluationName: string;
  modelName: string;
  llmProvider: LLMProvider;
  maxConcurrent: number;
  customThresholds: Record<string, number>;
  isRunning: boolean;
  progress: { current: number; total: number; phase?: string; message?: string } | null;
  logs: EvalRunnerLogEvent[];

  // Results
  results: EvalRunnerSummary | null;
  runError: string | null;

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions - Step navigation
  setCurrentStep: (step: EvalRunnerStep) => void;
  canNavigateToStep: (step: EvalRunnerStep) => boolean;

  // Actions - Upload
  setUploadedData: (data: Record<string, unknown>[], columns: string[], fileName?: string) => void;
  setColumnMapping: (mapping: Partial<EvalRunnerColumnMapping>) => void;
  clearUploadedData: () => void;

  // Actions - Agent
  setAgentConfig: (config: Partial<EvalRunnerAgentConfig>) => void;
  setAgentTestResult: (result: EvalRunnerState['agentTestResult']) => void;
  resetAgentConfig: () => void;

  // Actions - Metrics
  setAvailableMetrics: (metrics: EvalRunnerMetricInfo[]) => void;
  setMetricsLoading: (loading: boolean) => void;
  toggleMetric: (key: string) => void;
  setSelectedMetrics: (keys: string[]) => void;
  clearSelectedMetrics: () => void;

  // Actions - Run configuration
  setEvaluationName: (name: string) => void;
  setModelName: (model: string) => void;
  setLlmProvider: (provider: LLMProvider) => void;
  setMaxConcurrent: (concurrent: number) => void;
  setCustomThreshold: (metricKey: string, threshold: number) => void;
  clearCustomThresholds: () => void;

  // Actions - Run execution
  startRun: () => void;
  updateProgress: (current: number, total: number, phase?: string, message?: string) => void;
  addLog: (log: EvalRunnerLogEvent) => void;
  clearLogs: () => void;
  setResults: (results: EvalRunnerSummary) => void;
  setRunError: (error: string | null) => void;
  cancelRun: () => void;

  // Actions - General
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useEvalRunnerStore = create<EvalRunnerState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentStep: 'upload',

      // Upload
      uploadedData: null,
      columns: [],
      columnMapping: { ...DEFAULT_COLUMN_MAPPING },
      rowCount: 0,
      fileName: null,

      // Agent
      agentConfig: { ...DEFAULT_AGENT_CONFIG },
      agentTestResult: null,

      // Metrics
      availableMetrics: [],
      selectedMetrics: [],
      metricsLoading: false,

      // Run
      evaluationName: '',
      modelName: 'gpt-4o',
      llmProvider: 'openai',
      maxConcurrent: 5,
      customThresholds: {},
      isRunning: false,
      progress: null,
      logs: [],

      // Results
      results: null,
      runError: null,

      // UI
      isLoading: false,
      error: null,

      // Step navigation
      setCurrentStep: (step) => set({ currentStep: step }),

      canNavigateToStep: (step) => {
        const state = get();
        switch (step) {
          case 'upload':
            return true;
          case 'agent':
            return state.uploadedData !== null && state.uploadedData.length > 0;
          case 'metrics':
            // Can navigate if we have data and either agent is none or configured
            return (
              state.uploadedData !== null &&
              state.uploadedData.length > 0 &&
              (state.agentConfig.type === 'none' || state.columnMapping.actual_output !== null)
            );
          case 'run':
            return (
              state.uploadedData !== null &&
              state.uploadedData.length > 0 &&
              state.selectedMetrics.length > 0
            );
          default:
            return false;
        }
      },

      // Upload actions
      setUploadedData: (data, columns, fileName) => {
        // Auto-generate evaluation name from filename
        const baseName = fileName?.replace(/\.[^/.]+$/, '') ?? 'evaluation';
        const timestamp = new Date().toISOString().split('T')[0];

        set({
          uploadedData: data,
          columns,
          rowCount: data.length,
          fileName: fileName ?? null,
          evaluationName: `${baseName}_${timestamp}`,
          error: null,
          currentStep: 'agent',
        });
      },

      setColumnMapping: (mapping) =>
        set((state) => ({
          columnMapping: { ...state.columnMapping, ...mapping },
        })),

      clearUploadedData: () =>
        set({
          uploadedData: null,
          columns: [],
          columnMapping: { ...DEFAULT_COLUMN_MAPPING },
          rowCount: 0,
          fileName: null,
          currentStep: 'upload',
        }),

      // Agent actions
      setAgentConfig: (config) =>
        set((state) => ({
          agentConfig: { ...state.agentConfig, ...config },
          agentTestResult: null, // Clear test result when config changes
        })),

      setAgentTestResult: (result) => set({ agentTestResult: result }),

      resetAgentConfig: () =>
        set({
          agentConfig: { ...DEFAULT_AGENT_CONFIG },
          agentTestResult: null,
        }),

      // Metrics actions
      setAvailableMetrics: (metrics) => set({ availableMetrics: metrics }),

      setMetricsLoading: (loading) => set({ metricsLoading: loading }),

      toggleMetric: (key) =>
        set((state) => {
          const isSelected = state.selectedMetrics.includes(key);
          return {
            selectedMetrics: isSelected
              ? state.selectedMetrics.filter((k) => k !== key)
              : [...state.selectedMetrics, key],
          };
        }),

      setSelectedMetrics: (keys) => set({ selectedMetrics: keys }),

      clearSelectedMetrics: () => set({ selectedMetrics: [] }),

      // Run configuration actions
      setEvaluationName: (name) => set({ evaluationName: name }),

      setModelName: (model) => set({ modelName: model }),

      setLlmProvider: (provider) => set({ llmProvider: provider }),

      setMaxConcurrent: (concurrent) =>
        set({ maxConcurrent: Math.min(Math.max(1, concurrent), 20) }),

      setCustomThreshold: (metricKey, threshold) =>
        set((state) => ({
          customThresholds: {
            ...state.customThresholds,
            [metricKey]: threshold,
          },
        })),

      clearCustomThresholds: () => set({ customThresholds: {} }),

      // Run execution actions
      startRun: () =>
        set({
          isRunning: true,
          progress: { current: 0, total: 0 },
          logs: [],
          results: null,
          runError: null,
        }),

      updateProgress: (current, total, phase, message) =>
        set({ progress: { current, total, phase, message } }),

      addLog: (log) =>
        set((state) => ({
          logs: [...state.logs, log].slice(-100), // Keep last 100 logs
        })),

      clearLogs: () => set({ logs: [] }),

      setResults: (results) =>
        set({
          results,
          isRunning: false,
          progress: null,
        }),

      setRunError: (error) =>
        set({
          runError: error,
          isRunning: false,
        }),

      cancelRun: () =>
        set({
          isRunning: false,
          progress: null,
        }),

      // General actions
      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error, isLoading: false }),

      reset: () =>
        set({
          currentStep: 'upload',
          uploadedData: null,
          columns: [],
          columnMapping: { ...DEFAULT_COLUMN_MAPPING },
          rowCount: 0,
          fileName: null,
          agentConfig: { ...DEFAULT_AGENT_CONFIG },
          agentTestResult: null,
          selectedMetrics: [],
          evaluationName: '',
          modelName: 'gpt-4o',
          llmProvider: 'openai',
          maxConcurrent: 5,
          customThresholds: {},
          isRunning: false,
          progress: null,
          logs: [],
          results: null,
          runError: null,
          isLoading: false,
          error: null,
        }),
    }),
    {
      name: 'axis-eval-runner-store',
      partialize: (state) => ({
        // Only persist configuration, not data or results
        columnMapping: state.columnMapping,
        agentConfig: state.agentConfig,
        modelName: state.modelName,
        llmProvider: state.llmProvider,
        maxConcurrent: state.maxConcurrent,
        customThresholds: state.customThresholds,
      }),
    }
  )
);
