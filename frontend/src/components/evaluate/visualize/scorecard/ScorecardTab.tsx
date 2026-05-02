'use client';

import { useMemo } from 'react';

import { useFilteredEvalData } from '@/lib/hooks/useFilteredEvalData';
import { aggregateMetrics, buildHierarchy, computeNormalizedWeights } from '@/lib/scorecard-utils';
import { useDataStore, useUIStore } from '@/stores';
import { Columns } from '@/types';

import { ReportGeneratorPanel } from './ReportGeneratorPanel';
import { ReportModal } from './ReportModal';
import { ScorecardDrilldownModal } from './ScorecardDrilldownModal';
import { ScorecardKPIs } from './ScorecardKPIs';
import { ScorecardTable } from './ScorecardTable';

import type { ScorecardMetric } from '@/lib/scorecard-utils';

export function ScorecardTab() {
  const { format } = useDataStore();
  const { filteredData: data } = useFilteredEvalData();
  const {
    scorecardDrilldownMetric,
    setScorecardDrilldownMetric,
    reportModalOpen,
    openReportModal,
    closeReportModal,
  } = useUIStore();

  // Unique evaluation names in the currently visible data
  const uniqueEvalNames = useMemo(() => {
    const names = new Set<string>();
    data.forEach((row) => {
      const name = row[Columns.EXPERIMENT_NAME];
      if (name !== undefined && name !== null && name !== '') {
        names.add(String(name));
      }
    });
    return Array.from(names).sort();
  }, [data]);

  const isComparisonMode = uniqueEvalNames.length >= 2;

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

  // Build aggregated hierarchy (combined across all evaluation names — used for structure)
  const hierarchy = useMemo(() => {
    if (!data || data.length === 0 || !format) return new Map();
    const aggregated = aggregateMetrics(data, format);
    const built = buildHierarchy(aggregated);
    computeNormalizedWeights(built);
    return built;
  }, [data, format]);

  // Build per-evaluation hierarchies for comparison mode
  const evaluationHierarchies = useMemo((): Map<string, Map<string, ScorecardMetric>> | null => {
    if (!isComparisonMode || !data || data.length === 0 || !format) return null;
    const result = new Map<string, Map<string, ScorecardMetric>>();
    uniqueEvalNames.forEach((evalName) => {
      const evalData = data.filter(
        (row) => String(row[Columns.EXPERIMENT_NAME] ?? '') === evalName
      );
      const aggregated = aggregateMetrics(evalData, format);
      const built = buildHierarchy(aggregated);
      computeNormalizedWeights(built);
      result.set(evalName, built);
    });
    return result;
  }, [isComparisonMode, data, format, uniqueEvalNames]);

  const handleMetricClick = (metricName: string) => {
    setScorecardDrilldownMetric(metricName);
  };

  const handleCloseDrilldown = () => {
    setScorecardDrilldownMetric(null);
  };

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

  const handleGenerateReport = (metricName?: string) => {
    if (metricName) {
      openReportModal(getMetricWithDescendants(metricName));
    } else {
      openReportModal();
    }
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-text-muted">
        No data available. Upload evaluation data to see the scorecard.
      </div>
    );
  }

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

  if (hierarchy.size === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-text-muted">
        No metrics found in the data.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ScorecardKPIs
        hierarchy={hierarchy}
        testCaseCount={testCaseCount}
        evaluationHierarchies={evaluationHierarchies}
        evaluationNames={isComparisonMode ? uniqueEvalNames : undefined}
      />

      <ReportGeneratorPanel hierarchy={hierarchy} testCaseCount={testCaseCount} />

      <ScorecardTable
        hierarchy={hierarchy}
        evaluationHierarchies={evaluationHierarchies}
        evaluationNames={isComparisonMode ? uniqueEvalNames : undefined}
        showWeights={true}
        onMetricClick={handleMetricClick}
        onGenerateReport={handleGenerateReport}
      />

      {scorecardDrilldownMetric && format && (
        <ScorecardDrilldownModal
          isOpen={!!scorecardDrilldownMetric}
          onClose={handleCloseDrilldown}
          metricName={scorecardDrilldownMetric}
          data={data}
          format={format}
        />
      )}

      <ReportModal isOpen={reportModalOpen} onClose={closeReportModal} />
    </div>
  );
}
