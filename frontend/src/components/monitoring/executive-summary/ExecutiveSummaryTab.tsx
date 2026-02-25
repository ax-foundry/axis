'use client';

import { Activity, ChevronDown, ChevronRight, Loader2, TableProperties } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Suspense, useCallback, useMemo, useState } from 'react';

import { buildMonitoringHierarchy } from '@/lib/executive-summary-utils';
import { useMonitoringStore } from '@/stores';

import { ExecutiveKPIs } from './ExecutiveKPIs';

import type { MetricCategoryTab, MonitoringHierarchyNode, MonitoringRecord } from '@/types';

const ExecutiveHierarchyTable = dynamic(() =>
  import('./ExecutiveHierarchyTable').then((m) => ({ default: m.ExecutiveHierarchyTable }))
);

const MetricDetailPanel = dynamic(() =>
  import('./MetricDetailPanel').then((m) => ({ default: m.MetricDetailPanel }))
);

interface ExecutiveSummaryTabProps {
  data: MonitoringRecord[];
  onNavigateToTab?: (tab: string) => void;
}

export function ExecutiveSummaryTab({
  data,
  onNavigateToTab: onNavigateToTabProp,
}: ExecutiveSummaryTabProps) {
  const {
    executiveSummaryExpandedNodes,
    toggleExecutiveSummaryNode,
    expandAllExecutiveSummaryNodes,
    collapseAllExecutiveSummaryNodes,
    setActiveMetricCategoryTab,
  } = useMonitoringStore();

  const [detailNode, setDetailNode] = useState<MonitoringHierarchyNode | null>(null);
  const [scorecardOpen, setScorecardOpen] = useState(false);

  const { nodes, rootIds } = useMemo(() => buildMonitoringHierarchy(data), [data]);

  const handleExpandAll = useCallback(() => {
    const allIds = Array.from(nodes.keys()).filter((id) => {
      const n = nodes.get(id);
      return n && n.childIds.length > 0;
    });
    expandAllExecutiveSummaryNodes(allIds);
  }, [nodes, expandAllExecutiveSummaryNodes]);

  const handleNavigateToTab = useCallback(
    (tab: string) => {
      setDetailNode(null);
      if (onNavigateToTabProp) {
        onNavigateToTabProp(tab);
      } else {
        setActiveMetricCategoryTab(tab as MetricCategoryTab);
      }
    },
    [onNavigateToTabProp, setActiveMetricCategoryTab]
  );

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Activity className="mb-4 h-12 w-12 text-text-muted opacity-30" />
        <p className="text-sm text-text-muted">No data available for executive summary</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <ExecutiveKPIs data={data} />

      {/* Scorecard toggle */}
      <button
        onClick={() => setScorecardOpen((v) => !v)}
        className="flex items-center gap-2 text-sm text-text-muted transition-colors hover:text-text-primary"
      >
        {scorecardOpen ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <TableProperties className="h-3.5 w-3.5" />
        <span>Quality Scorecard</span>
      </button>

      {scorecardOpen && (
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            </div>
          }
        >
          {/* Hierarchical Table */}
          <ExecutiveHierarchyTable
            nodes={nodes}
            rootIds={rootIds}
            expandedNodes={executiveSummaryExpandedNodes}
            onToggleNode={toggleExecutiveSummaryNode}
            onExpandAll={handleExpandAll}
            onCollapseAll={collapseAllExecutiveSummaryNodes}
            onViewDetails={setDetailNode}
          />

          {/* Detail Panel */}
          {detailNode && (
            <MetricDetailPanel
              node={detailNode}
              records={data}
              onClose={() => setDetailNode(null)}
              onNavigateToTab={handleNavigateToTab}
            />
          )}
        </Suspense>
      )}
    </div>
  );
}
