'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import { useMemo } from 'react';

import { useMemoryGraph } from '@/lib/hooks/memory-hooks';
import { useMemoryStore } from '@/stores/memory-store';

import { GraphHelpPanel } from './GraphHelpPanel';
import { GraphLegend } from './GraphLegend';
import { GraphNodeDetail } from './GraphNodeDetail';
import { GraphSearchBar } from './GraphSearchBar';
import { GraphStats } from './GraphStats';
import { GraphVisualization } from './GraphVisualization';

const NODE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All Types' },
  { value: 'RiskFactor', label: 'Risk Factors' },
  { value: 'Rule', label: 'Rules' },
  { value: 'Outcome', label: 'Outcomes' },
  { value: 'Mitigant', label: 'Mitigants' },
  { value: 'Source', label: 'Sources' },
];

export function KnowledgeGraphTab() {
  const { graphFilterType, setGraphFilterType, selectedNodeId } = useMemoryStore();

  const filters = useMemo(() => {
    const f: { node_type?: string } = {};
    if (graphFilterType) f.node_type = graphFilterType;
    return f;
  }, [graphFilterType]);

  const { data: graphResponse, isLoading, error } = useMemoryGraph(filters);

  const nodes = graphResponse?.data?.nodes ?? [];
  const edges = graphResponse?.data?.edges ?? [];

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-white p-12 text-center">
        <AlertCircle className="mb-3 h-8 w-8 text-error" />
        <h3 className="mb-1 text-sm font-semibold text-text-primary">
          Could not connect to Knowledge Graph
        </h3>
        <p className="max-w-md text-xs text-text-muted">
          {error instanceof Error ? error.message : 'Unknown error'}. Make sure FalkorDB is running
          on port 6379.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Help panel */}
      <GraphHelpPanel />

      {/* Stats strip */}
      <GraphStats />

      {/* Search + filter bar */}
      <div className="flex items-center gap-3">
        <GraphSearchBar />
        <select
          value={graphFilterType}
          onChange={(e) => setGraphFilterType(e.target.value)}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {NODE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Main graph area */}
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {isLoading ? (
          <div className="flex h-[600px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex h-[600px] items-center justify-center text-sm text-text-muted">
            No graph data found. Ensure FalkorDB contains knowledge graph nodes.
          </div>
        ) : (
          <div className="flex" style={{ height: '600px' }}>
            {/* Graph */}
            <div className="relative flex-1">
              <GraphVisualization nodes={nodes} edges={edges} />
              {/* Legend overlay */}
              <div className="absolute bottom-3 left-3 rounded-lg border border-border bg-white/90 px-3 py-2 backdrop-blur-sm">
                <GraphLegend />
              </div>
            </div>

            {/* Detail panel */}
            {selectedNodeId && (
              <div className="w-72 flex-shrink-0 border-l border-border">
                <GraphNodeDetail nodes={nodes} edges={edges} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
