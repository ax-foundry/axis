'use client';

import { Info } from 'lucide-react';
import { useMemo, useCallback, useEffect } from 'react';

import { InputContextPanel } from '@/components/tree/InputContextPanel';
import { MetricDetailPopup } from '@/components/tree/MetricDetailPopup';
import { TreeVisualization, type TreeNode } from '@/components/tree/tree-visualization';
import { cn } from '@/lib/utils';
import { useDataStore, useUIStore } from '@/stores';
import { Columns } from '@/types';

export function TreeTab() {
  const { data, format } = useDataStore();
  const {
    treeViewMode,
    setTreeViewMode,
    selectedTestCaseId,
    setSelectedTestCaseId,
    selectedTreeMetric,
    setSelectedTreeMetric,
    clearSelectedTreeMetric,
  } = useUIStore();

  // Get unique test case IDs
  const testCaseIds = useMemo(() => {
    if (!data || data.length === 0) return [];
    const ids = new Set<string>();
    data.forEach((row) => {
      const id = row[Columns.DATASET_ID] as string;
      if (id) ids.add(id);
    });
    return Array.from(ids);
  }, [data]);

  // Auto-select first test case when in individual mode and none selected
  useEffect(() => {
    if (treeViewMode === 'individual' && !selectedTestCaseId && testCaseIds.length > 0) {
      setSelectedTestCaseId(testCaseIds[0]);
    }
  }, [treeViewMode, selectedTestCaseId, testCaseIds, setSelectedTestCaseId]);

  // Get test case data for the selected test case (for InputContextPanel)
  const testCaseData = useMemo(() => {
    if (!data || !selectedTestCaseId || treeViewMode !== 'individual') return null;
    // Find the first row for this test case (all rows share input context)
    return data.find((row) => row[Columns.DATASET_ID] === selectedTestCaseId) || null;
  }, [data, selectedTestCaseId, treeViewMode]);

  // Handle leaf node click
  const handleLeafClick = useCallback(
    (node: TreeNode, event: { x: number; y: number }) => {
      setSelectedTreeMetric({
        name: node.name,
        score: node.score,
        weight: node.weight,
        explanation: node.explanation,
        signals: node.signals,
        critique: node.critique,
        position: event,
        isAggregated: node.isAggregated,
        aggregateStats: node.aggregateStats,
      });
    },
    [setSelectedTreeMetric]
  );

  // Check if data is tree format
  const isTreeFormat = format === 'tree_format';

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-text-muted">
        No data available. Upload evaluation data to see the tree view.
      </div>
    );
  }

  if (!isTreeFormat) {
    return (
      <div className="flex h-64 flex-col items-center justify-center space-y-2 text-text-muted">
        <p>Tree visualization requires hierarchical (tree_format) data.</p>
        <p className="text-sm">Current format: {format}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="border-border/50 flex items-center justify-between rounded-xl border bg-white p-4">
        {/* View Mode Toggle */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-text-primary">View Mode:</span>
          <div className="flex items-center rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => setTreeViewMode('aggregated')}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium transition-all',
                treeViewMode === 'aggregated'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              )}
            >
              Aggregated
            </button>
            <button
              onClick={() => setTreeViewMode('individual')}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium transition-all',
                treeViewMode === 'individual'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              )}
            >
              Individual
            </button>
          </div>
        </div>

        {/* Test Case Selector (for individual view) */}
        {treeViewMode === 'individual' && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-muted">Test Case:</span>
            <select
              value={selectedTestCaseId || ''}
              onChange={(e) => setSelectedTestCaseId(e.target.value || null)}
              className="max-w-xs rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Select a test case</option>
              {testCaseIds.map((id) => (
                <option key={id} value={id}>
                  {id.length > 40 ? `${id.substring(0, 40)}...` : id}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tree Visualization */}
      <div className="border-border/50 overflow-hidden rounded-xl border bg-white shadow-sm">
        {/* Guidance hint */}
        <div className="flex items-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2">
          <Info className="h-4 w-4 flex-shrink-0 text-blue-500" />
          <p className="text-sm text-blue-700">
            <span className="font-medium">Tip:</span> Click on leaf nodes (metrics) to see{' '}
            {treeViewMode === 'aggregated'
              ? 'distribution statistics (mean, median, percentiles, histogram).'
              : 'detailed explanations, signals, and critique.'}
          </p>
        </div>

        {treeViewMode === 'individual' && !selectedTestCaseId ? (
          <div className="flex h-[600px] items-center justify-center text-text-muted">
            Select a test case to view its metric tree
          </div>
        ) : (
          <TreeVisualization
            data={data}
            viewMode={treeViewMode}
            selectedTestCase={selectedTestCaseId || undefined}
            onLeafClick={handleLeafClick}
          />
        )}
      </div>

      {/* Input Context Panel (only in individual view with selected test case) */}
      {treeViewMode === 'individual' && selectedTestCaseId && (
        <InputContextPanel testCaseData={testCaseData} />
      )}

      {/* Metric Detail Popup */}
      {selectedTreeMetric && (
        <MetricDetailPopup
          node={{
            name: selectedTreeMetric.name,
            score: selectedTreeMetric.score,
            weight: selectedTreeMetric.weight,
            type: 'metric',
            explanation: selectedTreeMetric.explanation,
            signals: selectedTreeMetric.signals,
            critique: selectedTreeMetric.critique,
            isAggregated: selectedTreeMetric.isAggregated,
            aggregateStats: selectedTreeMetric.aggregateStats,
          }}
          position={selectedTreeMetric.position}
          onClose={clearSelectedTreeMetric}
        />
      )}
    </div>
  );
}
