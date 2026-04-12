'use client';

import { Activity, Bot, Cpu, Layers, Link, Wrench } from 'lucide-react';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';

import type { ObservationNodeData } from '@/types/replay';

const TYPE_COLORS: Record<string, { bar: string; text: string; Icon: typeof Layers }> = {
  SPAN: { bar: 'bg-indigo-400', text: 'text-indigo-600', Icon: Layers },
  GENERATION: { bar: 'bg-emerald-400', text: 'text-emerald-600', Icon: Cpu },
  LLM: { bar: 'bg-emerald-400', text: 'text-emerald-600', Icon: Cpu },
  AGENT: { bar: 'bg-violet-400', text: 'text-violet-600', Icon: Bot },
  CHAIN: { bar: 'bg-cyan-400', text: 'text-cyan-600', Icon: Link },
  TOOL: { bar: 'bg-amber-400', text: 'text-amber-600', Icon: Wrench },
  EVENT: { bar: 'bg-gray-400', text: 'text-gray-500', Icon: Activity },
};

function getTypeColor(type: string | null) {
  if (!type) return TYPE_COLORS.SPAN;
  return TYPE_COLORS[type.toUpperCase()] || TYPE_COLORS.SPAN;
}

function formatDuration(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

interface FlatNode {
  node: ObservationNodeData;
  startMs: number;
  endMs: number;
  durationMs: number;
}

/** Flatten tree into a list, respecting expansion state, and parse timestamps. */
function flattenWithTiming(
  nodes: ObservationNodeData[],
  expandedNodeIds: Record<string, boolean>
): FlatNode[] {
  const result: FlatNode[] = [];
  for (const node of nodes) {
    const startMs = node.start_time ? new Date(node.start_time).getTime() : NaN;
    const endMs = node.end_time ? new Date(node.end_time).getTime() : NaN;
    if (!isNaN(startMs) && !isNaN(endMs)) {
      result.push({ node, startMs, endMs, durationMs: endMs - startMs });
    }
    if (expandedNodeIds[node.id] && node.children.length > 0) {
      result.push(...flattenWithTiming(node.children, expandedNodeIds));
    }
  }
  return result;
}

/** Compute min/max across all nodes in the tree (regardless of expansion). */
function computeBounds(nodes: ObservationNodeData[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const node of nodes) {
    const s = node.start_time ? new Date(node.start_time).getTime() : NaN;
    const e = node.end_time ? new Date(node.end_time).getTime() : NaN;
    if (!isNaN(s) && s < min) min = s;
    if (!isNaN(e) && e > max) max = e;
    if (node.children.length > 0) {
      const childBounds = computeBounds(node.children);
      if (childBounds.min < min) min = childBounds.min;
      if (childBounds.max > max) max = childBounds.max;
    }
  }
  return { min, max };
}

/** Compute indent for waterfall name labels. */
function waterfallIndent(depth: number): number {
  if (depth <= 3) return depth * 10;
  return 3 * 10 + (depth - 3) * 6;
}

interface TraceWaterfallProps {
  nodes: ObservationNodeData[];
  selectedNodeId: string | null;
  expandedNodeIds: Record<string, boolean>;
  onSelectNode: (id: string) => void;
  className?: string;
}

export function TraceWaterfall({
  nodes,
  selectedNodeId,
  expandedNodeIds,
  onSelectNode,
  className,
}: TraceWaterfallProps) {
  const bounds = useMemo(() => computeBounds(nodes), [nodes]);
  const totalDuration = bounds.max - bounds.min;

  const flatNodes = useMemo(
    () => flattenWithTiming(nodes, expandedNodeIds),
    [nodes, expandedNodeIds]
  );

  if (flatNodes.length === 0 || totalDuration <= 0) {
    return (
      <div
        className={cn('flex items-center justify-center py-8 text-xs text-text-muted', className)}
      >
        No timeline data available
      </div>
    );
  }

  // Time axis ticks
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (totalDuration / tickCount) * i);

  return (
    <div className={cn('overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-primary/10 bg-gradient-to-r from-primary/[0.04] to-transparent px-3 py-2">
        <span className="text-[11px] font-semibold text-primary-dark/60">
          {flatNodes.length} spans
        </span>
        <span className="text-[10px] text-text-muted">{formatDuration(totalDuration)} total</span>
      </div>

      {/* Time axis */}
      <div className="flex border-b border-primary/10">
        <div className="w-[140px] shrink-0" />
        <div className="relative flex-1 px-1 py-1">
          <div className="flex justify-between">
            {ticks.map((t, i) => (
              <span key={i} className="text-text-muted/60 text-[9px]">
                {formatDuration(t)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Rows */}
      <div className="max-h-[calc(100vh-360px)] overflow-y-auto py-0.5">
        {flatNodes.map(({ node, startMs, durationMs }) => {
          const leftPct = ((startMs - bounds.min) / totalDuration) * 100;
          const widthPct = Math.max((durationMs / totalDuration) * 100, 0.5);
          const isSelected = selectedNodeId === node.id;
          const config = getTypeColor(node.type);
          const Icon = config.Icon;

          return (
            <button
              key={node.id}
              onClick={() => onSelectNode(node.id)}
              className={cn(
                'group flex w-full items-center text-left transition-colors',
                isSelected ? 'bg-primary/8' : 'hover:bg-primary/[0.03]'
              )}
              style={{ height: '24px' }}
            >
              {/* Label column */}
              <div
                className="flex w-[140px] shrink-0 items-center gap-1 overflow-hidden px-2"
                style={{ paddingLeft: `${waterfallIndent(node.depth) + 8}px` }}
              >
                <Icon className={cn('h-2.5 w-2.5 shrink-0', config.text)} />
                <span
                  className={cn(
                    'truncate text-[10px]',
                    isSelected ? 'font-semibold text-primary-dark' : 'text-text-primary'
                  )}
                >
                  {node.name || node.type?.toLowerCase() || 'node'}
                </span>
              </div>

              {/* Bar column */}
              <div className="relative flex-1 px-1">
                <div
                  className={cn(
                    'absolute top-[4px] h-[16px] rounded-sm transition-opacity',
                    config.bar,
                    isSelected ? 'opacity-90 shadow-sm' : 'opacity-60 group-hover:opacity-75'
                  )}
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    minWidth: '2px',
                  }}
                >
                  {/* Duration label inside bar if wide enough */}
                  {widthPct > 6 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-white">
                      {formatDuration(durationMs)}
                    </span>
                  )}
                </div>
                {/* Duration label outside bar if narrow */}
                {widthPct <= 6 && durationMs > 0 && (
                  <span
                    className="absolute top-[4px] flex h-[16px] items-center text-[9px] text-text-muted"
                    style={{ left: `${leftPct + widthPct + 0.5}%` }}
                  >
                    {formatDuration(durationMs)}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
