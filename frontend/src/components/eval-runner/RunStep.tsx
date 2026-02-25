'use client';

import {
  Play,
  ChevronLeft,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  RotateCcw,
  FileSpreadsheet,
  BarChart3,
  ArrowRight,
  Database,
  Bot,
  Sparkles,
  Cpu,
  Tag,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';

import { evalRunnerRunStream } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useEvalRunnerStore, useDataStore } from '@/stores';

import type { LLMProvider, EvalRunnerSummary, EvaluationRecord, DataFormat } from '@/types';

const MODEL_OPTIONS = [
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'openai' as LLMProvider },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai' as LLMProvider },
  {
    value: 'claude-3-5-sonnet-20241022',
    label: 'Claude 3.5 Sonnet',
    provider: 'anthropic' as LLMProvider,
  },
  {
    value: 'claude-3-5-haiku-20241022',
    label: 'Claude 3.5 Haiku',
    provider: 'anthropic' as LLMProvider,
  },
];

export function RunStep() {
  const router = useRouter();
  const {
    evaluationName,
    modelName,
    llmProvider,
    maxConcurrent,
    uploadedData,
    columnMapping,
    selectedMetrics,
    availableMetrics,
    agentConfig,
    customThresholds,
    isRunning,
    progress,
    logs,
    results,
    runError,
    setEvaluationName,
    setModelName,
    setLlmProvider,
    startRun,
    updateProgress,
    addLog,
    clearLogs,
    setResults,
    setRunError,
    cancelRun,
    setCurrentStep,
    reset,
  } = useEvalRunnerStore();

  const { setData } = useDataStore();

  const abortControllerRef = useRef<AbortController | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const selectedLlmCount = selectedMetrics.filter(
    (k) => availableMetrics.find((m) => m.key === k)?.is_llm_based
  ).length;
  const selectedHeuristicCount = selectedMetrics.length - selectedLlmCount;

  /**
   * Convert evaluation results to the data store format.
   * Uses the full dataframe from axion's results.to_dataframe() (tree_format).
   */
  const convertResultsToDataStoreFormat = (
    summary: EvalRunnerSummary
  ): {
    data: EvaluationRecord[];
    columns: string[];
    format: DataFormat;
  } => {
    // Use the full dataframe from axion if available
    if (summary.dataframe_records && summary.dataframe_records.length > 0) {
      const data = summary.dataframe_records.map((record) => ({
        ...record,
        dataset_id: String(record.dataset_id || ''),
        query: String(record.query || ''),
        actual_output: String(record.actual_output || ''),
      })) as EvaluationRecord[];

      return {
        data,
        columns: summary.dataframe_columns,
        format: 'tree_format' as DataFormat,
      };
    }

    // Fallback: construct from item_results if dataframe not available
    const data: EvaluationRecord[] = [];
    const metricKeys = Object.keys(summary.item_results[0]?.metric_scores || {});
    const columns = [
      'dataset_id',
      'evaluation_name',
      'query',
      'actual_output',
      'expected_output',
      ...metricKeys,
    ];

    for (const item of summary.item_results) {
      const record: EvaluationRecord = {
        dataset_id: item.item_id,
        evaluation_name: summary.evaluation_name,
        query: item.query,
        actual_output: item.actual_output,
        expected_output: item.expected_output || '',
      };

      for (const [metricKey, score] of Object.entries(item.metric_scores)) {
        record[metricKey] = score;
      }

      data.push(record);
    }

    return { data, columns, format: 'flat_format' as DataFormat };
  };

  const handleViewInScorecard = () => {
    if (!results) return;
    const { data, columns, format } = convertResultsToDataStoreFormat(results);
    setData(data, format, columns, `${evaluationName}_results.csv`);
    router.push('/evaluate/scorecard');
  };

  const handleStartRun = () => {
    if (!uploadedData) return;

    startRun();
    clearLogs();

    abortControllerRef.current = evalRunnerRunStream(
      evaluationName,
      uploadedData,
      columnMapping,
      selectedMetrics,
      modelName,
      llmProvider,
      maxConcurrent,
      agentConfig,
      Object.keys(customThresholds).length > 0 ? customThresholds : null,
      {
        onProgress: (data) => {
          updateProgress(data.current, data.total, data.phase, data.message);
        },
        onLog: (data) => {
          addLog(data);
          setTimeout(() => {
            logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        },
        onComplete: (data) => {
          setResults(data.summary as EvalRunnerSummary);
        },
        onError: (data) => {
          setRunError(data.message);
        },
        onDone: () => {
          abortControllerRef.current = null;
        },
      }
    );
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      cancelRun();
    }
  };

  const handleDownloadCSV = () => {
    if (!results) return;

    if (results.dataframe_records && results.dataframe_records.length > 0) {
      const columns = results.dataframe_columns;
      const rows = results.dataframe_records.map((record) =>
        columns.map((col) => {
          const val = record[col];
          if (val === null || val === undefined) return '';
          if (typeof val === 'string') {
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          }
          if (typeof val === 'object') {
            return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
          }
          return String(val);
        })
      );

      const csv = [columns.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${evaluationName}_results.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const headers = ['item_id', 'query', 'actual_output', 'passed', ...selectedMetrics];
    const rows = results.item_results.map((item) => [
      item.item_id,
      `"${item.query.replace(/"/g, '""')}"`,
      `"${item.actual_output.replace(/"/g, '""')}"`,
      item.passed ? 'PASS' : 'FAIL',
      ...selectedMetrics.map((m) => item.metric_scores[m]?.toFixed(4) ?? ''),
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${evaluationName}_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJSON = () => {
    if (!results) return;

    const exportData =
      results.dataframe_records && results.dataframe_records.length > 0
        ? {
            evaluation_name: results.evaluation_name,
            run_id: results.run_id,
            total_items: results.total_items,
            metrics_count: results.metrics_count,
            average_score: results.average_score,
            overall_pass_rate: results.overall_pass_rate,
            metric_results: results.metric_results,
            records: results.dataframe_records,
            columns: results.dataframe_columns,
          }
        : results;

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${evaluationName}_results.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ============================
  // Results View
  // ============================
  if (results) {
    return (
      <div className="space-y-5 p-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="bg-success/10 flex h-10 w-10 items-center justify-center rounded-lg">
            <CheckCircle className="h-5 w-5 text-success" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Evaluation Complete</h2>
            <p className="font-mono text-xs text-text-muted">Run ID: {results.run_id}</p>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Database className="h-[18px] w-[18px] text-primary" />
            </div>
            <div>
              <div className="text-xl font-bold text-text-primary">{results.total_items}</div>
              <div className="text-xs text-text-muted">Rows Evaluated</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <BarChart3 className="h-[18px] w-[18px] text-primary" />
            </div>
            <div>
              <div className="text-xl font-bold text-text-primary">{results.metrics_count}</div>
              <div className="text-xs text-text-muted">Metrics</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Tag className="h-[18px] w-[18px] text-primary" />
            </div>
            <div>
              <div className="text-xl font-bold text-text-primary">
                {(results.average_score * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-text-muted">Avg Score</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <CheckCircle className="h-[18px] w-[18px] text-primary" />
            </div>
            <div>
              <div
                className={cn(
                  'text-xl font-bold',
                  results.overall_pass_rate >= 0.7
                    ? 'text-success'
                    : results.overall_pass_rate >= 0.5
                      ? 'text-warning'
                      : 'text-error'
                )}
              >
                {(results.overall_pass_rate * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-text-muted">Pass Rate</div>
            </div>
          </div>
        </div>

        {/* Metric Results Table */}
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border px-4 py-2">
            <h3 className="text-sm font-medium text-text-primary">Metric Results</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50/50">
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                    Metric
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-text-muted">
                    Avg
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-text-muted">
                    Median
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-text-muted">
                    Pass Rate
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-text-muted">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.metric_results.map((metric) => (
                  <tr
                    key={metric.metric_key}
                    className="border-t border-border transition-colors hover:bg-gray-50/50"
                  >
                    <td className="px-4 py-2.5 text-sm font-medium text-text-primary">
                      {metric.metric_name}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm text-text-secondary">
                      {(metric.average_score * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm text-text-secondary">
                      {(metric.median_score * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm text-text-secondary">
                      {(metric.pass_rate * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {metric.passed ? (
                        <span className="bg-success/10 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-success">
                          <CheckCircle className="h-3 w-3" />
                          PASS
                        </span>
                      ) : (
                        <span className="bg-warning/10 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-warning">
                          <AlertTriangle className="h-3 w-3" />
                          WARN
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions Row */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleDownloadCSV}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-gray-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Download CSV
          </button>
          <button
            onClick={handleDownloadJSON}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Download JSON
          </button>
          <div className="flex-1" />
          <button
            onClick={reset}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-gray-50 hover:text-text-secondary"
          >
            <RotateCcw className="h-4 w-4" />
            New Evaluation
          </button>
        </div>

        {/* View in Scorecard CTA */}
        <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">View in Scorecard</h3>
                <p className="text-xs text-text-muted">
                  Load results into the visualization dashboard for detailed analysis
                </p>
              </div>
            </div>
            <button
              onClick={handleViewInScorecard}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-dark hover:shadow-md"
            >
              View Scorecard
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================
  // Pre-Run Configuration View
  // ============================
  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Play className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Run Evaluation</h2>
          <p className="text-sm text-text-muted">Review configuration and start your evaluation</p>
        </div>
      </div>

      {/* Configuration Summary */}
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border px-4 py-2">
          <h3 className="text-sm font-medium text-text-primary">Configuration Summary</h3>
        </div>
        <div className="divide-y divide-border">
          {/* Dataset */}
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Database className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">Dataset</p>
              <p className="text-xs text-text-muted">{uploadedData?.length ?? 0} rows loaded</p>
            </div>
            <span className="bg-primary/8 rounded px-2 py-0.5 text-xs font-medium text-primary">
              {uploadedData?.length ?? 0} rows
            </span>
          </div>
          {/* Agent */}
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">Agent</p>
              <p className="text-xs text-text-muted">
                {agentConfig.type === 'none'
                  ? 'Using outputs from dataset'
                  : agentConfig.type === 'api'
                    ? 'External API agent'
                    : 'Prompt template agent'}
              </p>
            </div>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-text-muted">
              {agentConfig.type === 'none' ? 'Dataset' : agentConfig.type}
            </span>
          </div>
          {/* Metrics */}
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">Metrics</p>
              <p className="text-xs text-text-muted">
                {selectedLlmCount > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <Sparkles className="h-2.5 w-2.5" /> {selectedLlmCount} LLM-based
                  </span>
                )}
                {selectedLlmCount > 0 && selectedHeuristicCount > 0 && (
                  <span className="mx-1">·</span>
                )}
                {selectedHeuristicCount > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <Cpu className="h-2.5 w-2.5" /> {selectedHeuristicCount} heuristic
                  </span>
                )}
              </p>
            </div>
            <span className="bg-primary/8 rounded px-2 py-0.5 text-xs font-medium text-primary">
              {selectedMetrics.length} selected
            </span>
          </div>
        </div>
      </div>

      {/* Run Settings */}
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border px-4 py-2">
          <h3 className="text-sm font-medium text-text-primary">Run Settings</h3>
        </div>
        <div className="space-y-4 p-4">
          {/* Evaluation Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">
              Evaluation Name
            </label>
            <input
              type="text"
              value={evaluationName}
              onChange={(e) => setEvaluationName(e.target.value)}
              disabled={isRunning}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-gray-50 disabled:text-text-muted"
            />
          </div>
          {/* LLM Model */}
          {selectedLlmCount > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                LLM Judge Model
              </label>
              <select
                value={modelName}
                onChange={(e) => {
                  const selected = MODEL_OPTIONS.find((m) => m.value === e.target.value);
                  setModelName(e.target.value);
                  if (selected) setLlmProvider(selected.provider);
                }}
                disabled={isRunning}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-gray-50 disabled:text-text-muted"
              >
                {MODEL_OPTIONS.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-text-muted">
                Used to score LLM-based metrics ({selectedLlmCount} selected)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Start Button */}
      {!isRunning && !runError && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentStep('metrics')}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <button
            onClick={handleStartRun}
            disabled={!evaluationName || selectedMetrics.length === 0}
            className={cn(
              'flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium transition-all',
              evaluationName && selectedMetrics.length > 0
                ? 'bg-primary text-white shadow-sm hover:bg-primary-dark hover:shadow-md'
                : 'cursor-not-allowed bg-gray-100 text-gray-400'
            )}
          >
            <Play className="h-4 w-4" />
            Start Evaluation
          </button>
        </div>
      )}

      {/* Running State */}
      {isRunning && (
        <div className="space-y-4">
          {/* Header Card */}
          <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">
                    {progress?.phase === 'validating'
                      ? 'Validating Data'
                      : progress?.phase === 'evaluating'
                        ? 'Running Metrics'
                        : 'Preparing...'}
                  </h3>
                  <p className="text-xs text-text-muted">
                    {progress?.message || 'Starting evaluation...'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCancel}
                className="hover:border-error/30 hover:bg-error/5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-error"
              >
                Cancel
              </button>
            </div>

            {/* Phase Steps */}
            <div className="mb-4 flex items-center gap-2">
              {(['validating', 'evaluating', 'complete'] as const).map((phase, idx) => {
                const currentPhaseIdx =
                  progress?.phase === 'validating'
                    ? 0
                    : progress?.phase === 'evaluating'
                      ? 1
                      : progress?.phase === 'complete'
                        ? 2
                        : -1;
                const isActive = idx === currentPhaseIdx;
                const isDone = idx < currentPhaseIdx;
                const labels = ['Validate', 'Evaluate', 'Complete'];
                return (
                  <div key={phase} className="flex items-center gap-2">
                    {idx > 0 && (
                      <div
                        className={cn(
                          'h-px w-6',
                          isDone || isActive ? 'bg-primary/40' : 'bg-border'
                        )}
                      />
                    )}
                    <div className="flex items-center gap-1.5">
                      <div
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                          isDone
                            ? 'bg-primary text-white'
                            : isActive
                              ? 'bg-primary/15 text-primary ring-2 ring-primary/20'
                              : 'bg-gray-100 text-text-muted'
                        )}
                      >
                        {isDone ? <CheckCircle className="h-3 w-3" /> : <span>{idx + 1}</span>}
                      </div>
                      <span
                        className={cn(
                          'text-[11px] font-medium',
                          isActive
                            ? 'text-primary'
                            : isDone
                              ? 'text-text-secondary'
                              : 'text-text-muted'
                        )}
                      >
                        {labels[idx]}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Progress Bar */}
            {progress && progress.total > 0 && (
              <div>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-text-muted">
                    {progress.phase === 'validating' ? 'Data validation' : 'Metric evaluation'}
                  </span>
                  <span className="font-mono font-medium text-text-primary">
                    {progress.current}/{progress.total}
                    <span className="ml-1 text-text-muted">
                      ({Math.min(100, Math.round((progress.current / progress.total) * 100))}%)
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      progress.phase === 'evaluating'
                        ? 'bg-gradient-to-r from-primary to-primary-light'
                        : 'bg-primary'
                    )}
                    style={{
                      width: `${Math.min(100, (progress.current / progress.total) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Warning Summary (from logs) */}
          {(() => {
            const warningLogs = logs.filter((l) => l.level === 'WARNING');
            if (warningLogs.length === 0) return null;
            return (
              <div className="border-warning/20 bg-warning/5 rounded-lg border p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  <span className="text-xs font-semibold text-warning">
                    {warningLogs.length} Warning{warningLogs.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {warningLogs.slice(-5).map((log, i) => (
                    <p key={i} className="text-[11px] leading-relaxed text-text-secondary">
                      {log.message}
                    </p>
                  ))}
                  {warningLogs.length > 5 && (
                    <p className="text-[11px] text-text-muted">
                      +{warningLogs.length - 5} more (see logs below)
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Logs */}
          <div className="overflow-hidden rounded-lg border border-gray-800 bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-700/50 px-3 py-1.5">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                  Live Output
                </span>
              </div>
              <button
                onClick={clearLogs}
                className="text-[11px] text-gray-500 transition-colors hover:text-gray-300"
              >
                Clear
              </button>
            </div>
            <div className="max-h-52 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed">
              {logs.length === 0 && (
                <div className="py-2 text-center text-gray-600">Waiting for output...</div>
              )}
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={cn(
                    'py-0.5',
                    log.level === 'ERROR'
                      ? 'text-red-400'
                      : log.level === 'WARNING'
                        ? 'text-amber-400'
                        : 'text-gray-400'
                  )}
                >
                  <span className="text-gray-600">
                    {log.timestamp.split('T')[1]?.split('.')[0] || ''}
                  </span>{' '}
                  <span
                    className={cn(
                      'font-semibold',
                      log.level === 'ERROR'
                        ? 'text-red-500'
                        : log.level === 'WARNING'
                          ? 'text-amber-500'
                          : 'text-gray-500'
                    )}
                  >
                    {log.level === 'INFO' ? 'INF' : log.level === 'WARNING' ? 'WRN' : 'ERR'}
                  </span>{' '}
                  {log.message}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {runError && (
        <div className="border-error/20 bg-error/5 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-error" />
            <span className="text-sm font-medium text-text-primary">Evaluation Failed</span>
          </div>
          <p className="mt-1.5 text-xs text-text-muted">{runError}</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setRunError(null)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-gray-50"
            >
              Try Again
            </button>
            <button
              onClick={() => setCurrentStep('metrics')}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-gray-50"
            >
              Back to Metrics
            </button>
          </div>
        </div>
      )}

      {/* Back button (only when not running, not errored, and not showing start button) */}
    </div>
  );
}
