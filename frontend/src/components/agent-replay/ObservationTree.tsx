'use client';

import {
  Activity,
  Bot,
  ChevronDown,
  ChevronRight,
  Cpu,
  FileInput,
  Layers,
  Link,
  Wrench,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import type { ObservationNodeData } from '@/types/replay';

/** Sentinel node ID for the trace-level I/O view. */
export const TRACE_IO_NODE_ID = '__trace_io__';

const TYPE_CONFIG: Record<
  string,
  { color: string; bg: string; Icon: typeof Layers; label: string }
> = {
  SPAN: { color: 'text-indigo-600', bg: 'bg-indigo-100', Icon: Layers, label: 'SPAN' },
  GENERATION: { color: 'text-emerald-600', bg: 'bg-emerald-100', Icon: Cpu, label: 'GEN' },
  LLM: { color: 'text-emerald-600', bg: 'bg-emerald-100', Icon: Cpu, label: 'LLM' },
  AGENT: { color: 'text-violet-600', bg: 'bg-violet-100', Icon: Bot, label: 'AGENT' },
  CHAIN: { color: 'text-cyan-600', bg: 'bg-cyan-100', Icon: Link, label: 'CHAIN' },
  TOOL: { color: 'text-amber-600', bg: 'bg-amber-100', Icon: Wrench, label: 'TOOL' },
  EVENT: {
    color: 'text-gray-500',
    bg: 'bg-gray-100 dark:bg-gray-800',
    Icon: Activity,
    label: 'EVT',
  },
};

function getTypeConfig(type: string | null) {
  if (!type) return TYPE_CONFIG.SPAN;
  return TYPE_CONFIG[type.toUpperCase()] || TYPE_CONFIG.SPAN;
}

function cleanName(name: string | null, type: string | null): string {
  if (!name) return type?.toLowerCase() || 'node';
  return name.replace(/:ai\.generateText$/, '').replace(/^\.\.\./, '');
}

/**
 * Strip the parent's name prefix from a child name for compact display.
 * "worker.business_review.web_presence" under "worker.business_review" → "web_presence"
 * "bridge.claim_exec" under "athena.bridge" → "claim_exec"
 */
function shortenChildName(fullName: string, parentName: string | null): string {
  if (!parentName) return fullName;
  if (fullName.startsWith(parentName + '.')) {
    return fullName.slice(parentName.length + 1);
  }
  const parentLastDot = parentName.lastIndexOf('.');
  if (parentLastDot >= 0) {
    const parentSuffix = parentName.slice(parentLastDot + 1);
    if (fullName.startsWith(parentSuffix + '.')) {
      return fullName.slice(parentSuffix.length + 1);
    }
  }
  return fullName;
}

function formatMs(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/** Count all descendants recursively. */
function countDescendants(node: ObservationNodeData): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += countDescendants(child);
  }
  return count;
}

/** Pixels per indent level. */
const INDENT = 10;
/** Left gutter. */
const GUTTER = 4;

// ── Hover tooltip ──────────────────────────────────────────────────────

interface TooltipInfo {
  fullName: string;
  type: string | null;
  latency: string | null;
  tokens: string | null;
  cost: string | null;
  model: string | null;
  childCount: number;
}

function buildTooltip(node: ObservationNodeData, fullName: string): TooltipInfo {
  return {
    fullName,
    type: node.type,
    latency: node.latency_ms != null ? formatMs(node.latency_ms) : null,
    tokens:
      node.usage && node.usage.total > 0
        ? `${node.usage.input.toLocaleString()} in · ${node.usage.output.toLocaleString()} out · ${node.usage.total.toLocaleString()} total`
        : null,
    cost: node.cost != null && node.cost > 0 ? formatCost(node.cost) : null,
    model: node.model ?? null,
    childCount: node.children.length,
  };
}

function HoverTooltip({ info, x, y }: { info: TooltipInfo; x: number; y: number }) {
  const config = getTypeConfig(info.type);
  const Icon = config.Icon;
  return (
    <div
      className="pointer-events-none fixed z-50 w-56 rounded-lg border border-border bg-surface p-2.5 text-[11px] shadow-xl"
      style={{ left: x, top: y }}
    >
      {/* Name */}
      <div className="flex items-center gap-1.5">
        <span
          className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded', config.bg)}
        >
          <Icon className={cn('h-2.5 w-2.5', config.color)} />
        </span>
        <span className="break-all font-semibold leading-tight text-text-primary">
          {info.fullName}
        </span>
      </div>

      {/* Stats grid */}
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {info.latency && (
          <div>
            <span className="text-[9px] uppercase text-text-muted">Duration</span>
            <div className="font-semibold text-text-primary">{info.latency}</div>
          </div>
        )}
        {info.cost && (
          <div>
            <span className="text-[9px] uppercase text-text-muted">Cost</span>
            <div className="font-semibold text-accent-gold">{info.cost}</div>
          </div>
        )}
        {info.model && (
          <div className="col-span-2">
            <span className="text-[9px] uppercase text-text-muted">Model</span>
            <div className="truncate font-medium text-text-secondary">{info.model}</div>
          </div>
        )}
        {info.tokens && (
          <div className="col-span-2">
            <span className="text-[9px] uppercase text-text-muted">Tokens</span>
            <div className="font-medium text-text-secondary">{info.tokens}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tree Row ───────────────────────────────────────────────────────────

interface ObservationTreeRowProps {
  node: ObservationNodeData;
  parentName: string | null;
  selectedNodeId: string | null;
  expandedNodeIds: Record<string, boolean>;
  activeGuides: Set<number>;
  isLastChild: boolean;
  onSelectNode: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onHover: (info: TooltipInfo | null, rect: DOMRect | null) => void;
}

function ObservationTreeRow({
  node,
  parentName,
  selectedNodeId,
  expandedNodeIds,
  activeGuides,
  isLastChild,
  onSelectNode,
  onToggleExpand,
  onHover,
}: ObservationTreeRowProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedNodeIds[node.id] ?? false;
  const isSelected = selectedNodeId === node.id;
  const config = getTypeConfig(node.type);
  const Icon = config.Icon;
  const fullName = cleanName(node.name, node.type);
  const displayName = shortenChildName(fullName, parentName);
  const rowRef = useRef<HTMLButtonElement>(null);

  const childGuides = new Set(activeGuides);
  if (isLastChild && node.depth > 0) {
    childGuides.delete(node.depth - 1);
  }

  const hasError = !!(
    node.output &&
    typeof node.output === 'object' &&
    'error' in (node.output as Record<string, unknown>) &&
    (node.output as Record<string, unknown>).error != null
  );

  return (
    <>
      <button
        ref={rowRef}
        onClick={() => onSelectNode(node.id)}
        onMouseEnter={() => {
          if (rowRef.current) {
            onHover(buildTooltip(node, fullName), rowRef.current.getBoundingClientRect());
          }
        }}
        onMouseLeave={() => onHover(null, null)}
        className={cn(
          'group relative flex w-full items-center gap-0.5 pr-1 text-left text-[11px] leading-tight transition-colors',
          isSelected
            ? 'bg-primary/10 text-primary-dark'
            : 'text-text-primary hover:bg-primary/[0.04]',
          hasError && !isSelected && 'bg-red-50/50'
        )}
        style={{
          paddingLeft: `${node.depth * INDENT + GUTTER}px`,
          paddingTop: '2.5px',
          paddingBottom: '2.5px',
        }}
      >
        {/* Indent guide lines */}
        {Array.from(activeGuides).map((guideDepth) => (
          <span
            key={guideDepth}
            className="bg-border/30 pointer-events-none absolute bottom-0 top-0 w-px"
            style={{ left: `${guideDepth * INDENT + GUTTER + 7}px` }}
          />
        ))}

        {/* Horizontal connector */}
        {node.depth > 0 && (
          <span
            className="bg-border/30 pointer-events-none absolute h-px"
            style={{
              left: `${(node.depth - 1) * INDENT + GUTTER + 7}px`,
              width: `${INDENT - 4}px`,
              top: '10px',
            }}
          />
        )}

        {/* Chevron */}
        {hasChildren ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
            className="z-[1] flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded transition-colors hover:bg-primary/10"
          >
            {isExpanded ? (
              <ChevronDown
                className={cn('h-2.5 w-2.5', isSelected ? 'text-primary' : 'text-text-muted')}
              />
            ) : (
              <ChevronRight
                className={cn('h-2.5 w-2.5', isSelected ? 'text-primary' : 'text-text-muted')}
              />
            )}
          </span>
        ) : (
          <span className="h-[18px] w-[18px] shrink-0" />
        )}

        {/* Type icon */}
        <span
          className={cn(
            'z-[1] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded',
            config.bg
          )}
        >
          <Icon className={cn('h-2.5 w-2.5', config.color)} />
        </span>

        {/* Name */}
        <span
          className={cn(
            'z-[1] min-w-0 flex-1 truncate pl-0.5 font-medium',
            isSelected && 'font-semibold'
          )}
        >
          {displayName}
        </span>

        {/* Collapsed child count badge */}
        {hasChildren && !isExpanded && (
          <span className="bg-border/50 z-[1] ml-auto shrink-0 rounded-full px-1.5 py-px text-[8px] font-semibold text-text-muted">
            {countDescendants(node)}
          </span>
        )}
      </button>

      {/* Children */}
      {hasChildren &&
        isExpanded &&
        node.children.map((child, i) => {
          const guides = new Set(childGuides);
          if (i < node.children.length - 1) {
            guides.add(node.depth);
          }
          return (
            <ObservationTreeRow
              key={child.id}
              node={child}
              parentName={fullName}
              selectedNodeId={selectedNodeId}
              expandedNodeIds={expandedNodeIds}
              activeGuides={guides}
              isLastChild={i === node.children.length - 1}
              onSelectNode={onSelectNode}
              onToggleExpand={onToggleExpand}
              onHover={onHover}
            />
          );
        })}
    </>
  );
}

// ── Toolbar ────────────────────────────────────────────────────────────

function TreeToolbar({
  totalNodes,
  onExpandAll,
  onCollapseAll,
}: {
  totalNodes: number;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-primary/10 bg-gradient-to-r from-primary/[0.04] to-transparent px-3 py-1.5">
      <span className="text-[10px] font-semibold text-primary-dark/60">{totalNodes} nodes</span>
      <div className="flex items-center gap-1">
        <button
          onClick={onExpandAll}
          className="rounded px-1.5 py-0.5 text-[10px] font-medium text-primary/60 transition-colors hover:bg-primary/10 hover:text-primary-dark"
        >
          Expand
        </button>
        <button
          onClick={onCollapseAll}
          className="rounded px-1.5 py-0.5 text-[10px] font-medium text-primary/60 transition-colors hover:bg-primary/10 hover:text-primary-dark"
        >
          Collapse
        </button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

interface ObservationTreeProps {
  nodes: ObservationNodeData[];
  selectedNodeId: string | null;
  expandedNodeIds: Record<string, boolean>;
  onSelectNode: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  hasTraceIO?: boolean;
  className?: string;
}

/** Collect all node IDs recursively. */
export function collectAllNodeIds(nodes: ObservationNodeData[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    ids.push(...collectAllNodeIds(node.children));
  }
  return ids;
}

/** Find a node by ID in the tree. */
export function findNodeById(nodes: ObservationNodeData[], id: string): ObservationNodeData | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

/** Build a flat list of visible nodes (for keyboard navigation). */
export function getVisibleNodes(
  nodes: ObservationNodeData[],
  expandedNodeIds: Record<string, boolean>
): ObservationNodeData[] {
  const result: ObservationNodeData[] = [];
  for (const node of nodes) {
    result.push(node);
    if (expandedNodeIds[node.id] && node.children.length > 0) {
      result.push(...getVisibleNodes(node.children, expandedNodeIds));
    }
  }
  return result;
}

/** Find parent node ID for a given node. */
export function findParentId(
  nodes: ObservationNodeData[],
  targetId: string,
  parentId: string | null = null
): string | null {
  for (const node of nodes) {
    if (node.id === targetId) return parentId;
    const found = findParentId(node.children, targetId, node.id);
    if (found !== null) return found;
  }
  return null;
}

export function ObservationTree({
  nodes,
  selectedNodeId,
  expandedNodeIds,
  onSelectNode,
  onToggleExpand,
  onExpandAll,
  onCollapseAll,
  hasTraceIO,
  className,
}: ObservationTreeProps) {
  const totalNodes = collectAllNodeIds(nodes).length;
  const [tooltip, setTooltip] = useState<{ info: TooltipInfo; x: number; y: number } | null>(null);

  const handleSelect = useCallback(
    (id: string) => {
      onSelectNode(id);
    },
    [onSelectNode]
  );

  const handleHover = useCallback((info: TooltipInfo | null, rect: DOMRect | null) => {
    if (!info || !rect) {
      setTooltip(null);
      return;
    }
    // Position tooltip to the right of the row, clamped to viewport
    const x = Math.min(rect.right + 8, window.innerWidth - 240);
    const y = Math.min(rect.top, window.innerHeight - 160);
    setTooltip({ info, x, y });
  }, []);

  if (nodes.length === 0) {
    return (
      <div
        className={cn('flex items-center justify-center py-8 text-xs text-text-muted', className)}
      >
        No tree data available
      </div>
    );
  }

  const traceIOSelected = selectedNodeId === TRACE_IO_NODE_ID;
  const emptyGuides = new Set<number>();

  return (
    <div className={cn('relative', className)}>
      <TreeToolbar
        totalNodes={totalNodes}
        onExpandAll={onExpandAll}
        onCollapseAll={onCollapseAll}
      />
      <div className="py-0.5">
        {/* Trace-level I/O entry */}
        {hasTraceIO && (
          <button
            onClick={() => handleSelect(TRACE_IO_NODE_ID)}
            className={cn(
              'group flex w-full items-center gap-1 py-1 pl-2 pr-2 text-left text-[11px] transition-colors',
              traceIOSelected
                ? 'bg-primary/10 font-semibold text-primary-dark'
                : 'text-text-primary hover:bg-primary/[0.04]'
            )}
          >
            <span
              className={cn(
                'flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded',
                traceIOSelected ? 'bg-primary/20' : 'bg-primary/10'
              )}
            >
              <FileInput className="h-2.5 w-2.5 text-primary" />
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">Workflow I/O</span>
          </button>
        )}

        {hasTraceIO && <div className="mx-2 my-0.5 border-t border-primary/10" />}

        {nodes.map((node, i) => (
          <ObservationTreeRow
            key={node.id}
            node={node}
            parentName={null}
            selectedNodeId={selectedNodeId}
            expandedNodeIds={expandedNodeIds}
            activeGuides={emptyGuides}
            isLastChild={i === nodes.length - 1}
            onSelectNode={handleSelect}
            onToggleExpand={onToggleExpand}
            onHover={handleHover}
          />
        ))}
      </div>

      {/* Floating tooltip */}
      {tooltip && <HoverTooltip info={tooltip.info} x={tooltip.x} y={tooltip.y} />}
    </div>
  );
}
