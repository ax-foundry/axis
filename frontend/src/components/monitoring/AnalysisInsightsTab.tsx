'use client';

import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Loader2,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { FailingOutputDetailModal } from '@/components/monitoring/FailingOutputDetailModal';
import { pythonToJson } from '@/components/shared';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { getAnalysisInsights, getStoreData } from '@/lib/api';
import { cn } from '@/lib/utils';
import { type AnalysisRecord, type MonitoringFilters, type MonitoringRecord } from '@/types';

interface AnalysisInsightsTabProps {
  data: MonitoringRecord[];
  filters?: MonitoringFilters;
  datasetReady?: boolean;
}

type SortField = 'timestamp' | 'metric_score';

const TABLE_PAGE_SIZE = 15;

function SortableTh({
  label,
  field,
  activeField,
  direction,
  onSort,
  align,
}: {
  label: string;
  field: SortField;
  activeField: SortField;
  direction: 'asc' | 'desc';
  onSort: (field: SortField) => void;
  align?: 'right';
}) {
  const isActive = activeField === field;
  return (
    <th
      className={cn(
        'cursor-pointer select-none px-3 py-2 hover:text-text-primary',
        align === 'right' && 'text-right'
      )}
      onClick={() => onSort(field)}
    >
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'justify-end')}>
        {label}
        {isActive ? (
          direction === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowDown className="h-3 w-3 opacity-0" />
        )}
      </span>
    </th>
  );
}

/** Convert a MonitoringRecord to an AnalysisRecord for client-side rendering. */
function toAnalysisRecord(r: MonitoringRecord): AnalysisRecord {
  let signals: AnalysisRecord['signals'] = (r.signals as AnalysisRecord['signals']) ?? null;
  if (typeof signals === 'string') {
    const raw = signals;
    try {
      signals = JSON.parse(raw);
    } catch {
      try {
        signals = JSON.parse(pythonToJson(raw));
      } catch {
        // keep as string
      }
    }
  }
  return {
    dataset_id: r.dataset_id,
    timestamp: r.timestamp ?? null,
    metric_name: String(r.metric_name ?? ''),
    query: r.query ?? null,
    actual_output: r.actual_output ?? null,
    signals,
    explanation: r.explanation ?? null,
    source_info: {
      environment: r.environment ?? null,
      source_name: r.source_name ?? null,
      source_component: r.source_component ?? null,
    },
  };
}

export function AnalysisInsightsTab({
  data,
  filters,
  datasetReady = false,
}: AnalysisInsightsTabProps) {
  // Server-side state (DuckDB mode)
  const [serverRecords, setServerRecords] = useState<AnalysisRecord[]>([]);
  const [serverTotalCount, setServerTotalCount] = useState(0);
  const [serverMetricNames, setServerMetricNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Trace table state
  const [tablePage, setTablePage] = useState(1);
  const [traceSearch, setTraceSearch] = useState('');
  const [traceMetricFilter, setTraceMetricFilter] = useState('');
  const [traceSortField, setTraceSortField] = useState<'timestamp' | 'metric_score'>('timestamp');
  const [traceSortDirection, setTraceSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedRecord, setSelectedRecord] = useState<MonitoringRecord | null>(null);

  const handleSort = useCallback(
    (field: SortField) => {
      if (field === traceSortField) {
        setTraceSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setTraceSortField(field);
        setTraceSortDirection(field === 'metric_score' ? 'desc' : 'desc');
      }
    },
    [traceSortField]
  );

  // Server-side traces (DuckDB mode)
  const [serverTraces, setServerTraces] = useState<MonitoringRecord[]>([]);
  const [serverTraceTotal, setServerTraceTotal] = useState(0);
  const [tracesLoading, setTracesLoading] = useState(false);

  // ---- Client-side computation (CSV mode) ----
  const clientMetricNames = useMemo(() => {
    if (datasetReady) return [];
    const names = new Set<string>();
    data.forEach((r) => {
      if (r.metric_name) names.add(String(r.metric_name));
    });
    return Array.from(names).sort();
  }, [data, datasetReady]);

  const clientRecords = useMemo(() => {
    if (datasetReady) return [];
    return data.map(toAnalysisRecord);
  }, [data, datasetReady]);

  const clientTotalCount = datasetReady ? 0 : data.length;

  // Pick the right data source
  const records = datasetReady ? serverRecords : clientRecords;
  const totalCount = datasetReady ? serverTotalCount : clientTotalCount;
  const metricNames = datasetReady ? serverMetricNames : clientMetricNames;

  // Fetch analysis insights from server (DuckDB mode only)
  const fetchInsights = useCallback(async () => {
    if (!datasetReady) return;
    if (!filters) {
      setServerRecords([]);
      setServerTotalCount(0);
      setServerMetricNames([]);
      return;
    }

    setIsLoading(true);
    try {
      const f = filters || {};
      const response = await getAnalysisInsights(f, undefined, 1, 250);
      if (response.success) {
        setServerRecords(response.records);
        setServerTotalCount(response.total_count);
        setServerMetricNames(response.metric_names);
      }
    } catch (error) {
      console.error('Failed to fetch analysis insights:', error);
    } finally {
      setIsLoading(false);
    }
  }, [datasetReady, filters]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  // Fetch server-side traces in DuckDB mode
  useEffect(() => {
    if (!datasetReady) return;

    let cancelled = false;
    setTracesLoading(true);

    getStoreData('monitoring', {
      page: tablePage,
      page_size: TABLE_PAGE_SIZE,
      sort_by: traceSortField,
      sort_dir: traceSortDirection,
      metric_category: 'ANALYSIS',
      metric_name: traceMetricFilter || undefined,
      search: traceSearch || undefined,
      ...filters,
    })
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setServerTraces(res.data as MonitoringRecord[]);
          setServerTraceTotal(res.total);
        }
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to fetch analysis traces:', err);
      })
      .finally(() => {
        if (!cancelled) setTracesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    datasetReady,
    filters,
    tablePage,
    traceSortField,
    traceSortDirection,
    traceMetricFilter,
    traceSearch,
  ]);

  // ---- Trace table: client-side filtering/sorting/pagination ----
  const traceMetricOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [{ value: '', label: 'All Metrics' }];
    const uniqueMetrics = new Set<string>();
    data.forEach((r) => {
      if (r.metric_name) uniqueMetrics.add(String(r.metric_name));
    });
    Array.from(uniqueMetrics)
      .sort()
      .forEach((m) => options.push({ value: m, label: m }));
    return options;
  }, [data]);

  const filteredTraces = useMemo(() => {
    if (datasetReady) return serverTraces;

    let result = data;

    if (traceSearch) {
      const term = traceSearch.toLowerCase();
      result = result.filter((r) => {
        const traceId = (r.trace_id || '').toLowerCase();
        const metricName = String(r.metric_name || '').toLowerCase();
        const score = typeof r.metric_score === 'number' ? r.metric_score.toFixed(2) : '';
        const query = String(r.query || '').toLowerCase();
        const output = String(r.actual_output || '').toLowerCase();
        const explanation = String(r.explanation || '').toLowerCase();
        return (
          traceId.includes(term) ||
          metricName.includes(term) ||
          score.includes(term) ||
          query.includes(term) ||
          output.includes(term) ||
          explanation.includes(term)
        );
      });
    }

    if (traceMetricFilter) {
      result = result.filter((r) => String(r.metric_name) === traceMetricFilter);
    }

    result = [...result].sort((a, b) => {
      let va: number, vb: number;
      if (traceSortField === 'metric_score') {
        va = typeof a.metric_score === 'number' ? a.metric_score : -Infinity;
        vb = typeof b.metric_score === 'number' ? b.metric_score : -Infinity;
      } else {
        va = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        vb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      }
      return traceSortDirection === 'asc' ? va - vb : vb - va;
    });

    return result;
  }, [
    data,
    datasetReady,
    serverTraces,
    traceSearch,
    traceMetricFilter,
    traceSortField,
    traceSortDirection,
  ]);

  const traceTotal = datasetReady ? serverTraceTotal : filteredTraces.length;

  // Reset table page when trace filters change
  useEffect(() => {
    setTablePage(1);
  }, [traceSearch, traceMetricFilter, traceSortField, traceSortDirection]);

  // ---- Render ----

  if (data.length === 0 && !datasetReady) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-text-muted">
        No data available
      </div>
    );
  }

  if (isLoading && datasetReady) {
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
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-white px-4 py-3">
          <div className="text-xl font-semibold text-text-primary">
            {totalCount.toLocaleString()}
          </div>
          <div className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Total Records
          </div>
        </div>
        <div className="rounded-lg border border-border bg-white px-4 py-3">
          <div className="text-xl font-semibold text-text-primary">{metricNames.length}</div>
          <div className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Unique Metrics
          </div>
        </div>
      </div>

      {/* Analysis Traces Table */}
      <div className="rounded-lg border border-border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h3 className="text-sm font-medium text-text-primary">
            Analysis Traces
            <span className="ml-2 font-normal text-text-muted">({traceTotal} records)</span>
          </h3>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={traceSearch}
                onChange={(e) => setTraceSearch(e.target.value)}
                placeholder="Search traces..."
                className="h-[30px] w-48 rounded-md border border-border bg-white pl-7 pr-2 text-xs text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
            {/* Metric filter */}
            {traceMetricOptions.length > 2 && (
              <FilterDropdown
                value={traceMetricFilter}
                onChange={setTraceMetricFilter}
                options={traceMetricOptions}
              />
            )}
            {/* Pagination */}
            <div className="flex items-center gap-1 text-xs text-text-muted">
              <span>
                {tablePage}/{Math.max(1, Math.ceil(traceTotal / TABLE_PAGE_SIZE))}
              </span>
              <button
                onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                disabled={tablePage <= 1}
                className="rounded p-1 hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() =>
                  setTablePage((p) =>
                    Math.min(Math.max(1, Math.ceil(traceTotal / TABLE_PAGE_SIZE)), p + 1)
                  )
                }
                disabled={tablePage >= Math.ceil(traceTotal / TABLE_PAGE_SIZE)}
                className="rounded p-1 hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50/50 text-left text-[11px] font-medium uppercase tracking-wider text-text-muted">
                <th className="px-3 py-2">Trace ID</th>
                <SortableTh
                  label="Timestamp"
                  field="timestamp"
                  activeField={traceSortField}
                  direction={traceSortDirection}
                  onSort={handleSort}
                />
                <th className="px-3 py-2">Metric</th>
                <SortableTh
                  label="Score"
                  field="metric_score"
                  activeField={traceSortField}
                  direction={traceSortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <th className="px-3 py-2">Output</th>
                <th className="px-3 py-2">Explanation</th>
                <th className="px-3 py-2 text-center">Details</th>
              </tr>
            </thead>
            <tbody>
              {(datasetReady
                ? filteredTraces
                : filteredTraces.slice(
                    (tablePage - 1) * TABLE_PAGE_SIZE,
                    tablePage * TABLE_PAGE_SIZE
                  )
              ).map((record, idx) => (
                <tr
                  key={`${record.dataset_id}-${idx}`}
                  className="border-b border-border last:border-0 hover:bg-gray-50"
                >
                  <td className="px-3 py-2">
                    {record.trace_id ? (
                      <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-primary">
                        {record.trace_id.slice(0, 8)}
                      </code>
                    ) : (
                      <span className="text-xs text-text-muted">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">
                    {record.timestamp ? new Date(record.timestamp).toLocaleString() : '-'}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-text-secondary">
                      {String(record.metric_name || '-')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-text-secondary">
                    {typeof record.metric_score === 'number' ? record.metric_score.toFixed(2) : '-'}
                  </td>
                  <td className="max-w-[200px] px-3 py-2">
                    <p className="line-clamp-2 text-xs text-text-secondary">
                      {String(record.actual_output || '-')}
                    </p>
                  </td>
                  <td className="max-w-[200px] px-3 py-2">
                    <p className="line-clamp-2 text-xs text-text-secondary">
                      {String(record.explanation || '-')}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => setSelectedRecord(record)}
                      className={cn(
                        'rounded p-1 text-text-muted hover:bg-gray-100 hover:text-text-primary'
                      )}
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTraces.length === 0 && !tracesLoading && (
            <div className="py-8 text-center text-text-muted">
              {traceTotal === 0 && !traceSearch && !traceMetricFilter
                ? 'No records to display'
                : 'No traces match your search or filters'}
            </div>
          )}
          {tracesLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
        </div>
      </div>

      {/* Record Detail Modal */}
      {selectedRecord && (
        <FailingOutputDetailModal
          record={selectedRecord}
          metricName={String(selectedRecord.metric_name || 'metric')}
          metricScore={
            typeof selectedRecord.metric_score === 'number' ? selectedRecord.metric_score : 0
          }
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </div>
  );
}
