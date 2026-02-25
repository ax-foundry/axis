'use client';

import { ChevronLeft, ChevronRight, FileText, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { getAnalysisInsights } from '@/lib/api';
import { type AnalysisRecord, type MonitoringFilters, type MonitoringRecord } from '@/types';

import { AnalysisCard } from './AnalysisCard';

interface AnalysisInsightsTabProps {
  data: MonitoringRecord[];
  filters?: MonitoringFilters;
  selectedMetric: string | null;
  onMetricChange: (metric: string | null) => void;
  page: number;
  onPageChange: (page: number) => void;
}

const PAGE_SIZE = 10;

export function AnalysisInsightsTab({
  data,
  filters,
  selectedMetric,
  onMetricChange,
  page,
  onPageChange,
}: AnalysisInsightsTabProps) {
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [metricNames, setMetricNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch analysis insights
  const fetchInsights = useCallback(async () => {
    if (data.length === 0 && !filters) {
      setRecords([]);
      setTotalCount(0);
      setMetricNames([]);
      return;
    }

    setIsLoading(true);
    try {
      const f = filters || {};
      const response = await getAnalysisInsights(f, selectedMetric ?? undefined, page, PAGE_SIZE);
      if (response.success) {
        setRecords(response.records);
        setTotalCount(response.total_count);
        setMetricNames(response.metric_names);
      }
    } catch (error) {
      console.error('Failed to fetch analysis insights:', error);
    } finally {
      setIsLoading(false);
    }
  }, [data.length, filters, selectedMetric, page]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (data.length === 0 && !filters) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-text-muted">
        No data available
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (records.length === 0 && !isLoading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-sm text-text-muted">
        <FileText className="mb-3 h-12 w-12 opacity-30" />
        <p>No analysis metrics found.</p>
        <p className="mt-1 text-xs">
          Upload data with{' '}
          <code className="rounded bg-gray-100 px-1">metric_category: ANALYSIS</code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with metric filter and pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-text-primary">Recent Analysis Records</h3>
          {metricNames.length > 1 && (
            <FilterDropdown
              value={selectedMetric ?? ''}
              onChange={(v) => {
                onMetricChange(v || null);
                onPageChange(1);
              }}
              options={[
                { value: '', label: 'All Metrics' },
                ...metricNames.map((name) => ({ value: name, label: name })),
              ]}
              placeholder="All Metrics"
            />
          )}
          <span className="text-sm text-text-muted">({totalCount.toLocaleString()} records)</span>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="rounded p-1 hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="rounded p-1 hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Analysis Cards */}
      <div className="space-y-3">
        {records.map((record, index) => (
          <AnalysisCard
            key={`${record.dataset_id}-${record.metric_name}-${index}`}
            record={record}
            defaultExpanded={index === 0} // Expand first card by default
          />
        ))}
      </div>

      {/* Bottom pagination for long lists */}
      {totalPages > 1 && records.length >= 5 && (
        <div className="flex items-center justify-center gap-2 pt-4 text-sm text-text-muted">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded px-3 py-1 hover:bg-gray-100 disabled:opacity-30"
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="rounded px-3 py-1 hover:bg-gray-100 disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
