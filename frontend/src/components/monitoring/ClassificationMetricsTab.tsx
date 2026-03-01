'use client';

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Eye, Loader2, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { FailingOutputDetailModal } from '@/components/monitoring/FailingOutputDetailModal';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { getClassificationBreakdown, getClassificationTrends, getStoreData } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  ChartColors,
  type ClassificationBreakdown,
  type ClassificationTrendPoint,
  type MonitoringChartGranularity,
  type MonitoringFilters,
  type MonitoringRecord,
} from '@/types';

type CategorySource = 'explanation' | 'actual_output';

interface ClassificationMetricsTabProps {
  data: MonitoringRecord[];
  filters?: MonitoringFilters;
  chartGranularity: MonitoringChartGranularity;
  datasetReady?: boolean;
}

/** Truncate a date to the given granularity bucket. */
function truncateDate(date: Date, granularity: MonitoringChartGranularity): string {
  const d = new Date(date);
  if (granularity === 'hourly') {
    d.setMinutes(0, 0, 0);
  } else if (granularity === 'weekly') {
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay()); // start of week (Sunday)
  } else {
    // daily
    d.setHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

export function ClassificationMetricsTab({
  data,
  filters,
  chartGranularity,
  datasetReady = false,
}: ClassificationMetricsTabProps) {
  // Server-side state (DuckDB mode)
  const [serverBreakdown, setServerBreakdown] = useState<ClassificationBreakdown[]>([]);
  const [serverTrendData, setServerTrendData] = useState<ClassificationTrendPoint[]>([]);
  const [serverUniqueCategories, setServerUniqueCategories] = useState<string[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [categorySource, setCategorySource] = useState<CategorySource>('explanation');
  const [trendsDisplayMode, setTrendsDisplayMode] = useState<'percentage' | 'count'>('percentage');

  // Trace table state
  const [tablePage, setTablePage] = useState(1);
  const [traceSearch, setTraceSearch] = useState('');
  const [traceMetricFilter, setTraceMetricFilter] = useState('');
  const [traceSortDirection, setTraceSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedRecord, setSelectedRecord] = useState<MonitoringRecord | null>(null);
  const tablePageSize = 10;

  // Server-side traces (DuckDB mode)
  const [serverTraces, setServerTraces] = useState<MonitoringRecord[]>([]);
  const [serverTraceTotal, setServerTraceTotal] = useState(0);
  const [tracesLoading, setTracesLoading] = useState(false);

  // ---- Client-side computation (CSV mode) ----
  const clientBreakdown = useMemo((): ClassificationBreakdown[] => {
    if (datasetReady || data.length === 0) return [];

    // Group by metric_name, count category values
    const byMetric = new Map<string, Map<string, number>>();
    data.forEach((r) => {
      const mn = String(r.metric_name ?? 'unknown');
      const catVal = String(
        categorySource === 'explanation'
          ? (r.explanation ?? r.actual_output ?? '')
          : (r.actual_output ?? '')
      );
      if (!catVal) return;
      if (!byMetric.has(mn)) byMetric.set(mn, new Map());
      const counts = byMetric.get(mn)!;
      counts.set(catVal, (counts.get(catVal) ?? 0) + 1);
    });

    const result: ClassificationBreakdown[] = [];
    Array.from(byMetric.entries()).forEach(([mn, counts]) => {
      const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
      if (total === 0) return;
      const categories = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({
          value,
          count,
          percentage: Math.round((count / total) * 1000) / 10,
        }));
      result.push({ metric_name: mn, categories, total_count: total });
    });
    return result;
  }, [data, datasetReady, categorySource]);

  const clientTrendData = useMemo((): {
    trends: ClassificationTrendPoint[];
    categories: string[];
  } => {
    if (datasetReady || !selectedMetric) return { trends: [], categories: [] };

    const filtered = data.filter((r) => String(r.metric_name) === selectedMetric);
    const bucketed = new Map<string, Map<string, number>>();
    const uniqueCats = new Set<string>();

    filtered.forEach((r) => {
      if (!r.timestamp) return;
      const catVal = String(
        categorySource === 'explanation'
          ? (r.explanation ?? r.actual_output ?? '')
          : (r.actual_output ?? '')
      );
      if (!catVal) return;
      const ts = truncateDate(new Date(r.timestamp), chartGranularity);
      uniqueCats.add(catVal);
      if (!bucketed.has(ts)) bucketed.set(ts, new Map());
      const bucket = bucketed.get(ts)!;
      bucket.set(catVal, (bucket.get(catVal) ?? 0) + 1);
    });

    const trends = Array.from(bucketed.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ts, cats]) => ({
        timestamp: ts,
        categories: Object.fromEntries(cats),
      }));

    return { trends, categories: Array.from(uniqueCats).sort() };
  }, [data, datasetReady, selectedMetric, chartGranularity, categorySource]);

  // Pick the right data source
  const breakdownData = datasetReady ? serverBreakdown : clientBreakdown;
  const trendData = datasetReady ? serverTrendData : clientTrendData.trends;
  const uniqueCategories = datasetReady ? serverUniqueCategories : clientTrendData.categories;

  // Auto-select first metric when breakdown data changes
  useEffect(() => {
    if (!selectedMetric && breakdownData.length > 0) {
      setSelectedMetric(breakdownData[0].metric_name);
    }
  }, [breakdownData, selectedMetric]);

  // Fetch breakdown data (DuckDB mode only)
  const fetchBreakdown = useCallback(async () => {
    if (!datasetReady) return;
    if (!filters) {
      setServerBreakdown([]);
      return;
    }

    setIsLoading(true);
    try {
      const f = filters || {};
      const response = await getClassificationBreakdown(f, undefined, undefined, categorySource);
      if (response.success) {
        setServerBreakdown(response.metrics);
      }
    } catch (error) {
      console.error('Failed to fetch classification breakdown:', error);
    } finally {
      setIsLoading(false);
    }
  }, [datasetReady, filters, categorySource]);

  // Fetch trend data for selected metric (DuckDB mode only)
  const fetchTrends = useCallback(async () => {
    if (!datasetReady || !selectedMetric) {
      setServerTrendData([]);
      setServerUniqueCategories([]);
      return;
    }
    if (!filters) return;

    try {
      const f = filters || {};
      const response = await getClassificationTrends(
        f,
        selectedMetric,
        chartGranularity,
        categorySource
      );
      if (response.success) {
        setServerTrendData(response.data);
        setServerUniqueCategories(response.unique_categories);
      }
    } catch (error) {
      console.error('Failed to fetch classification trends:', error);
    }
  }, [datasetReady, filters, selectedMetric, chartGranularity, categorySource]);

  useEffect(() => {
    fetchBreakdown();
  }, [fetchBreakdown]);

  useEffect(() => {
    fetchTrends();
  }, [fetchTrends]);

  // Fetch server-side traces in DuckDB mode
  useEffect(() => {
    if (!datasetReady) return;

    let cancelled = false;
    setTracesLoading(true);

    getStoreData('monitoring', {
      page: tablePage,
      page_size: tablePageSize,
      sort_by: 'timestamp',
      sort_dir: traceSortDirection,
      metric_category: 'CLASSIFICATION',
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
        if (!cancelled) console.error('Failed to fetch classification traces:', err);
      })
      .finally(() => {
        if (!cancelled) setTracesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [datasetReady, filters, tablePage, traceSortDirection, traceMetricFilter, traceSearch]);

  // Get current metric breakdown
  const currentMetricBreakdown = useMemo(() => {
    return breakdownData.find((m) => m.metric_name === selectedMetric) ?? null;
  }, [breakdownData, selectedMetric]);

  // Chart data for category distribution (horizontal bar chart)
  const distributionChartData = useMemo(() => {
    if (!currentMetricBreakdown) return [];

    const categories = currentMetricBreakdown.categories;
    const colors = categories.map((_, i) => ChartColors[i % ChartColors.length]);

    return [
      {
        type: 'bar' as const,
        y: categories.map((c) => c.value),
        x: categories.map((c) => c.percentage),
        orientation: 'h' as const,
        marker: {
          color: colors,
          opacity: 0.85,
          line: { color: 'white', width: 1 },
        },
        text: categories.map((c) => `${c.percentage.toFixed(1)}%`),
        textposition: 'inside' as const,
        textfont: { color: 'white', size: 11, family: 'Inter, system-ui' },
        insidetextanchor: 'end' as const,
        hovertemplate:
          '<b>%{y}</b><br>' +
          'Count: %{customdata[0]}<br>' +
          'Percentage: <b>%{x:.1f}%</b><extra></extra>',
        customdata: categories.map((c) => [c.count]),
      },
    ];
  }, [currentMetricBreakdown]);

  const distributionLayout = useMemo(
    () => ({
      showlegend: false,
      xaxis: {
        title: { text: 'Percentage (%)', font: { size: 11, color: '#666' } },
        autorange: true,
        gridcolor: 'rgba(0,0,0,0.05)',
        tickfont: { size: 10, color: '#666' },
        ticksuffix: '%',
      },
      yaxis: {
        automargin: true,
        tickfont: { size: 11, color: '#444' },
        ticklen: 0,
      },
      margin: { l: 100, r: 20, t: 15, b: 45 },
      plot_bgcolor: 'rgba(0,0,0,0)',
      paper_bgcolor: 'rgba(0,0,0,0)',
      hoverlabel: {
        bgcolor: 'white',
        bordercolor: 'rgba(0,0,0,0.1)',
        font: { size: 11, family: 'Inter, system-ui' },
      },
    }),
    []
  );

  // Chart data for trends (stacked area chart)
  const trendsChartData = useMemo(() => {
    if (trendData.length === 0 || uniqueCategories.length === 0) return [];

    return uniqueCategories.map((category, i) => ({
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: category,
      x: trendData.map((t) => t.timestamp),
      y: trendData.map((t) => t.categories[category] ?? 0),
      stackgroup: 'one',
      ...(trendsDisplayMode === 'percentage' ? { groupnorm: 'percent' as const } : {}),
      fillcolor: `${ChartColors[i % ChartColors.length]}80`,
      line: {
        color: ChartColors[i % ChartColors.length],
        width: 1,
      },
      hovertemplate:
        trendsDisplayMode === 'percentage'
          ? `<b>${category}</b><br>` +
            '%{x|%Y-%m-%d %H:%M}<br>' +
            'Percentage: <b>%{y:.1f}%</b><extra></extra>'
          : `<b>${category}</b><br>` +
            '%{x|%Y-%m-%d %H:%M}<br>' +
            'Count: <b>%{y}</b><extra></extra>',
    }));
  }, [trendData, uniqueCategories, trendsDisplayMode]);

  const trendsLayout = useMemo(
    () => ({
      showlegend: true,
      legend: {
        orientation: 'h' as const,
        y: -0.2,
        x: 0.5,
        xanchor: 'center' as const,
        font: { size: 10, color: '#666' },
        bgcolor: 'rgba(255,255,255,0.8)',
      },
      xaxis: {
        type: 'date' as const,
        gridcolor: 'rgba(0,0,0,0.05)',
        tickfont: { size: 10, color: '#666' },
        tickformat: chartGranularity === 'hourly' ? '%H:%M' : '%m/%d',
        zeroline: false,
        showline: true,
        linecolor: 'rgba(0,0,0,0.1)',
      },
      yaxis: {
        title: {
          text: trendsDisplayMode === 'percentage' ? 'Percentage (%)' : 'Count',
          font: { size: 11, color: '#666' },
        },
        gridcolor: 'rgba(0,0,0,0.05)',
        tickfont: { size: 10, color: '#666' },
        zeroline: true,
        zerolinecolor: 'rgba(0,0,0,0.1)',
        ...(trendsDisplayMode === 'percentage' ? { ticksuffix: '%' } : {}),
      },
      margin: { l: 60, r: 20, t: 15, b: 60 },
      plot_bgcolor: 'rgba(0,0,0,0)',
      paper_bgcolor: 'rgba(0,0,0,0)',
      hovermode: 'x unified' as const,
      hoverlabel: {
        bgcolor: 'white',
        bordercolor: 'rgba(0,0,0,0.1)',
        font: { size: 11, family: 'Inter, system-ui' },
      },
    }),
    [chartGranularity, trendsDisplayMode]
  );

  // Metric filter options for trace table
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

  // Filtered + sorted classification traces
  const filteredTraces = useMemo(() => {
    // DuckDB mode: server handles filtering, sorting, pagination
    if (datasetReady) return serverTraces;

    let result = data;

    // Search filter
    if (traceSearch) {
      const term = traceSearch.toLowerCase();
      result = result.filter((r) => {
        const traceId = (r.trace_id || '').toLowerCase();
        const query = String(r.query || '').toLowerCase();
        const output = String(r.actual_output || '').toLowerCase();
        const explanation = String(r.explanation || '').toLowerCase();
        return (
          traceId.includes(term) ||
          query.includes(term) ||
          output.includes(term) ||
          explanation.includes(term)
        );
      });
    }

    // Metric filter
    if (traceMetricFilter) {
      result = result.filter((r) => String(r.metric_name) === traceMetricFilter);
    }

    // Sort by timestamp
    result = [...result].sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return traceSortDirection === 'asc' ? ta - tb : tb - ta;
    });

    return result;
  }, [data, datasetReady, serverTraces, traceSearch, traceMetricFilter, traceSortDirection]);

  // Total count for pagination
  const traceTotal = datasetReady ? serverTraceTotal : filteredTraces.length;

  // Reset table page when trace filters change
  useEffect(() => {
    setTablePage(1);
  }, [traceSearch, traceMetricFilter, traceSortDirection]);

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

  if (breakdownData.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-sm text-text-muted">
        <p>No classification metrics found.</p>
        <p className="mt-1 text-xs">
          Upload data with{' '}
          <code className="rounded bg-gray-100 px-1">metric_category: CLASSIFICATION</code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Category Source Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-muted">Group by:</span>
          <div className="flex rounded-lg border border-border bg-gray-50 p-0.5">
            <button
              onClick={() => setCategorySource('explanation')}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                categorySource === 'explanation'
                  ? 'bg-white text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              )}
            >
              Explanation
            </button>
            <button
              onClick={() => setCategorySource('actual_output')}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                categorySource === 'actual_output'
                  ? 'bg-white text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              )}
            >
              Output
            </button>
          </div>
        </div>
      </div>

      {/* Summary and Metric Selector */}
      <div className="grid grid-cols-2 gap-6">
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-text-primary">Classification Summary</h3>
            <FilterDropdown
              value={selectedMetric ?? ''}
              onChange={(v) => setSelectedMetric(v || null)}
              options={breakdownData.map((m) => ({
                value: m.metric_name,
                label: m.metric_name,
              }))}
              placeholder="Select metric"
            />
          </div>
          {currentMetricBreakdown && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium text-text-muted">Total Records</p>
                  <p className="text-xl font-bold text-text-primary">
                    {currentMetricBreakdown.total_count.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium text-text-muted">Unique Categories</p>
                  <p className="text-xl font-bold text-text-primary">
                    {currentMetricBreakdown.categories.length}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Category Distribution Bar Chart */}
        <div className="card">
          <h3 className="mb-4 font-semibold text-text-primary">Category Distribution</h3>
          <div className="h-48">
            {distributionChartData.length > 0 ? (
              <PlotlyChart data={distributionChartData} layout={distributionLayout} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-text-muted">
                No distribution data
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Value Counts Table and Trends */}
      <div className="grid grid-cols-2 gap-6">
        {/* Value Counts Table */}
        <div className="card">
          <h3 className="mb-4 font-semibold text-text-primary">Value Counts</h3>
          <div className="max-h-64 overflow-y-auto">
            {currentMetricBreakdown ? (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-border text-left text-xs font-medium uppercase text-text-muted">
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2 text-right">Count</th>
                    <th className="px-3 py-2 text-right">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {currentMetricBreakdown.categories.map((cat, i) => (
                    <tr
                      key={cat.value}
                      className="border-b border-border last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: ChartColors[i % ChartColors.length] }}
                          />
                          <span className="font-medium">{cat.value}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {cat.count.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {cat.percentage.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-8 text-center text-sm text-text-muted">No data available</div>
            )}
          </div>
        </div>

        {/* Trends Chart */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-text-primary">Trends by Category</h3>
            <div className="flex rounded-lg border border-border bg-gray-50 p-0.5">
              <button
                onClick={() => setTrendsDisplayMode('percentage')}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  trendsDisplayMode === 'percentage'
                    ? 'bg-white text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-primary'
                )}
              >
                Percentage
              </button>
              <button
                onClick={() => setTrendsDisplayMode('count')}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  trendsDisplayMode === 'count'
                    ? 'bg-white text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-primary'
                )}
              >
                Count
              </button>
            </div>
          </div>
          <div className="h-64">
            {trendsChartData.length > 0 ? (
              <PlotlyChart data={trendsChartData} layout={trendsLayout} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-text-muted">
                No trend data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section Divider */}
      <div className="relative mt-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-3 text-xs font-medium uppercase tracking-wider text-text-muted">
            All Traces
          </span>
        </div>
      </div>

      {/* Classification Traces Table */}
      <div className="rounded-lg border border-border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h3 className="text-sm font-medium text-text-primary">
            Classification Traces
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
            {/* Sort direction */}
            <button
              onClick={() => setTraceSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:bg-gray-50 hover:text-text-primary"
              title={traceSortDirection === 'asc' ? 'Ascending' : 'Descending'}
            >
              {traceSortDirection === 'asc' ? (
                <ArrowUp className="h-3.5 w-3.5" />
              ) : (
                <ArrowDown className="h-3.5 w-3.5" />
              )}
            </button>
            {/* Pagination */}
            <div className="flex items-center gap-1 text-xs text-text-muted">
              <span>
                {tablePage}/{Math.max(1, Math.ceil(traceTotal / tablePageSize))}
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
                    Math.min(Math.max(1, Math.ceil(traceTotal / tablePageSize)), p + 1)
                  )
                }
                disabled={tablePage >= Math.ceil(traceTotal / tablePageSize)}
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
                <th
                  className="cursor-pointer select-none px-3 py-2 hover:text-text-primary"
                  onClick={() => setTraceSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
                >
                  <span className="inline-flex items-center gap-1">
                    Timestamp
                    {traceSortDirection === 'asc' ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )}
                  </span>
                </th>
                <th className="px-3 py-2">Metric</th>
                <th className="px-3 py-2">Explanation</th>
                <th className="px-3 py-2">Output</th>
                <th className="px-3 py-2 text-center">Details</th>
              </tr>
            </thead>
            <tbody>
              {(datasetReady
                ? filteredTraces
                : filteredTraces.slice((tablePage - 1) * tablePageSize, tablePage * tablePageSize)
              ).map((record, idx) => (
                <tr
                  key={`${record.dataset_id}-${idx}`}
                  className="border-b border-border last:border-0 hover:bg-gray-50"
                >
                  <td className="px-3 py-2">
                    {record.trace_id ? (
                      <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-primary">
                        {record.trace_id.slice(0, 8)}...
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
                  <td className="max-w-[200px] px-3 py-2">
                    <p className="line-clamp-2 text-xs text-text-secondary">
                      {String(record.explanation || '-')}
                    </p>
                  </td>
                  <td className="max-w-[200px] px-3 py-2">
                    <p className="line-clamp-2 text-xs text-text-secondary">
                      {String(record.actual_output || '-')}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => setSelectedRecord(record)}
                      className="rounded p-1 text-text-muted hover:bg-gray-100 hover:text-text-primary"
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
