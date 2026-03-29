'use client';

import { BarChart3, Layers, List, Loader2, TrendingUp, X } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';

import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { TimeRangeSelector } from '@/components/ui/TimeRangeSelector';
import { useKpiData, useKpiSankey, useKpiTrends } from '@/lib/hooks/useKpiData';
import { cn, formatLocalDate } from '@/lib/utils';
import { useKpiStore } from '@/stores';

import { KPICaseProfileModal } from './KPICaseProfileModal';
import { KPICategoryStrip } from './KPICategoryStrip';
import { KPICompositionChart } from './KPICompositionChart';
import { KPIDistributionChart } from './KPIDistributionChart';
import { KPIDrillDownTable } from './KPIDrillDownTable';
import { KPISankeyChart } from './KPISankeyChart';
import { KPISegmentComparisonChart } from './KPISegmentComparisonChart';
import { KPITrendChart } from './KPITrendChart';

import type { KpiCategoryItem, KpiDateRange, KpiTrendPoint } from '@/types';

const CHART_TABS = [
  { key: 'trend' as const, label: 'Trend', icon: TrendingUp },
  { key: 'distribution' as const, label: 'Distribution', icon: BarChart3 },
  { key: 'segments' as const, label: 'Segments', icon: Layers },
];

const KPI_TIME_PRESETS = [
  { value: 'all', label: 'All time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom range' },
];

function formatDateRange(range: KpiDateRange): string {
  const toDate = (s: string) => new Date(s.slice(0, 10) + 'T00:00:00');
  const fmt = (s: string) =>
    toDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const start = fmt(range.min_date);
  const end = fmt(range.max_date);
  const days = Math.round(
    (toDate(range.max_date).getTime() - toDate(range.min_date).getTime()) / 86_400_000
  );
  return `${start} – ${end} · ${days} day${days !== 1 ? 's' : ''}`;
}

/** KPI item enriched with its category metadata */
export interface FlatKpiItem extends KpiCategoryItem {
  categorySlug: string;
  categoryName: string;
  categoryIcon: string;
}

interface AgentKPISectionProps {
  /** When true, skip internal loading spinner and empty-state null return — let the parent page own those states */
  hideInternalLoadingStates?: boolean;
  /** 'summary' shows only production_kpis subset (Production page), 'detail' shows all (KPI page). Default: 'detail'. */
  viewMode?: 'summary' | 'detail';
}

export function AgentKPISection({
  hideInternalLoadingStates = false,
  viewMode = 'detail',
}: AgentKPISectionProps) {
  const { categories, dateRange, isLoading } = useKpiData();
  const selectedKpi = useKpiStore((s) => s.selectedKpi);
  const selectKpi = useKpiStore((s) => s.selectKpi);
  const selectedSegment = useKpiStore((s) => s.selectedSegment);
  const setSelectedSegment = useKpiStore((s) => s.setSelectedSegment);
  const availableSegments = useKpiStore((s) => s.availableSegments);
  const kpiOrder = useKpiStore((s) => s.kpiOrder);
  const compositionCharts = useKpiStore((s) => s.compositionCharts);
  const hasSankeyCharts = useKpiStore((s) => s.hasSankeyCharts);
  const cardHiddenKpiNames = useKpiStore((s) => s.cardHiddenKpiNames);
  const productionKpiNames = useKpiStore((s) => s.productionKpiNames);
  const selectedSourceComponent = useKpiStore((s) => s.selectedSourceComponent);
  const setSelectedSourceComponent = useKpiStore((s) => s.setSelectedSourceComponent);
  const availableSourceComponents = useKpiStore((s) => s.availableSourceComponents);
  const kpiTimePreset = useKpiStore((s) => s.kpiTimePreset);
  const kpiTimeStart = useKpiStore((s) => s.kpiTimeStart);
  const kpiTimeEnd = useKpiStore((s) => s.kpiTimeEnd);
  const setKpiTimePreset = useKpiStore((s) => s.setKpiTimePreset);
  const setKpiTimeRange = useKpiStore((s) => s.setKpiTimeRange);
  const selectedSourceName = useKpiStore((s) => s.selectedSourceName);
  const drillDownOpen = useKpiStore((s) => s.drillDownOpen);
  const setDrillDownOpen = useKpiStore((s) => s.setDrillDownOpen);
  const setDrillDownDateFilter = useKpiStore((s) => s.setDrillDownDateFilter);
  const caseProfileDatasetId = useKpiStore((s) => s.caseProfileDatasetId);
  const setCaseProfileDatasetId = useKpiStore((s) => s.setCaseProfileDatasetId);
  const chartViewMode = useKpiStore((s) => s.chartViewMode);
  const setChartViewMode = useKpiStore((s) => s.setChartViewMode);

  const handleDateClick = useCallback(
    (date: string) => {
      setDrillDownDateFilter(date);
      setDrillDownOpen(true);
    },
    [setDrillDownDateFilter, setDrillDownOpen]
  );

  const dateLabel = useMemo(() => (dateRange ? formatDateRange(dateRange) : null), [dateRange]);

  const segmentOptions = useMemo(
    () => [
      { value: '', label: 'All Segments' },
      ...availableSegments.map((s) => ({ value: s, label: s })),
    ],
    [availableSegments]
  );

  const componentOptions = useMemo(
    () => availableSourceComponents.map((c) => ({ value: c, label: c })),
    [availableSourceComponents]
  );

  // Auto-select first source_component when available (no "All" option)
  useEffect(() => {
    if (availableSourceComponents.length > 0 && !selectedSourceComponent) {
      setSelectedSourceComponent(availableSourceComponents[0]);
    }
  }, [availableSourceComponents, selectedSourceComponent, setSelectedSourceComponent]);

  // Resolve effective KPI order: per-source list > global _default > alphabetical fallback
  const effectiveOrder = useMemo(() => {
    if (selectedSourceName && kpiOrder[selectedSourceName]) return kpiOrder[selectedSourceName];
    if (kpiOrder._default) return kpiOrder._default;
    return null;
  }, [kpiOrder, selectedSourceName]);

  // Flatten all categories into one list, sorted by config-defined order
  const flatKpis: FlatKpiItem[] = useMemo(() => {
    const items = categories.flatMap((panel) =>
      panel.kpis.map((kpi) => ({
        ...kpi,
        categorySlug: panel.category,
        categoryName: panel.display_name,
        categoryIcon: panel.icon,
      }))
    );
    if (effectiveOrder && effectiveOrder.length > 0) {
      const orderIndex = new Map(effectiveOrder.map((name, i) => [name, i]));
      return items.sort((a, b) => {
        const ai = orderIndex.get(a.kpi_name) ?? effectiveOrder.length;
        const bi = orderIndex.get(b.kpi_name) ?? effectiveOrder.length;
        if (ai !== bi) return ai - bi;
        return a.kpi_name.localeCompare(b.kpi_name);
      });
    }
    return items.sort((a, b) => {
      if (a.categorySlug !== b.categorySlug) return a.categorySlug.localeCompare(b.categorySlug);
      return a.kpi_name.localeCompare(b.kpi_name);
    });
  }, [categories, effectiveOrder]);

  // Auto-reset segment filter when it's no longer valid for the current source_component
  useEffect(() => {
    if (
      selectedSegment &&
      availableSegments.length > 0 &&
      !availableSegments.includes(selectedSegment)
    ) {
      setSelectedSegment('');
    }
  }, [availableSegments, selectedSegment, setSelectedSegment]);

  // KPIs for the card grid:
  // - Always exclude card-hidden KPIs
  // - In summary mode (Production page), further filter to production_kpis subset (if configured)
  const cardKpis = useMemo(() => {
    let filtered = flatKpis.filter((k) => !cardHiddenKpiNames.has(k.kpi_name));
    if (viewMode === 'summary' && productionKpiNames.size > 0) {
      filtered = filtered.filter((k) => productionKpiNames.has(k.kpi_name));
    }
    return filtered;
  }, [flatKpis, cardHiddenKpiNames, viewMode, productionKpiNames]);

  // Find the selected KPI item for the trend chart
  const selectedItem = useMemo(
    () => flatKpis.find((k) => k.kpi_name === selectedKpi) ?? null,
    [flatKpis, selectedKpi]
  );

  // Sankey chart data (lazy-loaded when config enables it, skipped in summary mode)
  const { data: sankeyData, isLoading: sankeyLoading } = useKpiSankey(
    hasSankeyCharts && viewMode !== 'summary'
  );

  // Lazy-load trend data for the selected KPI
  const { data: trendsData, isLoading: trendsLoading } = useKpiTrends(
    selectedKpi,
    selectedKpi !== null
  );

  const trendPoints: KpiTrendPoint[] = useMemo(() => {
    if (!trendsData?.data || !selectedKpi) return [];
    return trendsData.data.filter((p) => p.kpi_name === selectedKpi);
  }, [trendsData, selectedKpi]);

  if (!hideInternalLoadingStates) {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center rounded-lg border border-border bg-surface py-12">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-text-muted">Loading KPI data...</span>
        </div>
      );
    }

    if (flatKpis.length === 0) return null;
  }

  return (
    <div className="space-y-3">
      {/* Filters + time range selector */}
      <div className="flex items-center justify-end gap-2">
        {availableSourceComponents.length > 1 && (
          <FilterDropdown
            value={selectedSourceComponent}
            onChange={setSelectedSourceComponent}
            options={componentOptions}
            placeholder="All Components"
          />
        )}
        {availableSegments.length > 1 && (
          <div className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-text-muted" />
            <FilterDropdown
              value={selectedSegment}
              onChange={setSelectedSegment}
              options={segmentOptions}
              placeholder="All Segments"
            />
          </div>
        )}
        <TimeRangeSelector
          presets={KPI_TIME_PRESETS}
          selectedPreset={kpiTimePreset}
          startDate={kpiTimeStart ?? formatLocalDate(new Date())}
          endDate={kpiTimeEnd ?? formatLocalDate(new Date())}
          onPresetChange={setKpiTimePreset}
          onCustomChange={setKpiTimeRange}
          summaryLabel={dateLabel ?? undefined}
        />
      </div>

      {/* Flat KPI card grid (hidden KPIs filtered out) */}
      {cardKpis.length > 0 && (
        <KPICategoryStrip kpis={cardKpis} selectedKpi={selectedKpi} onSelectKpi={selectKpi} />
      )}

      {/* Chart area for selected KPI */}
      {selectedKpi && (
        <div className="animate-in fade-in slide-in-from-top-2 space-y-3 duration-200">
          {viewMode === 'detail' ? (
            /* Detail mode: tabbed container with Trend / Distribution / Segments */
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              {/* Header: title + tabs + close */}
              <div className="flex items-center justify-between border-b border-border px-4 py-2">
                <h3 className="text-sm font-medium text-text-primary">
                  {selectedItem?.display_name ?? selectedKpi}
                </h3>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
                    {CHART_TABS.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = chartViewMode === tab.key;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => setChartViewMode(tab.key)}
                          className={cn(
                            'flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all',
                            isActive
                              ? 'bg-white text-text-primary shadow-sm dark:bg-gray-700'
                              : 'text-text-muted hover:text-text-primary'
                          )}
                        >
                          <Icon className="h-3 w-3" />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => selectKpi(selectedKpi)}
                    className="rounded p-1 text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary dark:hover:bg-gray-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Chart content */}
              <div className="px-2 py-2">
                {chartViewMode === 'trend' && (
                  <>
                    {trendsLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        <span className="ml-2 text-sm text-text-muted">Loading trend...</span>
                      </div>
                    ) : (
                      <KPITrendChart
                        displayName={selectedItem?.display_name ?? selectedKpi}
                        unit={selectedItem?.unit ?? 'score'}
                        data={trendPoints}
                        onDateClick={handleDateClick}
                      />
                    )}
                  </>
                )}
                {chartViewMode === 'distribution' && (
                  <KPIDistributionChart
                    kpiName={selectedKpi}
                    displayName={selectedItem?.display_name ?? selectedKpi}
                    unit={selectedItem?.unit ?? 'score'}
                  />
                )}
                {chartViewMode === 'segments' && (
                  <KPISegmentComparisonChart
                    kpiName={selectedKpi}
                    displayName={selectedItem?.display_name ?? selectedKpi}
                    unit={selectedItem?.unit ?? 'score'}
                  />
                )}
              </div>
            </div>
          ) : (
            /* Summary mode: just the trend chart with its own close button */
            <>
              {trendsLoading ? (
                <div className="flex items-center justify-center rounded-lg border border-border bg-surface py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="ml-2 text-sm text-text-muted">Loading trend...</span>
                </div>
              ) : (
                <KPITrendChart
                  displayName={selectedItem?.display_name ?? selectedKpi}
                  unit={selectedItem?.unit ?? 'score'}
                  data={trendPoints}
                  onClose={() => selectKpi(selectedKpi)}
                />
              )}
            </>
          )}

          {/* View Cases toggle (detail mode only) */}
          {viewMode === 'detail' && (
            <button
              onClick={() => setDrillDownOpen(!drillDownOpen)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                drillDownOpen
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-muted hover:bg-gray-100 hover:text-text-primary dark:hover:bg-gray-800'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              {drillDownOpen ? 'Hide Cases' : 'View Cases'}
            </button>
          )}

          {/* Drill-down table (detail mode only) */}
          {viewMode === 'detail' && drillDownOpen && selectedItem && (
            <KPIDrillDownTable
              kpiName={selectedKpi}
              displayName={selectedItem.display_name}
              unit={selectedItem.unit}
            />
          )}
        </div>
      )}

      {/* Composition charts (optional, config-driven) — hidden in summary mode */}
      {viewMode !== 'summary' && compositionCharts.length > 0 && flatKpis.length > 0 && (
        <div className="space-y-3">
          {compositionCharts.map((chart) => (
            <KPICompositionChart key={chart.title} config={chart} kpis={flatKpis} />
          ))}
        </div>
      )}

      {/* Sankey charts (optional, config-driven) — hidden in summary mode */}
      {viewMode !== 'summary' && sankeyData?.charts && sankeyData.charts.length > 0 && (
        <div className="space-y-3">
          {sankeyData.charts.map((chart) => (
            <KPISankeyChart key={chart.title} chart={chart} isLoading={sankeyLoading} />
          ))}
        </div>
      )}

      {/* Case profile modal */}
      {caseProfileDatasetId && (
        <KPICaseProfileModal
          datasetId={caseProfileDatasetId}
          onClose={() => setCaseProfileDatasetId(null)}
        />
      )}
    </div>
  );
}
