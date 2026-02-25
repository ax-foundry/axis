'use client';

import { Activity, ChevronDown, ChevronRight, Cpu, FileInput, Layers, Wrench } from 'lucide-react';
import { useCallback } from 'react';

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
  TOOL: { color: 'text-amber-600', bg: 'bg-amber-100', Icon: Wrench, label: 'TOOL' },
  EVENT: { color: 'text-gray-500', bg: 'bg-gray-100', Icon: Activity, label: 'EVT' },
};

function getTypeConfig(type: string | null) {
  if (!type) return TYPE_CONFIG.SPAN;
  return TYPE_CONFIG[type.toUpperCase()] || TYPE_CONFIG.SPAN;
}

function cleanName(name: string | null, type: string | null): string {
  if (!name) return type?.toLowerCase() || 'node';
  // Strip common suffixes for readability
  return name.replace(/:ai\.generateText$/, '').replace(/^\.\.\./, '');
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

interface ObservationTreeRowProps {
  node: ObservationNodeData;
  selectedNodeId: string | null;
  expandedNodeIds: Record<string, boolean>;
  onSelectNode: (id: string) => void;
  onToggleExpand: (id: string) => void;
}

function ObservationTreeRow({
  node,
  selectedNodeId,
  expandedNodeIds,
  onSelectNode,
  onToggleExpand,
}: ObservationTreeRowProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedNodeIds[node.id] ?? false;
  const isSelected = selectedNodeId === node.id;
  const config = getTypeConfig(node.type);
  const Icon = config.Icon;
  const displayName = cleanName(node.name, node.type);

  return (
    <>
      <button
        onClick={() => onSelectNode(node.id)}
        className={cn(
          'group flex w-full items-center gap-1.5 py-1.5 pr-2 text-left text-xs transition-colors hover:bg-gray-50',
          isSelected && 'border-l-2 border-l-primary bg-primary/5'
        )}
        style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
            className="flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-gray-200"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-text-muted" />
            ) : (
              <ChevronRight className="h-3 w-3 text-text-muted" />
            )}
          </span>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}

        {/* Type icon */}
        <span
          className={cn(
            'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded',
            config.bg
          )}
        >
          <Icon className={cn('h-2.5 w-2.5', config.color)} />
        </span>

        {/* Name */}
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-medium',
            isSelected ? 'text-primary-dark' : 'text-text-primary'
          )}
        >
          {displayName}
        </span>

        {/* Compact metadata */}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] text-text-muted">
          {node.latency_ms != null && <span>{formatMs(node.latency_ms)}</span>}
          {node.usage && node.usage.total > 0 && <span>{formatTokens(node.usage.total)}t</span>}
        </span>
      </button>

      {/* Children */}
      {hasChildren &&
        isExpanded &&
        node.children.map((child) => (
          <ObservationTreeRow
            key={child.id}
            node={child}
            selectedNodeId={selectedNodeId}
            expandedNodeIds={expandedNodeIds}
            onSelectNode={onSelectNode}
            onToggleExpand={onToggleExpand}
          />
        ))}
    </>
  );
}

interface TreeToolbarProps {
  totalNodes: number;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

function TreeToolbar({ totalNodes, onExpandAll, onCollapseAll }: TreeToolbarProps) {
  return (
    <div className="flex items-center justify-between border-b border-border px-3 py-2">
      <span className="text-[11px] font-medium text-text-muted">{totalNodes} nodes</span>
      <div className="flex items-center gap-1">
        <button
          onClick={onExpandAll}
          className="rounded px-1.5 py-0.5 text-[10px] font-medium text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary"
        >
          Expand
        </button>
        <button
          onClick={onCollapseAll}
          className="rounded px-1.5 py-0.5 text-[10px] font-medium text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary"
        >
          Collapse
        </button>
      </div>
    </div>
  );
}

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

  const handleSelect = useCallback(
    (id: string) => {
      onSelectNode(id);
    },
    [onSelectNode]
  );

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

  return (
    <div className={cn(className)}>
      <TreeToolbar
        totalNodes={totalNodes}
        onExpandAll={onExpandAll}
        onCollapseAll={onCollapseAll}
      />
      <div className="py-1">
        {/* Trace-level I/O entry */}
        {hasTraceIO && (
          <button
            onClick={() => handleSelect(TRACE_IO_NODE_ID)}
            className={cn(
              'group flex w-full items-center gap-1.5 py-1.5 pl-2 pr-2 text-left text-xs transition-colors hover:bg-gray-50',
              traceIOSelected && 'border-l-2 border-l-primary bg-primary/5'
            )}
          >
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded bg-primary/15">
              <FileInput className="h-2.5 w-2.5 text-primary" />
            </span>
            <span
              className={cn(
                'min-w-0 flex-1 truncate font-semibold',
                traceIOSelected ? 'text-primary-dark' : 'text-text-primary'
              )}
            >
              Workflow I/O
            </span>
          </button>
        )}

        {/* Divider between trace I/O and observation tree */}
        {hasTraceIO && <div className="mx-2 my-1 border-t border-border" />}

        {nodes.map((node) => (
          <ObservationTreeRow
            key={node.id}
            node={node}
            selectedNodeId={selectedNodeId}
            expandedNodeIds={expandedNodeIds}
            onSelectNode={handleSelect}
            onToggleExpand={onToggleExpand}
          />
        ))}
      </div>
    </div>
  );
}
