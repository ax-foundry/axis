'use client';

import { TrendingUp, CheckCircle, FileText, Activity } from 'lucide-react';
import { useMemo } from 'react';

import { BarChart } from '@/components/charts/bar-chart';
import { RadarChart } from '@/components/charts/radar-chart';
import { cn } from '@/lib/utils';
import { useDataStore } from '@/stores';
import { Columns, Thresholds } from '@/types';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: typeof TrendingUp;
  trend?: 'up' | 'down' | 'neutral';
  color: 'primary' | 'success' | 'warning' | 'info';
}

function KPICard({ title, value, subtitle, icon: Icon, color }: KPICardProps) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    info: 'bg-blue-500/10 text-blue-500',
  };

  return (
    <div className="rounded-lg border border-border bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-text-muted">{title}</p>
          <p className="mt-1 text-2xl font-bold text-text-primary">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-text-muted">{subtitle}</p>}
        </div>
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            colorClasses[color]
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export function OverviewTab() {
  const { data, metricColumns, format } = useDataStore();

  // Compute KPI data
  const kpiData = useMemo(() => {
    if (!data || data.length === 0) {
      return { averageScore: 0, passRate: 0, testCaseCount: 0, variance: 0 };
    }

    // Get unique test case IDs
    const testCaseIds = new Set(data.map((d) => d[Columns.DATASET_ID]));
    const testCaseCount = testCaseIds.size;

    // Calculate average score across all metrics
    let allScores: number[] = [];

    if (format === 'tree_format' || format === 'flat_format') {
      // For tree/flat format, extract metric scores
      allScores = data
        .map((d) => d[Columns.METRIC_SCORE] as number)
        .filter((s) => typeof s === 'number' && !isNaN(s));
    } else {
      // For simple formats, look at metric columns
      data.forEach((row) => {
        metricColumns.forEach((col) => {
          const val = row[col] as number;
          if (typeof val === 'number' && !isNaN(val)) {
            allScores.push(val);
          }
        });
      });
    }

    const averageScore =
      allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;

    const passRate =
      allScores.length > 0
        ? allScores.filter((s) => s >= Thresholds.PASSING_RATE).length / allScores.length
        : 0;

    // Calculate variance
    const mean = averageScore;
    const variance =
      allScores.length > 1
        ? allScores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / (allScores.length - 1)
        : 0;

    return { averageScore, passRate, testCaseCount, variance };
  }, [data, metricColumns, format]);

  // Compute metric summaries for radar chart
  const metricSummaries = useMemo(() => {
    if (!data || data.length === 0) return [];

    const summaries: Record<string, { sum: number; count: number }> = {};

    if (format === 'tree_format' || format === 'flat_format') {
      data.forEach((row) => {
        const metricName = row[Columns.METRIC_NAME] as string;
        const score = row[Columns.METRIC_SCORE] as number;

        if (metricName && typeof score === 'number' && !isNaN(score)) {
          if (!summaries[metricName]) {
            summaries[metricName] = { sum: 0, count: 0 };
          }
          summaries[metricName].sum += score;
          summaries[metricName].count += 1;
        }
      });
    } else {
      metricColumns.forEach((col) => {
        summaries[col] = { sum: 0, count: 0 };
        data.forEach((row) => {
          const val = row[col] as number;
          if (typeof val === 'number' && !isNaN(val)) {
            summaries[col].sum += val;
            summaries[col].count += 1;
          }
        });
      });
    }

    return Object.entries(summaries)
      .filter(([, s]) => s.count > 0)
      .map(([name, s]) => ({
        name,
        mean: s.sum / s.count,
      }));
  }, [data, metricColumns, format]);

  // Prepare radar chart data
  const radarMetrics = metricSummaries.map((m) => m.name);
  const radarTraces = [
    {
      name: 'Average Scores',
      values: metricSummaries.map((m) => m.mean),
    },
  ];

  // Prepare bar chart data
  const barLabels = metricSummaries.map((m) => m.name);
  const barValues = metricSummaries.map((m) => m.mean);

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-text-muted">
        No data available. Upload evaluation data to see the overview.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          title="Average Score"
          value={`${(kpiData.averageScore * 100).toFixed(1)}%`}
          subtitle="Across all metrics"
          icon={TrendingUp}
          color="primary"
        />
        <KPICard
          title="Pass Rate"
          value={`${(kpiData.passRate * 100).toFixed(1)}%`}
          subtitle={`Threshold: ${Thresholds.PASSING_RATE * 100}%`}
          icon={CheckCircle}
          color="success"
        />
        <KPICard
          title="Test Cases"
          value={kpiData.testCaseCount.toLocaleString()}
          subtitle="Unique evaluations"
          icon={FileText}
          color="info"
        />
        <KPICard
          title="Variance"
          value={kpiData.variance.toFixed(3)}
          subtitle="Score consistency"
          icon={Activity}
          color="warning"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Radar Chart */}
        <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-text-primary">Metric Overview</h3>
          {metricSummaries.length > 0 ? (
            <div className="h-[350px]">
              <RadarChart metrics={radarMetrics} traces={radarTraces} />
            </div>
          ) : (
            <div className="flex h-[350px] items-center justify-center text-text-muted">
              No metric data available
            </div>
          )}
        </div>

        {/* Bar Chart */}
        <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-text-primary">Metric Comparison</h3>
          {metricSummaries.length > 0 ? (
            <div className="h-[350px]">
              <BarChart
                labels={barLabels}
                values={barValues}
                colorByValue={true}
                showThresholds={true}
              />
            </div>
          ) : (
            <div className="flex h-[350px] items-center justify-center text-text-muted">
              No metric data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
