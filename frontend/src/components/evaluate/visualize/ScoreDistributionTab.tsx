'use client';

import { useMemo } from 'react';

import { BoxChart } from '@/components/charts/box-chart';
import { ViolinChart } from '@/components/charts/violin-chart';
import { cn } from '@/lib/utils';
import { useDataStore, useUIStore } from '@/stores';
import { Columns } from '@/types';

export function ScoreDistributionTab() {
  const { data, metricColumns, format } = useDataStore();
  const { distributionChartType, setDistributionChartType, selectedMetrics, setSelectedMetrics } =
    useUIStore();

  // Get available metrics
  const availableMetrics = useMemo(() => {
    if (!data || data.length === 0) return [];

    if (format === 'tree_format' || format === 'flat_format') {
      const metrics = new Set<string>();
      data.forEach((row) => {
        const metricName = row[Columns.METRIC_NAME] as string;
        if (metricName) metrics.add(metricName);
      });
      return Array.from(metrics);
    }

    return metricColumns;
  }, [data, metricColumns, format]);

  // Initialize selected metrics if empty
  useMemo(() => {
    if (selectedMetrics.length === 0 && availableMetrics.length > 0) {
      setSelectedMetrics(availableMetrics.slice(0, 5));
    }
  }, [availableMetrics, selectedMetrics.length, setSelectedMetrics]);

  // Prepare distribution data
  const distributionData = useMemo(() => {
    if (!data || data.length === 0) return { data: [], labels: [] };

    const metricsToShow =
      selectedMetrics.length > 0
        ? selectedMetrics.filter((m) => availableMetrics.includes(m))
        : availableMetrics.slice(0, 5);

    const distributions: number[][] = [];
    const labels: string[] = [];

    if (format === 'tree_format' || format === 'flat_format') {
      metricsToShow.forEach((metric) => {
        const scores = data
          .filter((row) => row[Columns.METRIC_NAME] === metric)
          .map((row) => row[Columns.METRIC_SCORE] as number)
          .filter((s) => typeof s === 'number' && !isNaN(s));

        if (scores.length > 0) {
          distributions.push(scores);
          labels.push(metric);
        }
      });
    } else {
      metricsToShow.forEach((col) => {
        const scores = data
          .map((row) => row[col] as number)
          .filter((s) => typeof s === 'number' && !isNaN(s));

        if (scores.length > 0) {
          distributions.push(scores);
          labels.push(col);
        }
      });
    }

    return { data: distributions, labels };
  }, [data, format, availableMetrics, selectedMetrics]);

  // Handle metric selection
  const handleMetricToggle = (metric: string) => {
    if (selectedMetrics.includes(metric)) {
      setSelectedMetrics(selectedMetrics.filter((m) => m !== metric));
    } else {
      setSelectedMetrics([...selectedMetrics, metric]);
    }
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-text-muted">
        No data available. Upload evaluation data to see score distributions.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        {/* Chart Type Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted">Chart Type:</span>
          <div className="flex items-center rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => setDistributionChartType('violin')}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                distributionChartType === 'violin'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              )}
            >
              Violin
            </button>
            <button
              onClick={() => setDistributionChartType('box')}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                distributionChartType === 'box'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              )}
            >
              Box
            </button>
          </div>
        </div>

        {/* Metric count */}
        <span className="text-sm text-text-muted">
          Showing {distributionData.labels.length} of {availableMetrics.length} metrics
        </span>
      </div>

      {/* Metric Selector */}
      <div className="border-border/50 rounded-xl border bg-white p-4">
        <h4 className="mb-3 text-sm font-medium text-text-primary">Select Metrics</h4>
        <div className="flex flex-wrap gap-2">
          {availableMetrics.map((metric) => {
            const isSelected = selectedMetrics.includes(metric);
            return (
              <button
                key={metric}
                onClick={() => handleMetricToggle(metric)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-sm font-medium transition-all',
                  isSelected
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-text-secondary hover:border-primary hover:text-primary'
                )}
              >
                {metric}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="border-border/50 rounded-xl border bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-text-primary">Score Distribution</h3>
        {distributionData.data.length > 0 ? (
          <div className="h-[450px]">
            {distributionChartType === 'violin' ? (
              <ViolinChart data={distributionData.data} labels={distributionData.labels} />
            ) : (
              <BoxChart
                data={distributionData.data}
                labels={distributionData.labels}
                showPoints={true}
              />
            )}
          </div>
        ) : (
          <div className="flex h-[450px] items-center justify-center text-text-muted">
            Select at least one metric to view distribution
          </div>
        )}
      </div>
    </div>
  );
}
