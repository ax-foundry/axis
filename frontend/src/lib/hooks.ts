import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { useDataStore } from '@/stores';
import { useCalibrationStore } from '@/stores/calibration-store';
import { useCopilotStore } from '@/stores/copilot-store';

import * as api from './api';
import { createCopilotStream, createReportStream, fetchCopilotSkills } from './sse';

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
 * Manages the SSE connection and updates the copilot store with thoughts
 * as they arrive.
 */
export function useCopilotStream() {
  const { data, format, metricColumns, columns } = useDataStore();
  const { startStreaming, stopStreaming, addThought, setFinalResponse, setError, isStreaming } =
    useCopilotStore();

  const abortControllerRef = useRef<AbortController | null>(null);

  const stream = useCallback(
    (message: string, includeData: boolean = false) => {
      console.log('[useCopilotStream] stream() called with message:', message);
      console.log('[useCopilotStream] includeData:', includeData, 'data.length:', data.length);

      // Cancel any existing stream
      if (abortControllerRef.current) {
        console.log('[useCopilotStream] Aborting existing stream');
        abortControllerRef.current.abort();
      }

      console.log('[useCopilotStream] Calling startStreaming()');
      startStreaming();

      const dataContext = {
        format: format || null,
        row_count: data.length,
        metric_columns: metricColumns,
        columns: columns,
      };
      console.log('[useCopilotStream] dataContext:', dataContext);

      console.log('[useCopilotStream] Calling createCopilotStream...');
      abortControllerRef.current = createCopilotStream(
        {
          message,
          dataContext,
          data: includeData && data.length > 0 ? data : undefined,
        },
        {
          onThought: (thought: Thought) => {
            console.log(
              '[useCopilotStream] onThought received:',
              thought.type,
              thought.content?.substring(0, 50)
            );
            addThought(thought);
          },
          onResponse: (responseData) => {
            console.log(
              '[useCopilotStream] onResponse received:',
              responseData.success,
              responseData.response?.substring(0, 50)
            );
            if (responseData.success) {
              setFinalResponse(responseData.response);
            } else {
              setError('Failed to get response');
            }
          },
          onError: (errorData) => {
            console.log('[useCopilotStream] onError received:', errorData);
            setError(errorData.error);
          },
          onDone: () => {
            console.log('[useCopilotStream] onDone called');
            stopStreaming();
            abortControllerRef.current = null;
          },
        }
      );
      console.log('[useCopilotStream] createCopilotStream returned');
    },
    [
      data,
      format,
      metricColumns,
      columns,
      startStreaming,
      stopStreaming,
      addThought,
      setFinalResponse,
      setError,
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
 * Hook for fetching available copilot skills.
 */
export function useCopilotSkills() {
  const { setSkills, setSkillsLoaded } = useCopilotStore();

  return useQuery({
    queryKey: ['copilot-skills'],
    queryFn: async () => {
      const response = await fetchCopilotSkills();
      if (response.success) {
        setSkills(response.skills);
        setSkillsLoaded(true);
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
  const { data } = useDataStore();
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
