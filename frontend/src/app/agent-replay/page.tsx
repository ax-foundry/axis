'use client';

import {
  AlertCircle,
  Loader2,
  Logs,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  PlayCircle,
  Settings,
} from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';

import {
  AgentIdentityBar,
  NodeDetailPanel,
  ObservationTree,
  ReviewPanel,
  TRACE_IO_NODE_ID,
  TraceIOPanel,
  TracePicker,
} from '@/components/agent-replay';
import {
  collectAllNodeIds,
  findNodeById,
  findParentId,
  getVisibleNodes,
} from '@/components/agent-replay/ObservationTree';
import { PageHeader } from '@/components/ui/PageHeader';
import { useReplayStatus, useTraceDetail } from '@/lib/hooks/useReplayData';
import { cn } from '@/lib/utils';
import { useReplayStore } from '@/stores/replay-store';

export default function AgentReplayPage() {
  const { data: status, isLoading: statusLoading } = useReplayStatus();
  const {
    traceId,
    selectedNodeId,
    expandedNodeIds,
    sidebarCollapsed,
    selectedAgent,
    reviewPanelOpen,
    setTraceId,
    setSelectedNodeId,
    setExpandedNodeIds,
    toggleNodeExpanded,
    toggleSidebar,
    toggleReviewPanel,
    setAvailableAgents,
    reset,
  } = useReplayStore();
  const {
    data: trace,
    isLoading: traceLoading,
    error: traceError,
  } = useTraceDetail(traceId, selectedAgent);

  // Sync available agents from status response
  useEffect(() => {
    if (status?.agents) {
      setAvailableAgents(status.agents);
    }
  }, [status?.agents, setAvailableAgents]);

  // Auto-initialize tree on trace load: expand root + level-1, select first level-1 child
  useEffect(() => {
    if (!trace?.tree?.length) return;

    const expanded: Record<string, boolean> = {};
    // Expand all root nodes and their direct children
    for (const root of trace.tree) {
      expanded[root.id] = true;
      for (const child of root.children) {
        expanded[child.id] = true;
      }
    }
    setExpandedNodeIds(expanded);

    // Auto-select first level-1 child (first "step")
    const firstChild = trace.tree[0]?.children[0];
    if (firstChild) {
      setSelectedNodeId(firstChild.id);
    } else {
      setSelectedNodeId(trace.tree[0]?.id ?? null);
    }
  }, [trace?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Whether the trace has trace-level I/O (separate from observation tree)
  const hasTraceIO = !!(trace?.trace_input != null || trace?.trace_output != null);
  const isTraceIOSelected = selectedNodeId === TRACE_IO_NODE_ID;

  // Selected node from tree
  const selectedNode = useMemo(() => {
    if (!trace?.tree?.length || !selectedNodeId || isTraceIOSelected) return null;
    return findNodeById(trace.tree, selectedNodeId);
  }, [trace?.tree, selectedNodeId, isTraceIOSelected]);

  // All node IDs for expandAll
  const allNodeIds = useMemo(() => {
    if (!trace?.tree?.length) return [];
    return collectAllNodeIds(trace.tree);
  }, [trace?.tree]);

  // Expand/Collapse all
  const handleExpandAll = useCallback(() => {
    useReplayStore.getState().expandAll(allNodeIds);
  }, [allNodeIds]);

  const handleCollapseAll = useCallback(() => {
    useReplayStore.getState().collapseAll();
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!trace?.tree?.length) return;
      const visible = getVisibleNodes(trace.tree, expandedNodeIds);
      if (visible.length === 0) return;

      const currentIdx = selectedNodeId ? visible.findIndex((n) => n.id === selectedNodeId) : -1;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const next = currentIdx < visible.length - 1 ? currentIdx + 1 : currentIdx;
          setSelectedNodeId(visible[next].id);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prev = currentIdx > 0 ? currentIdx - 1 : 0;
          setSelectedNodeId(visible[prev].id);
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          if (selectedNodeId) {
            const node = findNodeById(trace.tree, selectedNodeId);
            if (node && node.children.length > 0) {
              if (!expandedNodeIds[selectedNodeId]) {
                toggleNodeExpanded(selectedNodeId);
              } else {
                // Already expanded, go to first child
                setSelectedNodeId(node.children[0].id);
              }
            }
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          if (selectedNodeId) {
            if (expandedNodeIds[selectedNodeId]) {
              // Collapse current node
              toggleNodeExpanded(selectedNodeId);
            } else {
              // Go to parent
              const parentId = findParentId(trace.tree, selectedNodeId);
              if (parentId) setSelectedNodeId(parentId);
            }
          }
          break;
        }
      }
    },
    [trace?.tree, expandedNodeIds, selectedNodeId, setSelectedNodeId, toggleNodeExpanded]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Loading status
  if (statusLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <PageHeader
        icon={PlayCircle}
        title="Agent Replay"
        subtitle="Step through AI agent workflows from Langfuse"
        actions={
          traceId ? (
            <button
              onClick={reset}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-gray-50"
            >
              New Trace
            </button>
          ) : undefined
        }
      />

      {/* Agent selector bar */}
      <AgentIdentityBar trace={trace ?? undefined} />

      {/* Pre-trace states: centered with gradient background */}
      {!trace && (
        <div className="flex flex-1 flex-col bg-gradient-to-b from-white via-primary/[0.02] to-primary/[0.05]">
          <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 pt-12">
            {/* Not configured state */}
            {status && !status.configured && (
              <div className="mx-auto max-w-lg rounded-2xl border border-amber-200/60 bg-amber-50/80 p-8 text-center shadow-sm backdrop-blur-sm">
                <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
                  <Settings className="h-7 w-7 text-amber-600" />
                </div>
                <h2 className="mb-2 text-lg font-semibold text-text-primary">
                  Configure Langfuse Credentials
                </h2>
                <p className="mb-5 text-sm text-text-secondary">
                  Set the following environment variables to use Agent Replay:
                </p>
                <div className="mx-auto max-w-sm rounded-xl border border-amber-200/50 bg-white/80 p-4 text-left font-mono text-xs leading-relaxed text-text-secondary shadow-inner">
                  <div className="font-semibold text-text-primary">AGENT_REPLAY_ENABLED=true</div>
                  <div className="mt-3 text-text-muted"># Per-agent credentials:</div>
                  <div>LANGFUSE_ALPHA_BOT_PUBLIC_KEY=pk-lf-...</div>
                  <div>LANGFUSE_ALPHA_BOT_SECRET_KEY=sk-lf-...</div>
                  <div className="mt-3 text-text-muted"># Or global fallback:</div>
                  <div>LANGFUSE_PUBLIC_KEY=pk-lf-...</div>
                  <div>LANGFUSE_SECRET_KEY=sk-lf-...</div>
                </div>
              </div>
            )}

            {/* Trace picker — centered hero layout */}
            {status?.configured && !traceId && (
              <TracePicker onSelect={setTraceId} agent={selectedAgent} />
            )}

            {/* Loading trace */}
            {traceId && traceLoading && (
              <div className="flex flex-col items-center justify-center gap-3 pt-16">
                <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
                <span className="text-sm text-text-muted">Fetching trace from Langfuse...</span>
              </div>
            )}

            {/* Error state */}
            {traceId && traceError && (
              <div className="mx-auto max-w-lg pt-12">
                <div className="rounded-2xl border border-red-200/60 bg-red-50/80 p-6 text-center shadow-sm">
                  <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                    <AlertCircle className="h-6 w-6 text-red-500" />
                  </div>
                  <p className="text-sm font-medium text-red-700">
                    {traceError instanceof Error ? traceError.message : 'Failed to load trace'}
                  </p>
                  <button
                    onClick={reset}
                    className="mt-4 rounded-xl bg-red-100 px-5 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-200"
                  >
                    Try Another Trace
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trace loaded: tree sidebar + detail panel */}
      {trace && (
        <div className="flex min-h-0 flex-1">
          {/* Left: collapsible tree sidebar */}
          <div
            className={cn(
              'shrink-0 overflow-hidden border-r border-border bg-white transition-[width] duration-200',
              sidebarCollapsed ? 'w-0 border-r-0' : 'w-64 overflow-y-auto'
            )}
          >
            <ObservationTree
              nodes={trace.tree}
              selectedNodeId={selectedNodeId}
              expandedNodeIds={expandedNodeIds}
              onSelectNode={setSelectedNodeId}
              onToggleExpand={toggleNodeExpanded}
              onExpandAll={handleExpandAll}
              onCollapseAll={handleCollapseAll}
              hasTraceIO={hasTraceIO}
            />
          </div>

          {/* Right: node detail */}
          <div className="relative flex min-w-0 flex-1 flex-col">
            {/* Sidebar toggle strip */}
            <div className="flex items-center gap-2 border-b border-border bg-gray-50/50 px-2 py-1">
              <button
                onClick={toggleSidebar}
                className="rounded-md p-1 text-text-muted transition-colors hover:bg-gray-200 hover:text-text-primary"
                title={sidebarCollapsed ? 'Show tree' : 'Hide tree'}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </button>
              {(selectedNode || isTraceIOSelected) && (
                <span className="truncate text-[11px] font-medium text-text-muted">
                  {isTraceIOSelected
                    ? 'Workflow I/O'
                    : selectedNode?.name || selectedNode?.type || 'node'}
                </span>
              )}
              <div className="ml-auto">
                <button
                  onClick={toggleReviewPanel}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    reviewPanelOpen
                      ? 'bg-primary text-white'
                      : 'text-text-muted hover:bg-gray-200 hover:text-text-primary'
                  )}
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  Review
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {isTraceIOSelected ? (
                <TraceIOPanel trace={trace} />
              ) : selectedNode ? (
                <NodeDetailPanel node={selectedNode} traceId={trace.id} agent={selectedAgent} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-text-muted">
                  <Logs className="h-10 w-10 text-border" />
                  <p className="text-sm">Select a node from the tree to view details</p>
                </div>
              )}
            </div>

            {/* Review panel overlay */}
            {reviewPanelOpen && (
              <div className="absolute inset-y-0 right-0 z-30 w-[380px] border-l border-border shadow-xl">
                <ReviewPanel
                  traceId={trace.id}
                  agent={selectedAgent}
                  traceName={trace.name ?? null}
                  tree={trace.tree}
                  traceInput={trace.trace_input}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
