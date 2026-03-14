'use client';

import { ArrowDown, ArrowUp, Clock, Equal, Sparkles } from 'lucide-react';

import { OutputViewer } from '@/components/agent-replay/OutputViewer';
import { cn } from '@/lib/utils';

import { DiffHighlighter } from './DiffHighlighter';

import type { SimulateResponse } from '@/types/replay';

interface SimulationResultsProps {
  result: SimulateResponse;
}

function formatMs(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function SimulationResults({ result }: SimulationResultsProps) {
  const hasDiff = result.output_changed;

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {/* Two output panes sharing available height */}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {/* Original output (frozen) */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-gray-50 dark:bg-gray-900/60">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Original
            </span>
            {result.original_model && (
              <span className="rounded-full bg-gray-200/80 px-2 py-0.5 text-[10px] text-text-muted">
                {result.original_model}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {result.original_usage && result.original_usage.total > 0 && (
                <span className="text-[10px] text-text-muted">
                  {formatTokens(result.original_usage.total)} tokens
                </span>
              )}
              {result.original_latency_ms != null && (
                <span className="flex items-center gap-0.5 text-[10px] text-text-muted">
                  <Clock className="h-2.5 w-2.5" />
                  {formatMs(result.original_latency_ms)}
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 text-xs leading-relaxed">
            <OutputViewer content={result.original_output} />
          </div>
        </div>

        {/* Simulated output */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border-2 border-primary/20 bg-surface shadow-sm shadow-primary/5">
          <div className="flex shrink-0 items-center gap-2 border-b border-primary/10 bg-primary/[0.03] px-3 py-2">
            <div className="flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                Simulated
              </span>
            </div>
            {result.simulated_model && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary-dark">
                {result.simulated_model}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {result.simulated_usage && result.simulated_usage.total > 0 && (
                <span className="text-[10px] font-medium text-text-primary">
                  {formatTokens(result.simulated_usage.total)} tokens
                </span>
              )}
              {result.simulated_latency_ms != null && (
                <span className="flex items-center gap-0.5 text-[10px] font-medium text-text-primary">
                  <Clock className="h-2.5 w-2.5" />
                  {formatMs(result.simulated_latency_ms)}
                </span>
              )}

              {/* Token delta badge */}
              {result.token_delta !== 0 && (
                <span
                  className={cn(
                    'flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold',
                    result.token_delta > 0
                      ? 'bg-red-50 text-red-600'
                      : 'bg-emerald-50 text-emerald-600'
                  )}
                >
                  {result.token_delta > 0 ? (
                    <ArrowUp className="h-2.5 w-2.5" />
                  ) : (
                    <ArrowDown className="h-2.5 w-2.5" />
                  )}
                  {result.token_delta > 0 ? '+' : ''}
                  {result.token_delta}
                </span>
              )}
              {result.token_delta === 0 && !result.output_changed && (
                <span className="flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  <Equal className="h-2.5 w-2.5" />
                  No change
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 text-xs leading-relaxed">
            <OutputViewer content={result.simulated_output} />
          </div>
        </div>
      </div>

      {/* Diff highlights — collapsible at bottom */}
      {hasDiff && (
        <div className="shrink-0">
          <DiffHighlighter original={result.original_output} simulated={result.simulated_output} />
        </div>
      )}
    </div>
  );
}
