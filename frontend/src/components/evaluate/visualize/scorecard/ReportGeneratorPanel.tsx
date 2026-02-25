'use client';

import { FileText, Sparkles } from 'lucide-react';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';
import { useDataStore, useUIStore } from '@/stores';

import type { ScorecardMetric } from '@/lib/scorecard-utils';

interface ReportGeneratorPanelProps {
  hierarchy: Map<string, ScorecardMetric>;
  testCaseCount: number;
  className?: string;
}

export function ReportGeneratorPanel({
  hierarchy,
  testCaseCount,
  className,
}: ReportGeneratorPanelProps) {
  const { metricColumns, componentColumns } = useDataStore();
  const { reportScoreThreshold, openReportModal } = useUIStore();

  // Calculate quick stats based on actual metrics (not components)
  const stats = useMemo(() => {
    // Filter hierarchy to only include actual metrics (type === 'metric')
    const metrics = Array.from(hierarchy.values()).filter((m) => m.type === 'metric');
    const lowScoringCount = metrics.filter((m) => m.avgScore < reportScoreThreshold).length;
    const highScoringCount = metrics.filter((m) => m.avgScore >= reportScoreThreshold).length;

    return { lowScoringCount, highScoringCount };
  }, [hierarchy, reportScoreThreshold]);

  return (
    <div className={cn('border-border/50 rounded-xl border bg-white shadow-sm', className)}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-text-primary">AI Report Generation</h3>
            <p className="text-xs text-text-muted">
              {metricColumns.length} metrics • {componentColumns.length} components •{' '}
              {testCaseCount} test cases •
              <span className="text-error"> {stats.lowScoringCount} low</span> /
              <span className="text-success"> {stats.highScoringCount} high</span>
            </p>
          </div>
        </div>

        <button
          onClick={() => openReportModal()}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
        >
          <Sparkles className="h-4 w-4" />
          Generate Report
        </button>
      </div>
    </div>
  );
}
