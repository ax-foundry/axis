'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ChevronDown,
  Clock,
  Cpu,
  Expand,
  FileInput,
  FileOutput,
  Info,
  Layers,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';

import { getNodeDetail } from '@/lib/api/replay-api';
import { cn } from '@/lib/utils';

import { OutputViewer } from './OutputViewer';
import { PromptViewer } from './PromptViewer';

import type { ObservationNodeData, TraceDetail } from '@/types/replay';

const TYPE_BADGE: Record<string, { bg: string; text: string; Icon: typeof Layers }> = {
  SPAN: { bg: 'bg-indigo-100', text: 'text-indigo-700', Icon: Layers },
  GENERATION: { bg: 'bg-emerald-100', text: 'text-emerald-700', Icon: Cpu },
  TOOL: { bg: 'bg-amber-100', text: 'text-amber-700', Icon: Wrench },
  EVENT: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600', Icon: Activity },
};

function getTypeBadge(type: string | null) {
  if (!type) return TYPE_BADGE.SPAN;
  return TYPE_BADGE[type.toUpperCase()] || TYPE_BADGE.SPAN;
}

function formatMs(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function cleanName(name: string | null, type: string | null): string {
  if (!name) return type?.toLowerCase() || 'node';
  return name.replace(/:ai\.generateText$/, '').replace(/^\.\.\./, '');
}

interface NodeDetailPanelProps {
  node: ObservationNodeData;
  traceId: string;
  agent?: string | null;
  className?: string;
}

export function NodeDetailPanel({ node, traceId, agent, className }: NodeDetailPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [fullNode, setFullNode] = useState<ObservationNodeData | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const queryClient = useQueryClient();

  const activeNode = fullNode?.id === node.id ? fullNode : node;
  const hasTruncated = (node.input_truncated || node.output_truncated) && !fullNode;

  const badge = getTypeBadge(activeNode.type);
  const BadgeIcon = badge.Icon;
  const displayName = cleanName(activeNode.name, activeNode.type);

  const handleShowFull = async () => {
    setLoadingFull(true);
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ['node-detail', traceId, node.id, agent],
        queryFn: () => getNodeDetail(traceId, node.id, agent),
        staleTime: 5 * 60_000,
      });
      setFullNode(data);
    } catch {
      // silently fail — user can retry
    } finally {
      setLoadingFull(false);
    }
  };

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-xl border-2 border-primary/20 bg-surface shadow-lg shadow-primary/5',
        className
      )}
    >
      {/* Header bar */}
      <div className="bg-gradient-to-r from-primary to-primary-dark px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Type badge */}
          <span
            className={cn(
              'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase shadow-sm',
              badge.bg,
              badge.text
            )}
          >
            <BadgeIcon className="h-2.5 w-2.5" />
            {activeNode.type || 'SPAN'}
          </span>

          {/* Node name */}
          <h3 className="text-xs font-bold text-white">{displayName}</h3>

          {/* Metadata chips */}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {activeNode.model && (
              <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white/95 backdrop-blur-sm">
                <Cpu className="h-2.5 w-2.5" />
                {activeNode.model}
              </span>
            )}
            {activeNode.latency_ms != null && (
              <span className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/85">
                <Clock className="h-2.5 w-2.5" />
                {formatMs(activeNode.latency_ms)}
              </span>
            )}
            {activeNode.usage && activeNode.usage.total > 0 && (
              <span className="rounded-full bg-accent-gold/30 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                {activeNode.usage.input.toLocaleString()} in |{' '}
                {activeNode.usage.output.toLocaleString()} out
              </span>
            )}
            {hasTruncated && (
              <button
                onClick={handleShowFull}
                disabled={loadingFull}
                className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-white/30 disabled:opacity-50"
              >
                <Expand className="h-2.5 w-2.5" />
                {loadingFull ? 'Loading...' : 'Show full'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Split pane: Input | Output */}
      <div className="replay-compact grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[35%_1fr]">
        {/* Input pane */}
        <div className="min-w-0 border-b border-primary/10 lg:border-b-0 lg:border-r lg:border-r-primary/10">
          <div className="flex items-center gap-1.5 border-b border-primary/10 bg-surface px-3 py-1.5">
            <FileInput className="h-3 w-3 text-blue-500" />
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Input</h4>
          </div>
          <div className="max-h-[calc(100vh-280px)] overflow-y-auto break-words px-3 py-2 text-xs">
            <PromptViewer content={activeNode.input} />
          </div>
        </div>

        {/* Output pane */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 border-b border-primary/10 bg-surface px-3 py-1.5">
            <FileOutput className="h-3 w-3 text-emerald-500" />
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
              Output
            </h4>
          </div>
          <div className="max-h-[calc(100vh-280px)] overflow-y-auto break-words px-3 py-2 text-xs">
            <OutputViewer content={activeNode.output} />
          </div>
        </div>
      </div>

      {/* Collapsible details drawer */}
      <div className="border-t border-primary/10 ">
        <button
          onClick={() => setDetailsOpen(!detailsOpen)}
          className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors hover:bg-primary/[0.04]"
        >
          <ChevronDown
            className={cn(
              'h-3 w-3 text-primary/50 transition-transform',
              !detailsOpen && '-rotate-90'
            )}
          />
          <Info className="h-3 w-3 text-primary/50" />
          <span className="font-medium text-text-secondary">Details</span>
          {activeNode.usage && activeNode.usage.total > 0 && (
            <span className="ml-1 text-primary/50">
              — {activeNode.usage.input.toLocaleString()} in /{' '}
              {activeNode.usage.output.toLocaleString()} out tokens
            </span>
          )}
        </button>
        {detailsOpen && (
          <div className="border-t border-primary/10 bg-surface px-3 py-3">
            <NodeDetailsPane node={activeNode} />
          </div>
        )}
      </div>
    </div>
  );
}

function NodeDetailsPane({ node }: { node: ObservationNodeData }) {
  return (
    <div className="space-y-3">
      {/* Node info */}
      <div className="overflow-hidden rounded-lg border border-primary/15 shadow-sm">
        <div className="border-b border-primary/10 bg-surface px-3 py-1.5">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-primary-dark/60">
            Node Info
          </h4>
        </div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-2 px-3 py-2 text-xs sm:grid-cols-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
              Type
            </div>
            <div className="mt-px font-semibold text-text-primary">{node.type || '—'}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
              Model
            </div>
            <div className="mt-px font-semibold text-text-primary">{node.model || '—'}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
              Latency
            </div>
            <div className="mt-px font-semibold text-text-primary">
              {node.latency_ms != null ? formatMs(node.latency_ms) : '—'}
            </div>
          </div>
          {node.usage && node.usage.total > 0 && (
            <>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  Input Tokens
                </div>
                <div className="mt-px font-semibold text-blue-600">
                  {node.usage.input.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  Output Tokens
                </div>
                <div className="mt-px font-semibold text-emerald-600">
                  {node.usage.output.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  Total Tokens
                </div>
                <div className="mt-px font-semibold text-primary">
                  {node.usage.total.toLocaleString()}
                </div>
              </div>
            </>
          )}
          {node.start_time && (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                Start Time
              </div>
              <div className="mt-px font-mono text-[10px] text-text-secondary">
                {node.start_time}
              </div>
            </div>
          )}
          {node.end_time && (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                End Time
              </div>
              <div className="mt-px font-mono text-[10px] text-text-secondary">{node.end_time}</div>
            </div>
          )}
        </div>
      </div>

      {/* Metadata */}
      {node.metadata && Object.keys(node.metadata).length > 0 && (
        <div className="overflow-hidden rounded-lg border border-primary/15 shadow-sm">
          <div className="border-b border-primary/10 bg-surface px-3 py-1.5">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
              Metadata
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold text-primary">
                {Object.keys(node.metadata).length}
              </span>
            </h4>
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            <table className="w-full text-xs">
              <tbody>
                {Object.entries(node.metadata).map(([key, value]) => (
                  <tr key={key} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[10px] font-medium text-primary">
                      {key}
                    </td>
                    <td className="px-3 py-1.5 text-text-secondary">
                      {typeof value === 'string' ? value : JSON.stringify(value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trace-level I/O panel (shown when "Workflow I/O" is selected)
// ---------------------------------------------------------------------------

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(6)}`;
  return `$${cost.toFixed(4)}`;
}

interface TraceIOPanelProps {
  trace: TraceDetail;
  className?: string;
}

export function TraceIOPanel({ trace, className }: TraceIOPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-xl border-2 border-primary/20 bg-surface shadow-lg shadow-primary/5',
        className
      )}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary-dark px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white shadow-sm">
            <FileInput className="h-2.5 w-2.5" />
            TRACE
          </span>
          <h3 className="text-xs font-bold text-white">{trace.name || 'Workflow'}</h3>
          <div className="ml-auto flex items-center gap-1.5">
            {trace.total_cost != null && (
              <span className="rounded-full bg-accent-gold/30 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                {formatCost(trace.total_cost)}
              </span>
            )}
            {trace.total_tokens.total > 0 && (
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white/95 backdrop-blur-sm">
                {trace.total_tokens.total.toLocaleString()} tokens
              </span>
            )}
            {trace.total_latency_ms != null && (
              <span className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/85">
                <Clock className="h-2.5 w-2.5" />
                {formatMs(trace.total_latency_ms)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Split pane: Input | Output */}
      <div className="replay-compact grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[35%_1fr]">
        <div className="min-w-0 border-b border-primary/10 lg:border-b-0 lg:border-r lg:border-r-primary/10">
          <div className="flex items-center gap-1.5 border-b border-primary/10 bg-surface px-3 py-1.5">
            <FileInput className="h-3 w-3 text-blue-500" />
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Input</h4>
          </div>
          <div className="max-h-[calc(100vh-280px)] overflow-y-auto break-words px-3 py-2 text-xs">
            <PromptViewer content={trace.trace_input} />
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 border-b border-primary/10 bg-surface px-3 py-1.5">
            <FileOutput className="h-3 w-3 text-emerald-500" />
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
              Output
            </h4>
          </div>
          <div className="max-h-[calc(100vh-280px)] overflow-y-auto break-words px-3 py-2 text-xs">
            <OutputViewer content={trace.trace_output} />
          </div>
        </div>
      </div>

      {/* Metadata drawer */}
      {trace.trace_metadata && Object.keys(trace.trace_metadata).length > 0 && (
        <div className="border-t border-primary/10 ">
          <button
            onClick={() => setDetailsOpen(!detailsOpen)}
            className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors hover:bg-primary/[0.04]"
          >
            <ChevronDown
              className={cn(
                'h-3 w-3 text-primary/50 transition-transform',
                !detailsOpen && '-rotate-90'
              )}
            />
            <Info className="h-3 w-3 text-primary/50" />
            <span className="font-medium text-text-secondary">
              Trace Metadata
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold text-primary">
                {Object.keys(trace.trace_metadata).length}
              </span>
            </span>
          </button>
          {detailsOpen && (
            <div className="max-h-[200px] overflow-y-auto border-t border-primary/10 bg-surface">
              <table className="w-full text-xs">
                <tbody>
                  {Object.entries(trace.trace_metadata).map(([key, value]) => (
                    <tr key={key} className="border-b border-primary/5 last:border-0">
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[10px] font-medium text-primary">
                        {key}
                      </td>
                      <td className="px-3 py-1.5 text-text-secondary">
                        {typeof value === 'string' ? value : JSON.stringify(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
