'use client';

import { TrendingUp, CheckCircle, FileText, Activity } from 'lucide-react';
import { useMemo } from 'react';

import { BarChart } from '@/components/charts/bar-chart';
import { RadarChart } from '@/components/charts/radar-chart';
import { useFilteredEvalData } from '@/lib/hooks/useFilteredEvalData';
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
    <div className="rounded-lg border border-border bg-surface p-5">
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

function isNormalizedScore(v: unknown): v is number {
  return typeof v === 'number' && !isNaN(v) && v >= 0 && v <= 1;
}

export function OverviewTab() {
  const { metricColumns, format } = useDataStore();
  const {
    filteredData: data,
    hasMultiple,
    filteredEvaluationNames: evaluationNames,
  } = useFilteredEvalData();

  // Extract all normalized scores from a dataset slice
  const extractScores = useMemo(() => {
    return (rows: typeof data): number[] => {
      if (format === 'tree_format' || format === 'flat_format') {
        return rows.map((d) => d[Columns.METRIC_SCORE] as number).filter(isNormalizedScore);
      }
      const scores: number[] = [];
      rows.forEach((row) => {
        metricColumns.forEach((col) => {
          const val = row[col];
          if (isNormalizedScore(val)) scores.push(val);
        });
      });
      return scores;
    };
  }, [format, metricColumns]);

  // Compute per-metric averages for a dataset slice
  const extractMetricSummaries = useMemo(() => {
    return (rows: typeof data): Array<{ name: string; mean: number }> => {
      const summaries: Record<string, { sum: number; count: number }> = {};

      if (format === 'tree_format' || format === 'flat_format') {
        rows.forEach((row) => {
          const metricName = row[Columns.METRIC_NAME] as string;
          const score = row[Columns.METRIC_SCORE] as number;
          if (metricName && isNormalizedScore(score)) {
            if (!summaries[metricName]) summaries[metricName] = { sum: 0, count: 0 };
            summaries[metricName].sum += score;
            summaries[metricName].count += 1;
          }
        });
      } else {
        metricColumns.forEach((col) => {
          summaries[col] = { sum: 0, count: 0 };
          rows.forEach((row) => {
            const val = row[col];
            if (isNormalizedScore(val)) {
              summaries[col].sum += val;
              summaries[col].count += 1;
            }
          });
        });
      }

      return Object.entries(summaries)
        .filter(([, s]) => s.count > 0)
        .map(([name, s]) => ({ name, mean: s.sum / s.count }));
    };
  }, [format, metricColumns]);

  // KPI data (always aggregated across filteredData, normalized scores only)
  const kpiData = useMemo(() => {
    if (!data || data.length === 0) {
      return { averageScore: 0, passRate: 0, testCaseCount: 0, variance: 0 };
    }

    const testCaseIds = new Set(data.map((d) => d[Columns.DATASET_ID]));
    const testCaseCount = testCaseIds.size;
    const allScores = extractScores(data);

    const averageScore =
      allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;
    const passRate =
      allScores.length > 0
        ? allScores.filter((s) => s >= Thresholds.PASSING_RATE).length / allScores.length
        : 0;
    const variance =
      allScores.length > 1
        ? allScores.reduce((sum, s) => sum + Math.pow(s - averageScore, 2), 0) /
          (allScores.length - 1)
        : 0;

    return { averageScore, passRate, testCaseCount, variance };
  }, [data, extractScores]);

  // Chart data: comparison mode (per eval name) vs aggregated
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return { metrics: [], radarTraces: [], barSeries: null };

    if (hasMultiple) {
      // Split data by evaluation_name and compute per-name summaries
      const byName = new Map<string, typeof data>();
      evaluationNames.forEach((n) => byName.set(n, []));
      data.forEach((row) => {
        const name = String(row[Columns.EXPERIMENT_NAME] ?? 'Default');
        if (byName.has(name)) byName.get(name)!.push(row);
      });

      // Use the union of all metrics as the axis
      const allMetricSets = evaluationNames.map((n) =>
        extractMetricSummaries(byName.get(n) ?? []).map((m) => m.name)
      );
      const metricSet = new Set(allMetricSets.flat());
      const metrics = Array.from(metricSet).sort();

      const radarTraces = evaluationNames.map((name) => {
        const summaries = extractMetricSummaries(byName.get(name) ?? []);
        const byMetric = Object.fromEntries(summaries.map((s) => [s.name, s.mean]));
        return { name, values: metrics.map((m) => byMetric[m] ?? 0) };
      });

      const barSeries = evaluationNames.map((name) => {
        const summaries = extractMetricSummaries(byName.get(name) ?? []);
        const byMetric = Object.fromEntries(summaries.map((s) => [s.name, s.mean]));
        return { name, values: metrics.map((m) => byMetric[m] ?? 0) };
      });

      return { metrics, radarTraces, barSeries };
    }

    // Aggregated (single eval name or filtered to one)
    const summaries = extractMetricSummaries(data);
    const metrics = summaries.map((m) => m.name);
    const radarTraces = [{ name: 'Average Scores', values: summaries.map((m) => m.mean) }];

    return { metrics, radarTraces, barSeries: null };
  }, [data, hasMultiple, evaluationNames, extractMetricSummaries]);

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-text-muted">
        No data available. Upload evaluation data to see the overview.
      </div>
    );
  }

  const { metrics, radarTraces, barSeries } = chartData;
  const barLabels = metrics;
  const barValues = radarTraces[0]?.values ?? [];

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
        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-text-primary">
            {hasMultiple ? 'Metric Overview by Evaluation' : 'Metric Overview'}
          </h3>
          {metrics.length > 0 ? (
            <div className="h-[350px]">
              <RadarChart metrics={metrics} traces={radarTraces} />
            </div>
          ) : (
            <div className="flex h-[350px] items-center justify-center text-text-muted">
              No metric data available
            </div>
          )}
        </div>

        {/* Bar Chart */}
        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-text-primary">
            {hasMultiple ? 'Metric Comparison by Evaluation' : 'Metric Comparison'}
          </h3>
          {metrics.length > 0 ? (
            <div className="h-[350px]">
              {barSeries ? (
                <BarChart labels={barLabels} series={barSeries} showThresholds={true} />
              ) : (
                <BarChart
                  labels={barLabels}
                  values={barValues}
                  colorByValue={true}
                  showThresholds={true}
                />
              )}
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
