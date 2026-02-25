'use client';

import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useMemoryStore } from '@/stores/memory-store';
import { GraphNodeColors } from '@/types/memory';

import type { GraphEdge, GraphNode, GraphNodeType } from '@/types/memory';

interface GraphNodeDetailProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function GraphNodeDetail({ nodes, edges }: GraphNodeDetailProps) {
  const { selectedNodeId, setSelectedNodeId } = useMemoryStore();

  if (!selectedNodeId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-text-muted">
        Click a node in the graph to see its details
      </div>
    );
  }

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-text-muted">
        Node not found
      </div>
    );
  }

  // Find connected edges
  const incomingEdges = edges.filter((e) => e.target === selectedNodeId);
  const outgoingEdges = edges.filter((e) => e.source === selectedNodeId);

  // Resolve connected node names
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const color = GraphNodeColors[node.type as GraphNodeType] ?? '#7F8C8D';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-border p-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span
              className="inline-block rounded px-2 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: color }}
            >
              {node.type}
            </span>
          </div>
          <h3 className="truncate text-sm font-semibold text-text-primary">{node.label}</h3>
        </div>
        <button
          onClick={() => setSelectedNodeId(null)}
          className="ml-2 flex-shrink-0 text-text-muted hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 text-sm">
        {/* Metadata */}
        {node.metadata && Object.keys(node.metadata).length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
              Properties
            </h4>
            <div className="space-y-1.5">
              {Object.entries(node.metadata).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <span className="flex-shrink-0 font-medium text-text-secondary">{key}:</span>
                  <span className="break-all text-text-muted">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Incoming connections */}
        {incomingEdges.length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
              Incoming ({incomingEdges.length})
            </h4>
            <div className="space-y-1">
              {incomingEdges.map((edge, i) => {
                const sourceNode = nodeMap.get(edge.source);
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedNodeId(edge.source)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-50'
                    )}
                  >
                    <span
                      className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          GraphNodeColors[sourceNode?.type as GraphNodeType] ?? '#7F8C8D',
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-text-primary">
                      {sourceNode?.label ?? edge.source}
                    </span>
                    <span className="flex-shrink-0 font-mono text-text-muted">{edge.type}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Outgoing connections */}
        {outgoingEdges.length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
              Outgoing ({outgoingEdges.length})
            </h4>
            <div className="space-y-1">
              {outgoingEdges.map((edge, i) => {
                const targetNode = nodeMap.get(edge.target);
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedNodeId(edge.target)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-50'
                    )}
                  >
                    <span className="flex-shrink-0 font-mono text-text-muted">{edge.type}</span>
                    <span className="min-w-0 flex-1 truncate text-text-primary">
                      {targetNode?.label ?? edge.target}
                    </span>
                    <span
                      className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          GraphNodeColors[targetNode?.type as GraphNodeType] ?? '#7F8C8D',
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Total connections summary */}
        <div className="border-t border-border pt-3 text-xs text-text-muted">
          {incomingEdges.length + outgoingEdges.length} total connections
        </div>
      </div>
    </div>
  );
}
