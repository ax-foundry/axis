'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Bot,
  ChevronDown,
  Clock,
  DollarSign,
  Eye,
  FileInput,
  FileOutput,
  History,
  Loader2,
  Search,
  Sparkles,
  Tag,
  Timer,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { getAgentConfig } from '@/config/agents';
import { getTraceDetail } from '@/lib/api/replay-api';
import { useRecentTraces, useReplayStatus, useSearchTraces } from '@/lib/hooks/useReplayData';
import { cn } from '@/lib/utils';

import { OutputViewer } from './OutputViewer';
import { PromptViewer } from './PromptViewer';

import type { TraceDetail, TraceSummary } from '@/types/replay';

function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) return '';
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatLatency(s: number): string {
  if (s >= 60) return `${(s / 60).toFixed(1)}m`;
  return `${s.toFixed(1)}s`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

// ── Quick Look Modal ───────────────────────────────────────────────────

/** Check if an object is a simple flat dict (all values are primitives). */
function isSimpleDict(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  return Object.values(obj as Record<string, unknown>).every(
    (v) => v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
  );
}

/** Render a simple dict as a clean key-value table. */
function KeyValueTable({
  data,
  accent,
}: {
  data: Record<string, unknown>;
  accent: 'blue' | 'emerald';
}) {
  const accentColor = accent === 'blue' ? 'text-blue-600' : 'text-emerald-600';
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-xs">
        <tbody>
          {Object.entries(data).map(([key, value]) => (
            <tr key={key} className="border-border/50 border-b last:border-0">
              <td
                className={cn(
                  'whitespace-nowrap px-3 py-2 font-mono text-[11px] font-medium',
                  accentColor
                )}
              >
                {key}
              </td>
              <td className="break-all px-3 py-2 text-text-primary">
                {value === null ? (
                  <span className="italic text-text-muted">null</span>
                ) : typeof value === 'boolean' ? (
                  <span className={value ? 'text-emerald-600' : 'text-text-muted'}>
                    {String(value)}
                  </span>
                ) : (
                  String(value)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuickLookModal({
  trace,
  agent,
  onClose,
  onLoadTrace,
}: {
  trace: TraceSummary;
  agent?: string | null;
  onClose: () => void;
  onLoadTrace: () => void;
}) {
  const queryClient = useQueryClient();
  const [detail, setDetail] = useState<TraceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    queryClient
      .fetchQuery({
        queryKey: ['trace-detail', trace.id, agent],
        queryFn: () => getTraceDetail(trace.id, undefined, agent),
        staleTime: 5 * 60_000,
      })
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trace.id, agent, queryClient]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const agentConfig = trace.name ? getAgentConfig(trace.name) : undefined;
  const outcome = trace.output_preview?.outcome ?? trace.output_preview?.workflow_status ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative mx-4 flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-border bg-gradient-to-r from-primary/[0.04] to-transparent px-5 py-3.5">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
              {agentConfig?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={agentConfig.avatar}
                  alt={agentConfig.label}
                  className="h-6 w-6 rounded-lg"
                />
              ) : (
                <Bot className="h-5 w-5 text-primary" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-text-primary">{trace.name || 'Trace'}</h3>
                {outcome && (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      outcome === 'completed' || outcome === 'finalized'
                        ? 'bg-emerald-100 text-emerald-700'
                        : outcome === 'failed' || outcome === 'error'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-text-muted'
                    )}
                  >
                    {outcome}
                  </span>
                )}
              </div>
              <code className="text-[10px] text-text-muted">{trace.id}</code>
            </div>

            <button
              onClick={onLoadTrace}
              className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-primary-dark hover:shadow-md"
            >
              Open Full Trace
            </button>
            <button
              onClick={onClose}
              className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Stats bar */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted">
            {trace.session_id && (
              <span className="font-mono">
                <span className="text-text-muted/60">session:</span> {trace.session_id}
              </span>
            )}
            {trace.latency_s != null && (
              <span className="flex items-center gap-1">
                <Timer className="h-3 w-3" /> {formatLatency(trace.latency_s)}
              </span>
            )}
            {trace.total_cost != null && trace.total_cost > 0 && (
              <span className="flex items-center gap-1 text-accent-gold">
                <DollarSign className="h-3 w-3" /> {formatCost(trace.total_cost)}
              </span>
            )}
            {trace.tags.length > 0 && (
              <span className="flex items-center gap-1.5">
                {trace.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                  >
                    {tag}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-sm text-text-muted">Loading trace data...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 px-5 py-8 text-sm text-red-600">
              <AlertCircle className="h-5 w-5 shrink-0" />
              {error}
            </div>
          )}

          {detail && (
            <div className="grid grid-cols-1 lg:grid-cols-2">
              {/* Input pane */}
              <div className="border-b border-border lg:border-b-0 lg:border-r">
                <div className="border-border/50 flex items-center gap-1.5 border-b px-4 py-2">
                  <FileInput className="h-3.5 w-3.5 text-blue-500" />
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                    Input
                  </h4>
                </div>
                <div className="max-h-[55vh] overflow-y-auto px-4 py-3 text-xs">
                  {detail.trace_input == null ? (
                    <span className="italic text-text-muted">No input</span>
                  ) : isSimpleDict(detail.trace_input) ? (
                    <KeyValueTable
                      data={detail.trace_input as Record<string, unknown>}
                      accent="blue"
                    />
                  ) : (
                    <PromptViewer content={detail.trace_input} />
                  )}
                </div>
              </div>

              {/* Output pane */}
              <div>
                <div className="border-border/50 flex items-center gap-1.5 border-b px-4 py-2">
                  <FileOutput className="h-3.5 w-3.5 text-emerald-500" />
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                    Output
                  </h4>
                </div>
                <div className="max-h-[55vh] overflow-y-auto px-4 py-3 text-xs">
                  {detail.trace_output == null ? (
                    <span className="italic text-text-muted">No output</span>
                  ) : isSimpleDict(detail.trace_output) ? (
                    <KeyValueTable
                      data={detail.trace_output as Record<string, unknown>}
                      accent="emerald"
                    />
                  ) : (
                    <OutputViewer content={detail.trace_output} />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Trace Card ─────────────────────────────────────────────────────────

function TraceCard({
  trace,
  agent,
  onClick,
}: {
  trace: TraceSummary;
  agent?: string | null;
  onClick: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [quickLook, setQuickLook] = useState(false);
  const agentConfig = trace.name ? getAgentConfig(trace.name) : undefined;
  const outcome = trace.output_preview?.outcome ?? trace.output_preview?.workflow_status ?? null;
  const previewEntries = trace.input_preview
    ? Object.entries(trace.input_preview).filter(([, v]) => v && v !== 'False' && v !== 'None')
    : [];
  const hasDetails =
    trace.latency_s != null ||
    (trace.total_cost != null && trace.total_cost > 0) ||
    previewEntries.length > 0 ||
    trace.tags.length > 0;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
      {/* Main row — clickable to load trace */}
      <button
        onClick={onClick}
        className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/[0.03]"
      >
        {/* Avatar */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 transition-colors group-hover:from-primary/25 group-hover:to-primary/10">
          {agentConfig?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agentConfig.avatar} alt={agentConfig.label} className="h-5 w-5 rounded-md" />
          ) : (
            <Bot className="h-4 w-4 text-primary" />
          )}
        </div>

        {/* Core info */}
        <div className="min-w-0 flex-1">
          {/* Name + outcome */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">
              {trace.name || 'unnamed'}
            </span>
            {outcome && (
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  outcome === 'completed' || outcome === 'finalized'
                    ? 'bg-emerald-100 text-emerald-700'
                    : outcome === 'failed' || outcome === 'error'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-text-muted'
                )}
              >
                {outcome}
              </span>
            )}
            <span className="ml-auto flex items-center gap-1 text-[11px] text-text-muted">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(trace.timestamp)}
            </span>
          </div>

          {/* Full trace ID + session ID */}
          <div className="mt-1 flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 font-mono text-[10px]">
              <span className="text-text-muted">trace:</span>
              <span className="text-primary">{trace.id}</span>
            </div>
            {trace.session_id && (
              <div className="flex items-center gap-1.5 font-mono text-[10px]">
                <span className="text-text-muted">session:</span>
                <span className="text-text-secondary">{trace.session_id}</span>
              </div>
            )}
          </div>
        </div>
      </button>

      {/* Expand toggle */}
      {hasDetails && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="border-border/50 text-text-muted/60 flex w-full items-center justify-center gap-1 border-t py-1 text-[10px] transition-colors hover:bg-primary/[0.03] hover:text-text-muted"
        >
          <ChevronDown
            className={cn('h-3 w-3 transition-transform', expanded ? 'rotate-180' : '')}
          />
          {expanded ? 'less' : 'more'}
        </button>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="border-border/50 border-t bg-gray-50/50 px-4 py-2.5 dark:bg-gray-900/30">
          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted">
            {trace.latency_s != null && (
              <span className="flex items-center gap-1">
                <Timer className="h-3 w-3" />
                {formatLatency(trace.latency_s)}
              </span>
            )}
            {trace.total_cost != null && trace.total_cost > 0 && (
              <span className="flex items-center gap-1 text-accent-gold">
                <DollarSign className="h-3 w-3" />
                {formatCost(trace.total_cost)}
              </span>
            )}
          </div>

          {/* Tags */}
          {trace.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {trace.tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-text-muted dark:bg-gray-800"
                >
                  <Tag className="h-2.5 w-2.5" />
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Input preview */}
          {previewEntries.length > 0 && (
            <div className="mt-2">
              <span className="text-text-muted/60 text-[9px] font-semibold uppercase tracking-wider">
                Input
              </span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {previewEntries.map(([key, value]) => (
                  <span
                    key={key}
                    className="rounded bg-white px-1.5 py-0.5 text-[10px] text-text-muted shadow-sm dark:bg-gray-800"
                  >
                    <span className="font-medium text-text-secondary">{key}:</span>{' '}
                    {value.length > 50 ? value.slice(0, 50) + '...' : value}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Output preview */}
          {trace.output_preview && Object.keys(trace.output_preview).length > 0 && (
            <div className="mt-2">
              <span className="text-text-muted/60 text-[9px] font-semibold uppercase tracking-wider">
                Output
              </span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {Object.entries(trace.output_preview).map(([key, value]) => (
                  <span
                    key={key}
                    className="rounded bg-white px-1.5 py-0.5 text-[10px] text-text-muted shadow-sm dark:bg-gray-800"
                  >
                    <span className="font-medium text-text-secondary">{key}:</span>{' '}
                    {value.length > 50 ? value.slice(0, 50) + '...' : value}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Quick Look button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setQuickLook(true);
            }}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-primary/20 bg-white px-3 py-1.5 text-[11px] font-medium text-primary shadow-sm transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-md dark:bg-gray-800"
          >
            <Eye className="h-3 w-3" />
            Quick Look — Full I/O
          </button>
        </div>
      )}

      {/* Quick Look modal */}
      {quickLook && (
        <QuickLookModal
          trace={trace}
          agent={agent}
          onClose={() => setQuickLook(false)}
          onLoadTrace={() => {
            setQuickLook(false);
            onClick();
          }}
        />
      )}
    </div>
  );
}

interface TracePickerProps {
  onSelect: (traceId: string) => void;
  agent?: string | null;
  className?: string;
}

export function TracePicker({ onSelect, agent, className }: TracePickerProps) {
  const [inputValue, setInputValue] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [searchBy, setSearchBy] = useState<string>('trace_id');
  const [showRecent, setShowRecent] = useState(false);
  const [recentLimit, setRecentLimit] = useState(20);
  const [recentName, setRecentName] = useState<string>('');
  const { data: statusData } = useReplayStatus();
  const { data, isLoading, error } = useSearchTraces(submittedQuery, agent, searchBy);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchFields = useMemo(() => {
    if (agent && statusData?.agent_search_fields?.[agent]) {
      return statusData.agent_search_fields[agent];
    }
    return statusData?.search_fields ?? [];
  }, [agent, statusData]);

  const traceNameOptions = useMemo(() => {
    if (agent && statusData?.agent_recent_trace_names?.[agent]) {
      return statusData.agent_recent_trace_names[agent];
    }
    return statusData?.recent_trace_names ?? [];
  }, [agent, statusData]);

  // Resolve effective name: user selection, or first configured option as default
  const effectiveName = recentName || (traceNameOptions.length > 0 ? traceNameOptions[0] : '');

  const {
    data: recentData,
    isLoading: recentLoading,
    error: recentError,
  } = useRecentTraces(
    showRecent ? { limit: recentLimit, agent, name: effectiveName || undefined } : undefined
  );

  // Reset searchBy when agent changes (available fields may differ)
  useEffect(() => {
    setSearchBy('trace_id');
    setSubmittedQuery('');
    setShowRecent(false);
    setRecentName('');
  }, [agent]);

  // When user submits a search, hide recent
  useEffect(() => {
    if (submittedQuery) setShowRecent(false);
  }, [submittedQuery]);

  const showDropdown = searchFields.length > 1;
  const activeField = searchFields.find((f) => f.value === searchBy);
  const placeholder =
    searchBy !== 'trace_id' && activeField
      ? `Enter ${activeField.label.toLowerCase()}...`
      : 'Paste a trace ID...';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed) {
      setSubmittedQuery(trimmed);
    }
  };

  const handleShowRecent = () => {
    setSubmittedQuery('');
    setShowRecent(true);
  };

  const hasResults = submittedQuery && !isLoading && !error && data && data.traces.length > 0;
  const hasRecent =
    showRecent && !recentLoading && !recentError && recentData && recentData.traces.length > 0;

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/* Hero area — only before first search or recent */}
      {!submittedQuery && !showRecent && (
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-emerald-100/50">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <h2 className="mb-2 text-2xl font-semibold tracking-tight text-text-primary">
            Replay an agent trace
          </h2>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-text-muted">
            Search by business field or paste a Langfuse trace ID to step through the full
            observation hierarchy.
          </p>
        </div>
      )}

      {/* Search input — pill-shaped, elevated */}
      <form onSubmit={handleSubmit} className="w-full max-w-2xl">
        <div
          className={cn(
            'relative flex items-center overflow-hidden rounded-2xl border bg-surface shadow-sm transition-all duration-200',
            isFocused
              ? 'border-primary/40 shadow-lg shadow-primary/10 ring-2 ring-primary/15'
              : 'border-border hover:border-gray-300 hover:shadow-md'
          )}
        >
          {showDropdown && (
            <select
              value={searchBy}
              onChange={(e) => {
                setSearchBy(e.target.value);
                setSubmittedQuery('');
              }}
              className="border-r border-border bg-transparent px-3 py-4 text-sm text-text-secondary focus:outline-none"
            >
              {searchFields.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          )}
          <Search
            className={cn(
              'h-[18px] w-[18px] shrink-0 text-text-muted',
              showDropdown ? 'ml-3' : 'ml-4'
            )}
          />
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            className="placeholder:text-text-muted/60 flex-1 bg-transparent px-3 py-4 text-[15px] text-text-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className={cn(
              'mr-2 flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200',
              inputValue.trim()
                ? 'bg-primary text-white shadow-sm hover:bg-primary-dark hover:shadow-md active:scale-[0.97]'
                : 'cursor-not-allowed bg-gray-100 text-text-muted dark:bg-gray-800'
            )}
          >
            Search
          </button>
        </div>
      </form>

      {/* Recent traces button — only before first search */}
      {!submittedQuery && !showRecent && (
        <div className="mt-5">
          <div className="inline-flex items-center overflow-hidden rounded-full border border-primary/20 bg-primary/5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
            <button
              onClick={handleShowRecent}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <History className="h-3.5 w-3.5" />
              Recent Traces
            </button>
            <span className="h-4 w-px bg-primary/15" />
            {traceNameOptions.length > 0 && (
              <>
                <select
                  value={effectiveName}
                  onChange={(e) => setRecentName(e.target.value)}
                  className="appearance-none border-none bg-transparent py-2 pl-2.5 pr-1 text-xs font-medium text-primary focus:outline-none"
                  style={{ backgroundImage: 'none' }}
                >
                  {traceNameOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option value="">All</option>
                </select>
                <span className="h-4 w-px bg-primary/15" />
              </>
            )}
            <select
              value={recentLimit}
              onChange={(e) => setRecentLimit(Number(e.target.value))}
              className="appearance-none bg-transparent py-2 pl-2.5 pr-6 text-xs font-medium text-primary focus:outline-none"
              style={{ backgroundImage: 'none' }}
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Loading (search) */}
      {submittedQuery && isLoading && (
        <div className="mt-10 flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
          <span className="text-sm text-text-muted">Searching Langfuse...</span>
        </div>
      )}

      {/* Loading (recent) */}
      {showRecent && recentLoading && (
        <div className="mt-10 flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
          <span className="text-sm text-text-muted">Loading recent traces...</span>
        </div>
      )}

      {/* Error (search) */}
      {submittedQuery && error && (
        <div className="mt-6 flex w-full max-w-2xl items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error instanceof Error ? error.message : 'Failed to search traces'}</span>
        </div>
      )}

      {/* Error (recent) */}
      {showRecent && recentError && (
        <div className="mt-6 flex w-full max-w-2xl items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>
            {recentError instanceof Error ? recentError.message : 'Failed to load recent traces'}
          </span>
        </div>
      )}

      {/* No results (search) */}
      {submittedQuery && !isLoading && !error && data && data.traces.length === 0 && (
        <div className="mt-10 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <Search className="h-5 w-5 text-text-muted" />
          </div>
          <p className="text-sm text-text-muted">
            No traces found for &ldquo;{submittedQuery}&rdquo;
          </p>
        </div>
      )}

      {/* No results (recent) */}
      {showRecent &&
        !recentLoading &&
        !recentError &&
        recentData &&
        recentData.traces.length === 0 && (
          <div className="mt-10 text-center">
            <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <History className="h-5 w-5 text-text-muted" />
            </div>
            <p className="text-sm text-text-muted">No recent traces found</p>
          </div>
        )}

      {/* Search results */}
      {hasResults && (
        <div className="mt-6 w-full max-w-2xl">
          <div className="mb-3 flex items-center gap-2 px-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {data.total}{' '}
              {searchBy === 'session_id'
                ? data.total === 1
                  ? 'trace in session'
                  : 'traces in session'
                : data.total === 1
                  ? 'result'
                  : 'results'}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-2">
            {data.traces.map((trace) => (
              <TraceCard
                key={trace.id}
                trace={trace}
                agent={agent}
                onClick={() => onSelect(trace.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent traces */}
      {hasRecent && (
        <div className="mt-6 w-full max-w-2xl">
          <div className="mb-3 flex items-center gap-2 px-1">
            <History className="h-3.5 w-3.5 text-text-muted" />
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {recentData.total} recent {recentData.total === 1 ? 'trace' : 'traces'}
            </span>
            <div className="h-px flex-1 bg-border" />
            {traceNameOptions.length > 0 && (
              <select
                value={recentName}
                onChange={(e) => setRecentName(e.target.value)}
                className="rounded border border-border bg-surface px-2 py-0.5 text-[10px] text-text-muted focus:border-primary/40 focus:outline-none"
              >
                {traceNameOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value="">All names</option>
              </select>
            )}
            <select
              value={recentLimit}
              onChange={(e) => setRecentLimit(Number(e.target.value))}
              className="rounded border border-border bg-surface px-2 py-0.5 text-[10px] text-text-muted focus:border-primary/40 focus:outline-none"
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  Show {n}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            {recentData.traces.map((trace) => (
              <TraceCard
                key={trace.id}
                trace={trace}
                agent={agent}
                onClick={() => onSelect(trace.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
