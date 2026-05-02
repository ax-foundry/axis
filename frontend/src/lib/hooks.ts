import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { useDataStore, useMonitoringStore, useHumanSignalsStore } from '@/stores';
import { useCalibrationStore } from '@/stores/calibration-store';
import { useCopilotStore } from '@/stores/copilot-store';

import * as api from './api';
import { useFilteredEvalData } from './hooks/useFilteredEvalData';
import { createCopilotStream, createReportStream, fetchCopilotTools } from './sse';

import type {
  AnnotationWithNotes,
  ClusteringMethod,
  EvaluationRecord,
  DataFormat,
  JudgeConfig,
  AlignmentResult,
  ExampleSelectionStrategy,
  AlignmentMetrics,
  InsightResult,
  Thought,
  ReportRequest,
  ReportResponse,
  ReportMode,
  ReportType,
  ExtractionConfig,
} from '@/types';

// Data hooks
export function useUploadFile() {
  const queryClient = useQueryClient();
  const { setData, setLoading, setError } = useDataStore();

  return useMutation({
    mutationFn: api.uploadFile,
    onMutate: () => {
      setLoading(true);
    },
    onSuccess: (response) => {
      setData(
        (response.data || []) as EvaluationRecord[],
        response.format as DataFormat,
        response.columns,
        undefined
      );
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Upload failed');
    },
    onSettled: () => {
      setLoading(false);
    },
  });
}

export function useExampleDataset() {
  const queryClient = useQueryClient();
  const { setData, setLoading, setError } = useDataStore();

  return useMutation({
    mutationFn: api.loadExampleDataset,
    onMutate: () => {
      setLoading(true);
    },
    onSuccess: (response) => {
      setData(
        response.data as EvaluationRecord[],
        response.format as DataFormat,
        response.columns,
        `example_${response.format}`
      );
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to load example');
    },
    onSettled: () => {
      setLoading(false);
    },
  });
}

// Analytics hooks
export function useSummaryStats(data: EvaluationRecord[]) {
  return useQuery({
    queryKey: ['summary', data.length],
    queryFn: () => api.getSummaryStats(data),
    enabled: data.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useDistribution(data: EvaluationRecord[], metric: string, bins?: number) {
  return useQuery({
    queryKey: ['distribution', metric, data.length, bins],
    queryFn: () => api.getDistribution(data, metric, bins),
    enabled: data.length > 0 && !!metric,
    staleTime: 5 * 60 * 1000,
  });
}

export function useComparison(data: EvaluationRecord[], groupBy: string, metrics?: string[]) {
  return useQuery({
    queryKey: ['comparison', groupBy, metrics, data.length],
    queryFn: () => api.getComparison(data, groupBy, metrics),
    enabled: data.length > 0 && !!groupBy,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCorrelation(data: EvaluationRecord[], metrics?: string[]) {
  return useQuery({
    queryKey: ['correlation', metrics, data.length],
    queryFn: () => api.getCorrelation(data, metrics),
    enabled: data.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRadarData(data: EvaluationRecord[], metrics: string[], groupBy?: string) {
  return useQuery({
    queryKey: ['radar', metrics, groupBy, data.length],
    queryFn: () => api.getRadarData(data, metrics, groupBy),
    enabled: data.length > 0 && metrics.length >= 3,
    staleTime: 5 * 60 * 1000,
  });
}

export function useScatterData(
  data: EvaluationRecord[],
  xMetric: string,
  yMetric: string,
  colorBy?: string
) {
  return useQuery({
    queryKey: ['scatter', xMetric, yMetric, colorBy, data.length],
    queryFn: () => api.getScatterData(data, xMetric, yMetric, colorBy),
    enabled: data.length > 0 && !!xMetric && !!yMetric,
    staleTime: 5 * 60 * 1000,
  });
}

// AI hooks
export function useAIAnalysis(data: EvaluationRecord[], focus?: string) {
  return useQuery({
    queryKey: ['ai-analysis', focus, data.length],
    queryFn: () => api.analyzeData(data, focus),
    enabled: data.length > 0,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useAIStatus() {
  return useQuery({
    queryKey: ['ai-status'],
    queryFn: api.getAIStatus,
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useStoreStatus() {
  return useQuery({
    queryKey: ['store-status'],
    queryFn: api.getStoreStatus,
    staleTime: 15 * 1000, // 15 seconds
    refetchInterval: 30 * 1000, // poll every 30s
  });
}

export function useChat() {
  return useMutation({
    mutationFn: ({
      messages,
      dataContext,
    }: {
      messages: Array<{ role: string; content: string }>;
      dataContext?: Record<string, unknown>;
    }) => api.chat(messages, dataContext),
  });
}

// Health check
export function useHealthCheck() {
  return useQuery({
    queryKey: ['health'],
    queryFn: api.healthCheck,
    refetchInterval: 60000, // 60 seconds
  });
}

// ============================================
// Align Evals Hooks
// ============================================

export function useAlignEvaluate() {
  const {
    setEvaluationResults,
    setIsEvaluating,
    setEvaluationProgress,
    setEvaluationError,
    llmColumns,
  } = useCalibrationStore();
  const progressIntervalRef = { current: null as NodeJS.Timeout | null };

  const startProgressSimulation = () => {
    setEvaluationProgress(0);
    let progress = 0;
    progressIntervalRef.current = setInterval(() => {
      // Simulate progress: fast at first, then slow down as it approaches 90%
      const increment = Math.max(1, Math.floor((90 - progress) / 10));
      progress = Math.min(90, progress + increment);
      setEvaluationProgress(progress);
    }, 500);
  };

  const stopProgressSimulation = (success: boolean) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    // Jump to 100% on success, or stay where it is on failure
    if (success) {
      setEvaluationProgress(100);
    }
  };

  return useMutation({
    mutationFn: ({
      records,
      humanAnnotations,
      judgeConfig,
    }: {
      records: EvaluationRecord[];
      humanAnnotations: Record<string, number>;
      judgeConfig: JudgeConfig;
    }) =>
      api.alignEvaluate(
        records,
        humanAnnotations,
        judgeConfig,
        llmColumns.length > 0 ? llmColumns : undefined
      ),
    onMutate: () => {
      setIsEvaluating(true);
      setEvaluationError(null);
      startProgressSimulation();
    },
    onSuccess: (response) => {
      stopProgressSimulation(response.success);
      if (response.success) {
        setEvaluationResults(response.results, response.metrics);
      } else {
        setEvaluationError(response.message || 'Evaluation failed');
      }
    },
    onError: (error) => {
      stopProgressSimulation(false);
      setEvaluationError(error instanceof Error ? error.message : 'Evaluation failed');
    },
  });
}

export function useAlignAnalyzeMisalignment() {
  const { setMisalignmentAnalysis, setIsAnalyzing } = useCalibrationStore();

  return useMutation({
    mutationFn: ({
      results,
      judgeConfig,
    }: {
      results: AlignmentResult[];
      judgeConfig: JudgeConfig;
    }) => api.alignAnalyzeMisalignment(results, judgeConfig),
    onMutate: () => {
      setIsAnalyzing(true);
    },
    onSuccess: (response) => {
      if (response.success) {
        setMisalignmentAnalysis(response.analysis);
      }
      setIsAnalyzing(false);
    },
    onError: () => {
      setIsAnalyzing(false);
    },
  });
}

export function useAlignOptimizePrompt() {
  const { setOptimizedPrompt, setIsAnalyzing } = useCalibrationStore();

  return useMutation({
    mutationFn: ({
      results,
      currentConfig,
    }: {
      results: AlignmentResult[];
      currentConfig: JudgeConfig;
    }) => api.alignOptimizePrompt(results, currentConfig),
    onMutate: () => {
      setIsAnalyzing(true);
    },
    onSuccess: (response) => {
      if (response.success) {
        setOptimizedPrompt(response.optimized);
      }
      setIsAnalyzing(false);
    },
    onError: () => {
      setIsAnalyzing(false);
    },
  });
}

export function useAlignSuggestExamples() {
  return useMutation({
    mutationFn: ({
      records,
      humanAnnotations,
      strategy,
      count,
    }: {
      records: EvaluationRecord[];
      humanAnnotations: Record<string, number>;
      strategy?: ExampleSelectionStrategy;
      count?: number;
    }) => api.alignSuggestExamples(records, humanAnnotations, strategy, count),
  });
}

export function useAlignModels() {
  return useQuery({
    queryKey: ['align-models'],
    queryFn: api.alignGetModels,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useAlignConfigs() {
  return useQuery({
    queryKey: ['align-configs'],
    queryFn: api.alignGetConfigs,
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useAlignSaveConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      name,
      config,
      metrics,
    }: {
      name: string;
      config: JudgeConfig;
      metrics?: AlignmentMetrics;
    }) => api.alignSaveConfig(name, config, metrics),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['align-configs'] });
    },
  });
}

export function useAlignDeleteConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (configId: string) => api.alignDeleteConfig(configId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['align-configs'] });
    },
  });
}

export function useAlignStatus() {
  return useQuery({
    queryKey: ['align-status'],
    queryFn: api.alignGetStatus,
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useAlignDefaults() {
  return useQuery({
    queryKey: ['align-defaults'],
    queryFn: api.alignGetDefaults,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useClusterPatterns() {
  const { setErrorPatterns, setIsClusteringPatterns, setLearningArtifacts, setPipelineMetadata } =
    useCalibrationStore();

  return useMutation({
    mutationFn: ({
      annotations,
      judgeConfig,
      method = 'llm',
      domainContext,
    }: {
      annotations: Record<string, AnnotationWithNotes>;
      judgeConfig?: JudgeConfig;
      method?: ClusteringMethod;
      domainContext?: string;
    }) => api.alignClusterPatterns(annotations, judgeConfig, method, domainContext),
    onMutate: () => {
      setIsClusteringPatterns(true);
      setLearningArtifacts([]);
      setPipelineMetadata(null);
    },
    onSuccess: (response) => {
      if (response.success) {
        setErrorPatterns(response.patterns);
      }
      setLearningArtifacts(response.learnings ?? []);
      setPipelineMetadata(response.pipeline_metadata ?? null);
      setIsClusteringPatterns(false);
    },
    onError: () => {
      setLearningArtifacts([]);
      setPipelineMetadata(null);
      setIsClusteringPatterns(false);
    },
  });
}

// ============================================
// AI Copilot Streaming Hooks
// ============================================

/**
 * Hook for streaming copilot responses with real-time thoughts.
 *
 * Reads the selected dataset from the copilot store and sends data_context
 * (schema hints only — actual data lives in DuckDB on the backend).
 */
export function useCopilotStream() {
  const dataStore = useDataStore();
  const monitoringStore = useMonitoringStore();
  const humanSignalsStore = useHumanSignalsStore();
  const {
    startStreaming,
    stopStreaming,
    addThought,
    setFinalResponse,
    setError,
    isStreaming,
    selectedDataset,
    conversationHistory,
    appendToHistory,
    ensureSessionId,
    provider,
    selectedAgent,
  } = useCopilotStore();

  const abortControllerRef = useRef<AbortController | null>(null);

  const stream = useCallback(
    (message: string) => {
      // Cancel any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      startStreaming();

      const sessionId = ensureSessionId();

      // Build history including the new user turn so the backend sees it immediately.
      const nextHistory = [...conversationHistory, { role: 'user' as const, content: message }];
      appendToHistory({ role: 'user', content: message });

      // Build data_context (schema hints) based on selected dataset
      let dataContext: {
        format: string | null;
        row_count: number;
        metric_columns: string[];
        columns: string[];
      } = { format: null, row_count: 0, metric_columns: [], columns: [] };

      const dataset = selectedDataset || 'evaluation';

      if (dataset === 'evaluation') {
        dataContext = {
          format: dataStore.format || null,
          row_count: dataStore.data.length,
          metric_columns: dataStore.metricColumns,
          columns: dataStore.columns,
        };
      } else if (dataset === 'monitoring') {
        dataContext = {
          format: monitoringStore.format || null,
          row_count: monitoringStore.data.length,
          metric_columns: monitoringStore.metricColumns,
          columns: monitoringStore.columns,
        };
      } else if (dataset === 'human_signals') {
        dataContext = {
          format: null,
          row_count: humanSignalsStore.cases.length,
          metric_columns: [],
          columns: humanSignalsStore.columns,
        };
      } else if (dataset === 'kpi') {
        dataContext = {
          format: null,
          row_count: 0,
          metric_columns: [],
          columns: [],
        };
      }

      const streamUrl =
        provider === 'oai-agents' ? '/api/ai/copilot/stream/oai' : '/api/ai/copilot/stream';

      abortControllerRef.current = createCopilotStream(
        {
          message,
          dataContext,
          dataset_label: dataset,
          conversation_history: nextHistory,
          stream_url: streamUrl,
          session_id: sessionId,
          ...(selectedAgent ? { agent_name: selectedAgent } : {}),
        },
        {
          onThought: (thought: Thought) => {
            addThought(thought);
          },
          onResponse: (responseData) => {
            if (responseData.success) {
              setFinalResponse(responseData.response, responseData.chart, responseData.download);
              appendToHistory({ role: 'assistant', content: responseData.response });
            } else {
              setError('Failed to get response');
            }
          },
          onError: (errorData) => {
            setError(errorData.error);
          },
          onDone: () => {
            stopStreaming();
            abortControllerRef.current = null;
          },
        }
      );
    },
    [
      dataStore,
      monitoringStore,
      humanSignalsStore,
      selectedDataset,
      conversationHistory,
      provider,
      startStreaming,
      stopStreaming,
      addThought,
      setFinalResponse,
      setError,
      appendToHistory,
      ensureSessionId,
      selectedAgent,
    ]
  );

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    stopStreaming();
  }, [stopStreaming]);

  return {
    stream,
    cancel,
    isStreaming,
  };
}

/**
 * Hook for fetching available copilot tools.
 */
export function useCopilotTools() {
  const { setTools, setToolsLoaded } = useCopilotStore();

  return useQuery({
    queryKey: ['copilot-tools'],
    queryFn: async () => {
      const response = await fetchCopilotTools();
      if (response.success) {
        setTools(response.tools);
        setToolsLoaded(true);
      }
      return response;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// ============================================
// Report Generation Hooks
// ============================================

interface ReportStreamState {
  isGenerating: boolean;
  thoughts: Thought[];
  report: ReportResponse | null;
  insights: InsightResult | null;
  error: string | null;
}

/**
 * Hook for streaming report generation with real-time thoughts.
 */
export function useReportStream() {
  const { filteredData: data } = useFilteredEvalData();
  const abortControllerRef = useRef<AbortController | null>(null);

  const [state, setState] = useState<ReportStreamState>({
    isGenerating: false,
    thoughts: [],
    report: null,
    insights: null,
    error: null,
  });

  const generate = useCallback(
    (options: {
      mode: ReportMode;
      reportType: ReportType;
      metricFilter?: string;
      extractionConfig: ExtractionConfig;
      includeData?: boolean;
    }) => {
      // Cancel any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Reset state
      setState({
        isGenerating: true,
        thoughts: [],
        report: null,
        insights: null,
        error: null,
      });

      const request: ReportRequest = {
        mode: options.mode,
        report_type: options.reportType,
        metric_filter: options.metricFilter,
        extraction_config: options.extractionConfig,
        data: options.includeData !== false && data.length > 0 ? data : [],
      };

      abortControllerRef.current = createReportStream(request, {
        onThought: (thought: Thought) => {
          setState((prev) => ({
            ...prev,
            thoughts: [...prev.thoughts, thought],
          }));
        },
        onInsights: (insightsData: InsightResult) => {
          setState((prev) => ({
            ...prev,
            insights: insightsData,
          }));
        },
        onResponse: (response: ReportResponse) => {
          setState((prev) => ({
            ...prev,
            report: response,
            // Also pick up insights from response if not already set via SSE event
            insights: prev.insights ?? response.insights ?? null,
          }));
        },
        onError: (errorData) => {
          setState((prev) => ({
            ...prev,
            error: errorData.error,
            isGenerating: false,
          }));
        },
        onDone: () => {
          setState((prev) => ({
            ...prev,
            isGenerating: false,
          }));
          abortControllerRef.current = null;
        },
      });
    },
    [data]
  );

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      isGenerating: false,
    }));
  }, []);

  const reset = useCallback(() => {
    cancel();
    setState({
      isGenerating: false,
      thoughts: [],
      report: null,
      insights: null,
      error: null,
    });
  }, [cancel]);

  return {
    ...state,
    generate,
    cancel,
    reset,
  };
}

/**
 * Hook for extracting issues preview (non-streaming).
 */
export function useExtractIssuesPreview() {
  return useMutation({
    mutationFn: api.extractIssuesPreview,
  });
}

/**
 * Hook for generating reports (non-streaming).
 */
export function useGenerateReport() {
  return useMutation({
    mutationFn: api.generateReport,
  });
}

/**
 * Hook for checking report service status.
 */
export function useReportStatus() {
  return useQuery({
    queryKey: ['report-status'],
    queryFn: api.getReportStatus,
    staleTime: 60 * 1000, // 1 minute
  });
}

// ============================================
// Metric Definitions Hook
// ============================================

export function useMetricDefinitions() {
  return useQuery({
    queryKey: ['metric-definitions'],
    queryFn: api.getMetricDefinitions,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Memory/Graph hooks — re-exported from plugin module
export {
  useUpdateMemoryRule,
  useCreateMemoryRule,
  useDeleteMemoryRule,
  useMemoryGraph,
  useMemoryGraphSummary,
  useMemoryGraphSearch,
  useMemoryGraphNeighborhood,
} from './hooks/memory-hooks';
