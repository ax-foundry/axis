'use client';

import { Layers, Loader2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { TimeRangeSelector } from '@/components/ui/TimeRangeSelector';
import { useKpiData, useKpiSankey, useKpiTrends } from '@/lib/hooks/useKpiData';
import { formatLocalDate } from '@/lib/utils';
import { useKpiStore, useMonitoringStore } from '@/stores';

import { KPICategoryStrip } from './KPICategoryStrip';
import { KPICompositionChart } from './KPICompositionChart';
import { KPISankeyChart } from './KPISankeyChart';
import { KPITrendChart } from './KPITrendChart';

import type { KpiCategoryItem, KpiDateRange, KpiTrendPoint } from '@/types';

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

export function AgentKPISection() {
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
  const selectedSourceComponent = useKpiStore((s) => s.selectedSourceComponent);
  const setSelectedSourceComponent = useKpiStore((s) => s.setSelectedSourceComponent);
  const availableSourceComponents = useKpiStore((s) => s.availableSourceComponents);
  const kpiTimePreset = useKpiStore((s) => s.kpiTimePreset);
  const kpiTimeStart = useKpiStore((s) => s.kpiTimeStart);
  const kpiTimeEnd = useKpiStore((s) => s.kpiTimeEnd);
  const setKpiTimePreset = useKpiStore((s) => s.setKpiTimePreset);
  const setKpiTimeRange = useKpiStore((s) => s.setKpiTimeRange);
  const selectedSourceName = useMonitoringStore((s) => s.selectedSourceName);

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

  // KPIs for the card grid (excludes card-hidden ones)
  const cardKpis = useMemo(
    () => flatKpis.filter((k) => !cardHiddenKpiNames.has(k.kpi_name)),
    [flatKpis, cardHiddenKpiNames]
  );

  // Find the selected KPI item for the trend chart
  const selectedItem = useMemo(
    () => flatKpis.find((k) => k.kpi_name === selectedKpi) ?? null,
    [flatKpis, selectedKpi]
  );

  // Sankey chart data (lazy-loaded when config enables it)
  const { data: sankeyData, isLoading: sankeyLoading } = useKpiSankey(hasSankeyCharts);

  // Lazy-load trend data for the selected KPI
  const { data: trendsData, isLoading: trendsLoading } = useKpiTrends(
    selectedKpi,
    selectedKpi !== null
  );

  const trendPoints: KpiTrendPoint[] = useMemo(() => {
    if (!trendsData?.data || !selectedKpi) return [];
    return trendsData.data.filter((p) => p.kpi_name === selectedKpi);
  }, [trendsData, selectedKpi]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-white py-12">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="ml-2 text-sm text-text-muted">Loading KPI data...</span>
      </div>
    );
  }

  if (flatKpis.length === 0) return null;

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

      {/* Trend chart for selected KPI (above composition/sankey charts) */}
      {selectedKpi && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
          {trendsLoading ? (
            <div className="flex items-center justify-center rounded-lg border border-border bg-white py-8">
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
        </div>
      )}

      {/* Composition charts (optional, config-driven) */}
      {compositionCharts.length > 0 && flatKpis.length > 0 && (
        <div className="space-y-3">
          {compositionCharts.map((chart) => (
            <KPICompositionChart key={chart.title} config={chart} kpis={flatKpis} />
          ))}
        </div>
      )}

      {/* Sankey charts (optional, config-driven) */}
      {sankeyData?.charts && sankeyData.charts.length > 0 && (
        <div className="space-y-3">
          {sankeyData.charts.map((chart) => (
            <KPISankeyChart key={chart.title} chart={chart} isLoading={sankeyLoading} />
          ))}
        </div>
      )}
    </div>
  );
}
