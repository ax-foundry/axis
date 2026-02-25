'use client';

import { AlertCircle, Bot, Clock, Search, Sparkles, Tag } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';

import { getAgentConfig } from '@/config/agents';
import { useReplayStatus, useSearchTraces } from '@/lib/hooks/useReplayData';
import { cn } from '@/lib/utils';

import type { TraceSummary } from '@/types/replay';

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
  const { data: statusData } = useReplayStatus();
  const { data, isLoading, error } = useSearchTraces(submittedQuery, agent, searchBy);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchFields = useMemo(() => {
    if (agent && statusData?.agent_search_fields?.[agent]) {
      return statusData.agent_search_fields[agent];
    }
    return statusData?.search_fields ?? [];
  }, [agent, statusData]);

  // Reset searchBy when agent changes (available fields may differ)
  useEffect(() => {
    setSearchBy('trace_id');
    setSubmittedQuery('');
  }, [agent]);

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

  const handleTraceClick = (trace: TraceSummary) => {
    onSelect(trace.id);
  };

  const hasResults = submittedQuery && !isLoading && !error && data && data.traces.length > 0;

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/* Hero area — only before first search */}
      {!submittedQuery && (
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
            'relative flex items-center overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-200',
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
                : 'cursor-not-allowed bg-gray-100 text-text-muted'
            )}
          >
            Search
          </button>
        </div>
      </form>

      {/* Hint chips — only before first search */}
      {!submittedQuery && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {[
            { label: 'Trace ID', example: 'a5e89ce1...', icon: '🔗' },
            ...searchFields
              .filter((f) => f.value !== 'trace_id')
              .slice(0, 2)
              .map((f) => ({ label: f.label, example: 'ABC-12345...', icon: '📋' })),
          ].map((chip) => (
            <button
              key={chip.label}
              onClick={() => inputRef.current?.focus()}
              className="flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-xs text-text-secondary shadow-sm transition-all hover:border-primary/30 hover:bg-primary/5 hover:shadow-md"
            >
              <span>{chip.icon}</span>
              <span className="font-medium">{chip.label}</span>
              <span className="font-mono text-text-muted">{chip.example}</span>
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {submittedQuery && isLoading && (
        <div className="mt-10 flex flex-col items-center gap-3">
          <div className="relative">
            <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
          </div>
          <span className="text-sm text-text-muted">Searching Langfuse...</span>
        </div>
      )}

      {/* Error */}
      {submittedQuery && error && (
        <div className="mt-6 flex w-full max-w-2xl items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error instanceof Error ? error.message : 'Failed to search traces'}</span>
        </div>
      )}

      {/* No results */}
      {submittedQuery && !isLoading && !error && data && data.traces.length === 0 && (
        <div className="mt-10 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <Search className="h-5 w-5 text-text-muted" />
          </div>
          <p className="text-sm text-text-muted">
            No traces found for &ldquo;{submittedQuery}&rdquo;
          </p>
        </div>
      )}

      {/* Search results */}
      {hasResults && (
        <div className="mt-6 w-full max-w-2xl">
          <div className="mb-3 flex items-center gap-2 px-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {data.total} {data.total === 1 ? 'result' : 'results'}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-2">
            {data.traces.map((trace) => {
              const agentConfig = trace.name ? getAgentConfig(trace.name) : undefined;
              return (
                <button
                  key={trace.id}
                  onClick={() => handleTraceClick(trace)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-border bg-white px-5 py-4 text-left shadow-sm transition-all duration-150 hover:border-primary/30 hover:bg-gradient-to-r hover:from-primary/5 hover:to-transparent hover:shadow-md"
                >
                  {/* Agent avatar */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 transition-colors group-hover:from-primary/25 group-hover:to-primary/10">
                    {agentConfig?.avatar ? (
                      <Image
                        src={agentConfig.avatar}
                        alt={agentConfig.label}
                        width={24}
                        height={24}
                        className="rounded-lg"
                      />
                    ) : (
                      <Bot className="h-5 w-5 text-primary" />
                    )}
                  </div>

                  {/* Main content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-text-primary">
                        {trace.name || 'unnamed'}
                      </span>
                      <code className="bg-primary/8 shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] font-medium text-primary">
                        {trace.id.slice(0, 10)}
                      </code>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-text-muted">
                      <span>{trace.step_count} steps</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(trace.timestamp)}
                      </span>
                    </div>
                  </div>

                  {/* Tags */}
                  {trace.tags.length > 0 && (
                    <div className="flex shrink-0 gap-1.5">
                      {trace.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-medium text-text-muted transition-colors group-hover:bg-primary/10 group-hover:text-primary"
                        >
                          <Tag className="h-2.5 w-2.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
