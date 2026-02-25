'use client';

import {
  X,
  Copy,
  Download,
  ChevronDown,
  ChevronUp,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Loader2,
  Settings2,
  Play,
  ArrowLeft,
} from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useReportStream } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useUIStore, useDataStore } from '@/stores';
import { AVAILABLE_CONTEXT_FIELDS, Columns } from '@/types';

import { InsightPatternsPanel } from './InsightPatternsPanel';

import type { InsightResult, Thought, ThoughtType, ExtractionConfig, ContextField } from '@/types';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalStep = 'config' | 'generating' | 'result';

const THOUGHT_COLORS: Record<ThoughtType, string> = {
  reasoning: '#3B82F6',
  tool_use: '#8B5CF6',
  observation: '#10B981',
  planning: '#F59E0B',
  reflection: '#6366F1',
  decision: '#EC4899',
  error: '#EF4444',
  success: '#22C55E',
};

const REPORT_MODES = [
  { value: 'low' as const, label: 'Low-Scoring', description: 'Issues below threshold' },
  { value: 'high' as const, label: 'High-Scoring', description: 'Issues above threshold' },
  { value: 'overall' as const, label: 'Overall', description: 'All issues' },
];

const REPORT_TYPES = [
  { value: 'summary' as const, label: 'Summary', description: 'Executive overview' },
  { value: 'detailed' as const, label: 'Detailed', description: 'Comprehensive analysis' },
  { value: 'grouped' as const, label: 'Grouped', description: 'Issues by pattern' },
  {
    value: 'recommendations' as const,
    label: 'Recommendations',
    description: 'Improvement suggestions',
  },
];

function ThoughtBubble({ thought }: { thought: Thought }) {
  const color = THOUGHT_COLORS[thought.type as ThoughtType] || '#6B7280';

  return (
    <div className="flex items-start gap-2 py-1">
      <div className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <div className="min-w-0 flex-1">
        <span className="text-xs text-text-muted">{thought.type}</span>
        <p className="text-sm text-text-secondary">{thought.content}</p>
      </div>
    </div>
  );
}

export function ReportModal({ isOpen, onClose }: ReportModalProps) {
  const { data } = useDataStore();
  const {
    reportMetricFilter,
    reportMode,
    reportType,
    reportScoreThreshold,
    reportIncludeNan,
    reportMetricFilters,
    reportMaxIssues,
    reportSampleRate,
    reportContextFields,
    setReportMode,
    setReportType,
    setReportScoreThreshold,
    setReportIncludeNan,
    setReportMetricFilters,
    setReportMaxIssues,
    setReportSampleRate,
    toggleReportContextField,
  } = useUIStore();

  const { isGenerating, thoughts, report, insights, error, generate, cancel, reset } =
    useReportStream();

  const [step, setStep] = useState<ModalStep>('config');
  const [thoughtsExpanded, setThoughtsExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  // Get available metrics from data
  const availableMetrics = useMemo(() => {
    const metrics = new Set<string>();
    data.forEach((row) => {
      const metricName = row[Columns.METRIC_NAME] as string;
      if (metricName) metrics.add(metricName);
    });
    return Array.from(metrics).sort();
  }, [data]);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('config');
      reset();
    }
  }, [isOpen, reset]);

  // Move to result step when generation completes
  useEffect(() => {
    if (step === 'generating' && !isGenerating && (report || error)) {
      setStep('result');
    }
  }, [step, isGenerating, report, error]);

  const handleGenerate = useCallback(() => {
    const extractionConfig: ExtractionConfig = {
      score_threshold: reportScoreThreshold,
      include_nan: reportIncludeNan,
      metric_filters: reportMetricFilters,
      max_issues: reportMaxIssues,
      sample_rate: reportSampleRate,
      include_context_fields: reportContextFields,
    };

    setStep('generating');
    generate({
      mode: reportMode,
      reportType: reportType,
      metricFilter: reportMetricFilter || undefined,
      extractionConfig,
      includeData: true,
    });
  }, [
    reportMode,
    reportType,
    reportMetricFilter,
    reportScoreThreshold,
    reportIncludeNan,
    reportMetricFilters,
    reportMaxIssues,
    reportSampleRate,
    reportContextFields,
    generate,
  ]);

  const handleCopy = useCallback(async () => {
    if (report?.report_text) {
      await navigator.clipboard.writeText(report.report_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [report]);

  const handleDownload = useCallback(() => {
    if (report?.report_text) {
      const blob = new Blob([report.report_text], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evaluation-report-${reportMode}-${Date.now()}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [report, reportMode]);

  const handleBackToConfig = useCallback(() => {
    reset();
    setStep('config');
  }, [reset]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="border-border/50 flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              {step === 'config' ? (
                <Settings2 className="h-5 w-5 text-primary" />
              ) : (
                <Sparkles className="h-5 w-5 text-primary" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {step === 'config' ? 'Configure Report' : 'AI Report Generation'}
              </h2>
              <p className="text-sm text-text-muted">
                {reportMetricFilters.length > 0
                  ? `Filtered to: ${reportMetricFilter}${reportMetricFilters.length > 1 ? ` (+${reportMetricFilters.length - 1} children)` : ''}`
                  : `${data.length} records • ${availableMetrics.length} metrics`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {step === 'config' && (
            <ConfigStep
              reportMode={reportMode}
              reportType={reportType}
              reportScoreThreshold={reportScoreThreshold}
              reportIncludeNan={reportIncludeNan}
              reportMetricFilters={reportMetricFilters}
              reportMaxIssues={reportMaxIssues}
              reportSampleRate={reportSampleRate}
              reportContextFields={reportContextFields}
              availableMetrics={availableMetrics}
              setReportMode={setReportMode}
              setReportType={setReportType}
              setReportScoreThreshold={setReportScoreThreshold}
              setReportIncludeNan={setReportIncludeNan}
              setReportMetricFilters={setReportMetricFilters}
              setReportMaxIssues={setReportMaxIssues}
              setReportSampleRate={setReportSampleRate}
              toggleReportContextField={toggleReportContextField}
            />
          )}

          {(step === 'generating' || step === 'result') && (
            <ResultStep
              isGenerating={isGenerating}
              thoughts={thoughts}
              report={report}
              insights={insights}
              error={error}
              thoughtsExpanded={thoughtsExpanded}
              setThoughtsExpanded={setThoughtsExpanded}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-border/50 flex items-center justify-between border-t px-6 py-4">
          {step === 'config' && (
            <>
              <div />
              <button
                onClick={handleGenerate}
                disabled={data.length === 0}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  data.length === 0
                    ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                    : 'bg-primary text-white hover:bg-primary-dark'
                )}
              >
                <Play className="h-4 w-4" />
                Generate Report
              </button>
            </>
          )}

          {step === 'generating' && (
            <>
              <button
                onClick={cancel}
                className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </div>
            </>
          )}

          {step === 'result' && (
            <>
              <button
                onClick={handleBackToConfig}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-gray-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Config
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  disabled={!report?.report_text}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors',
                    !report?.report_text
                      ? 'cursor-not-allowed opacity-50'
                      : 'text-text-secondary hover:bg-gray-50'
                  )}
                >
                  {copied ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-success" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </button>

                <button
                  onClick={handleDownload}
                  disabled={!report?.report_text}
                  className={cn(
                    'flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors',
                    !report?.report_text ? 'cursor-not-allowed opacity-50' : 'hover:bg-primary-dark'
                  )}
                >
                  <Download className="h-4 w-4" />
                  Download
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Configuration Step Component
interface ConfigStepProps {
  reportMode: (typeof REPORT_MODES)[number]['value'];
  reportType: (typeof REPORT_TYPES)[number]['value'];
  reportScoreThreshold: number;
  reportIncludeNan: boolean;
  reportMetricFilters: string[];
  reportMaxIssues: number;
  reportSampleRate: number;
  reportContextFields: ContextField[];
  availableMetrics: string[];
  setReportMode: (mode: (typeof REPORT_MODES)[number]['value']) => void;
  setReportType: (type: (typeof REPORT_TYPES)[number]['value']) => void;
  setReportScoreThreshold: (threshold: number) => void;
  setReportIncludeNan: (include: boolean) => void;
  setReportMetricFilters: (filters: string[]) => void;
  setReportMaxIssues: (max: number) => void;
  setReportSampleRate: (rate: number) => void;
  toggleReportContextField: (field: ContextField) => void;
}

function ConfigStep({
  reportMode,
  reportType,
  reportScoreThreshold,
  reportIncludeNan,
  reportMetricFilters,
  reportMaxIssues,
  reportSampleRate,
  reportContextFields,
  availableMetrics,
  setReportMode,
  setReportType,
  setReportScoreThreshold,
  setReportIncludeNan,
  setReportMetricFilters,
  setReportMaxIssues,
  setReportSampleRate,
  toggleReportContextField,
}: ConfigStepProps) {
  return (
    <div className="space-y-6 p-6">
      {/* Mode & Type Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Mode Selection */}
        <div>
          <label className="mb-2 block text-sm font-medium text-text-primary">Analysis Mode</label>
          <div className="space-y-2">
            {REPORT_MODES.map((mode) => (
              <button
                key={mode.value}
                onClick={() => setReportMode(mode.value)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-all',
                  reportMode === mode.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border/50 hover:border-border hover:bg-gray-50/50'
                )}
              >
                <div>
                  <span className="text-sm font-medium text-text-primary">{mode.label}</span>
                  <p className="text-xs text-text-muted">{mode.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Report Type Selection */}
        <div>
          <label className="mb-2 block text-sm font-medium text-text-primary">Report Type</label>
          <div className="space-y-2">
            {REPORT_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => setReportType(type.value)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-all',
                  reportType === type.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border/50 hover:border-border hover:bg-gray-50/50'
                )}
              >
                <div>
                  <span className="text-sm font-medium text-text-primary">{type.label}</span>
                  <p className="text-xs text-text-muted">{type.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Extraction Config */}
      <div className="border-border/50 rounded-xl border bg-gray-50/50 p-4">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-text-primary">
          <Settings2 className="h-4 w-4" />
          Extraction Configuration
        </h3>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Score Threshold */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">
              Score Threshold
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={reportScoreThreshold}
                onChange={(e) => setReportScoreThreshold(parseFloat(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="w-12 text-sm font-medium text-primary">
                {reportScoreThreshold.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Max Issues */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Max Issues</label>
            <input
              type="number"
              min="1"
              max="500"
              value={reportMaxIssues}
              onChange={(e) => setReportMaxIssues(parseInt(e.target.value) || 100)}
              className="border-border/50 w-full rounded-lg border px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          {/* Sample Rate */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Sample Rate</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={reportSampleRate}
                onChange={(e) => setReportSampleRate(parseFloat(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="w-12 text-sm font-medium text-primary">
                {(reportSampleRate * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Include NaN */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="includeNan"
              checked={reportIncludeNan}
              onChange={(e) => setReportIncludeNan(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <label htmlFor="includeNan" className="text-sm text-text-secondary">
              Include NaN scores
            </label>
          </div>
        </div>

        {/* Metric Filters */}
        {availableMetrics.length > 0 && (
          <div className="mt-4">
            <label className="mb-2 block text-xs font-medium text-text-muted">
              {reportMetricFilters.length > 0
                ? `Filter by Metrics (${reportMetricFilters.length} selected)`
                : 'Filter by Metrics (leave empty for all)'}
            </label>
            <div className="flex flex-wrap gap-2">
              {availableMetrics.map((metric) => {
                const isSelected = reportMetricFilters.includes(metric);
                return (
                  <button
                    key={metric}
                    onClick={() => {
                      if (isSelected) {
                        setReportMetricFilters(reportMetricFilters.filter((m) => m !== metric));
                      } else {
                        setReportMetricFilters([...reportMetricFilters, metric]);
                      }
                    }}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      isSelected
                        ? 'bg-primary text-white'
                        : 'border-border/50 border bg-white text-text-secondary hover:border-primary hover:text-primary'
                    )}
                  >
                    {metric}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Context Fields */}
        <div className="mt-4">
          <label className="mb-2 block text-xs font-medium text-text-muted">
            Include Context Fields
          </label>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_CONTEXT_FIELDS.map((field) => {
              const isSelected = reportContextFields.includes(field);
              return (
                <button
                  key={field}
                  onClick={() => toggleReportContextField(field)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    isSelected
                      ? 'bg-primary text-white'
                      : 'border-border/50 border bg-white text-text-secondary hover:border-primary hover:text-primary'
                  )}
                >
                  {field.replace(/_/g, ' ')}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Result Step Component
type ResultTab = 'report' | 'insights';

interface ResultStepProps {
  isGenerating: boolean;
  thoughts: Thought[];
  report: {
    success: boolean;
    report_text: string;
    issues_analyzed: number;
    metrics_covered: string[];
  } | null;
  insights: InsightResult | null;
  error: string | null;
  thoughtsExpanded: boolean;
  setThoughtsExpanded: (expanded: boolean) => void;
}

function ResultStep({
  isGenerating,
  thoughts,
  report,
  insights,
  error,
  thoughtsExpanded,
  setThoughtsExpanded,
}: ResultStepProps) {
  const [activeTab, setActiveTab] = useState<ResultTab>('report');

  const hasInsights = insights && (insights.patterns.length > 0 || insights.learnings.length > 0);

  return (
    <div className="flex h-full flex-col">
      {/* Thoughts Section (Collapsible) */}
      {(thoughts.length > 0 || isGenerating) && (
        <div className="border-border/50 border-b">
          <button
            onClick={() => setThoughtsExpanded(!thoughtsExpanded)}
            className="flex w-full items-center justify-between px-6 py-3 text-left transition-colors hover:bg-gray-50/50"
          >
            <div className="flex items-center gap-2">
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : error ? (
                <AlertCircle className="h-4 w-4 text-error" />
              ) : (
                <CheckCircle className="h-4 w-4 text-success" />
              )}
              <span className="text-sm font-medium text-text-secondary">
                {isGenerating ? 'Generating...' : error ? 'Error' : 'Generation Complete'}
              </span>
              <span className="text-xs text-text-muted">
                {thoughts.length} step{thoughts.length !== 1 ? 's' : ''}
              </span>
            </div>
            {thoughtsExpanded ? (
              <ChevronUp className="h-4 w-4 text-text-muted" />
            ) : (
              <ChevronDown className="h-4 w-4 text-text-muted" />
            )}
          </button>

          {thoughtsExpanded && (
            <div className="border-border/30 max-h-40 overflow-y-auto border-t bg-gray-50/30 px-6 py-3">
              {thoughts.map((thought, idx) => (
                <ThoughtBubble key={thought.id || idx} thought={thought} />
              ))}
              {isGenerating && thoughts.length === 0 && (
                <div className="flex items-center gap-2 py-2 text-sm text-text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting analysis...
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab Switcher - only show when insights available */}
      {!isGenerating && !error && report?.report_text && hasInsights && (
        <div className="border-border/50 flex items-center gap-1 border-b px-6 py-2">
          {(
            [
              { key: 'report' as const, label: 'Report' },
              { key: 'insights' as const, label: 'Insights' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-primary text-white'
                  : 'text-text-muted hover:bg-gray-100 hover:text-text-primary'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {error ? (
          <div className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="mb-4 h-12 w-12 text-error" />
            <p className="mb-2 text-lg font-medium text-text-primary">Generation Failed</p>
            <p className="text-sm text-text-muted">{error}</p>
          </div>
        ) : report?.report_text ? (
          <>
            {/* Report Tab */}
            {activeTab === 'report' && (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => (
                      <h1 className="mb-4 text-xl font-bold text-text-primary">{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="mb-3 mt-6 text-lg font-semibold text-text-primary">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="mb-2 mt-4 text-base font-semibold text-text-secondary">
                        {children}
                      </h3>
                    ),
                    h4: ({ children }) => (
                      <h4 className="mb-1 mt-3 text-sm font-semibold text-text-secondary">
                        {children}
                      </h4>
                    ),
                    p: ({ children }) => (
                      <p className="mb-3 text-sm leading-relaxed text-text-secondary">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="mb-3 ml-4 list-disc space-y-1 text-sm text-text-secondary">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="mb-3 ml-4 list-decimal space-y-1 text-sm text-text-secondary">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => <li className="ml-2">{children}</li>,
                    strong: ({ children }) => (
                      <strong className="font-semibold text-text-primary">{children}</strong>
                    ),
                    code: ({ children }) => (
                      <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-primary-dark">
                        {children}
                      </code>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-primary/30 pl-4 italic text-text-muted">
                        {children}
                      </blockquote>
                    ),
                    table: ({ children }) => (
                      <div className="my-3 overflow-x-auto rounded-lg border border-border">
                        <table className="w-full text-sm">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="border-b border-border bg-gray-50">{children}</thead>
                    ),
                    th: ({ children }) => (
                      <th className="px-3 py-2 text-left text-xs font-semibold text-text-primary">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="border-border/50 border-t px-3 py-2 text-text-secondary">
                        {children}
                      </td>
                    ),
                  }}
                >
                  {report.report_text}
                </ReactMarkdown>

                {/* Report Stats */}
                <div className="mt-6 rounded-lg bg-gray-50/80 p-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
                    Report Statistics
                  </p>
                  <div
                    className={cn(
                      'grid gap-4 text-sm',
                      hasInsights ? 'grid-cols-4' : 'grid-cols-3'
                    )}
                  >
                    <div>
                      <span className="text-text-muted">Issues Analyzed</span>
                      <p className="font-medium text-text-primary">{report.issues_analyzed}</p>
                    </div>
                    <div>
                      <span className="text-text-muted">Metrics Covered</span>
                      <p className="font-medium text-text-primary">
                        {report.metrics_covered.length}
                      </p>
                    </div>
                    <div>
                      <span className="text-text-muted">Report Length</span>
                      <p className="font-medium text-text-primary">
                        {report.report_text.length.toLocaleString()} chars
                      </p>
                    </div>
                    {hasInsights && (
                      <div>
                        <span className="text-text-muted">Patterns Found</span>
                        <p className="font-medium text-text-primary">{insights.patterns.length}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Insights Tab */}
            {activeTab === 'insights' && hasInsights && (
              <InsightPatternsPanel insights={insights} />
            )}
          </>
        ) : isGenerating ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="mb-4 h-12 w-12 animate-spin text-primary" />
            <p className="text-lg font-medium text-text-primary">Generating Report</p>
            <p className="text-sm text-text-muted">This may take a moment...</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
