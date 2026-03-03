'use client';

import { ArrowDown, ArrowUp, Clock, Equal } from 'lucide-react';

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
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {/* Original output (frozen) */}
      <div className="rounded-lg border border-border bg-gray-50/80">
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">
            Original
          </span>
          {result.original_model && (
            <span className="rounded-full bg-gray-200 px-2 py-px text-[10px] text-text-muted">
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
        <div className="max-h-[250px] overflow-y-auto px-3 py-2 text-xs">
          <OutputViewer content={result.original_output} />
        </div>
      </div>

      {/* Simulated output */}
      <div className="rounded-lg border border-border bg-white">
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600">
            Simulated
          </span>
          {result.simulated_model && (
            <span className="rounded-full bg-amber-100 px-2 py-px text-[10px] text-amber-700">
              {result.simulated_model}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {result.simulated_usage && result.simulated_usage.total > 0 && (
              <span className="text-[10px] text-text-primary">
                {formatTokens(result.simulated_usage.total)} tokens
              </span>
            )}
            {result.simulated_latency_ms != null && (
              <span className="flex items-center gap-0.5 text-[10px] text-text-primary">
                <Clock className="h-2.5 w-2.5" />
                {formatMs(result.simulated_latency_ms)}
              </span>
            )}

            {/* Token delta badge */}
            {result.token_delta !== 0 && (
              <span
                className={cn(
                  'flex items-center gap-0.5 rounded-full px-2 py-px text-[10px] font-semibold',
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
              <span className="flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-px text-[10px] text-text-muted">
                <Equal className="h-2.5 w-2.5" />
                No change
              </span>
            )}
          </div>
        </div>
        <div className="max-h-[250px] overflow-y-auto px-3 py-2 text-xs">
          <OutputViewer content={result.simulated_output} />
        </div>
      </div>

      {/* Diff highlights */}
      {result.output_changed && (
        <DiffHighlighter original={result.original_output} simulated={result.simulated_output} />
      )}
    </div>
  );
}
