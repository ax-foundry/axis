'use client';

import { useMemo } from 'react';

import { aggregateMetrics, buildHierarchy, computeNormalizedWeights } from '@/lib/scorecard-utils';
import { useDataStore, useUIStore } from '@/stores';
import { Columns } from '@/types';

import { ReportGeneratorPanel } from './ReportGeneratorPanel';
import { ReportModal } from './ReportModal';
import { ScorecardDrilldownModal } from './ScorecardDrilldownModal';
import { ScorecardKPIs } from './ScorecardKPIs';
import { ScorecardTable } from './ScorecardTable';

export function ScorecardTab() {
  const { data, format } = useDataStore();
  const {
    scorecardDrilldownMetric,
    setScorecardDrilldownMetric,
    reportModalOpen,
    openReportModal,
    closeReportModal,
  } = useUIStore();

  // Get unique test case count
  const testCaseCount = useMemo(() => {
    if (!data || data.length === 0) return 0;
    const ids = new Set<string>();
    data.forEach((row) => {
      const id = row[Columns.DATASET_ID] as string;
      if (id) ids.add(id);
    });
    return ids.size;
  }, [data]);

  // Build aggregated hierarchy
  const hierarchy = useMemo(() => {
    if (!data || data.length === 0 || !format) return new Map();

    const aggregated = aggregateMetrics(data, format);
    const built = buildHierarchy(aggregated);
    computeNormalizedWeights(built);
    return built;
  }, [data, format]);

  // Handle metric click for drill-down
  const handleMetricClick = (metricName: string) => {
    setScorecardDrilldownMetric(metricName);
  };

  // Handle close drill-down modal
  const handleCloseDrilldown = () => {
    setScorecardDrilldownMetric(null);
  };

  // Helper to get all descendant metrics (including self)
  const getMetricWithDescendants = (metricName: string): string[] => {
    const result: string[] = [metricName];
    const metric = hierarchy.get(metricName);
    if (metric && metric.childMetrics.length > 0) {
      metric.childMetrics.forEach((childName: string) => {
        result.push(...getMetricWithDescendants(childName));
      });
    }
    return result;
  };

  // Handle report generation for a specific metric (includes all descendants)
  const handleGenerateReport = (metricName?: string) => {
    if (metricName) {
      const metricsToFilter = getMetricWithDescendants(metricName);
      openReportModal(metricsToFilter);
    } else {
      openReportModal();
    }
  };

  // Empty state
  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-text-muted">
        No data available. Upload evaluation data to see the scorecard.
      </div>
    );
  }

  // Check if data is in tree/flat format
  if (format !== 'tree_format' && format !== 'flat_format') {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <p className="mb-2 text-text-muted">
          Scorecard view requires hierarchical data (tree or flat format).
        </p>
        <p className="text-sm text-text-muted">
          Try loading the &quot;tree&quot; example dataset to see the scorecard in action.
        </p>
      </div>
    );
  }

  // Empty hierarchy
  if (hierarchy.size === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-text-muted">
        No metrics found in the data.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <ScorecardKPIs hierarchy={hierarchy} testCaseCount={testCaseCount} />

      {/* Report Generator Panel */}
      <ReportGeneratorPanel hierarchy={hierarchy} testCaseCount={testCaseCount} />

      {/* Hierarchical Table */}
      <ScorecardTable
        hierarchy={hierarchy}
        showWeights={true}
        onMetricClick={handleMetricClick}
        onGenerateReport={handleGenerateReport}
      />

      {/* Drill-down Modal */}
      {scorecardDrilldownMetric && format && (
        <ScorecardDrilldownModal
          isOpen={!!scorecardDrilldownMetric}
          onClose={handleCloseDrilldown}
          metricName={scorecardDrilldownMetric}
          data={data}
          format={format}
        />
      )}

      {/* Report Modal */}
      <ReportModal isOpen={reportModalOpen} onClose={closeReportModal} />
    </div>
  );
}
