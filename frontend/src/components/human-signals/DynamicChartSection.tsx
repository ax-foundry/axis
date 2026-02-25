'use client';

import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  computeClassificationDistribution,
  computeRankedList,
  computeTextList,
  computeBooleanStat,
  computeSignalTrend,
  extractTrendSignals,
} from '@/lib/human-signals-utils';
import { cn } from '@/lib/utils';

import {
  BarChart,
  DonutChart,
  HorizontalBarChart,
  RankedListView,
  SingleStatCard,
  StackedBarChart,
  TextListView,
} from './charts';
import { SignalsTrendChart } from './SignalsTrendChart';

import type { SignalsCaseRecord, SignalsChartSection, SignalsDisplayConfig } from '@/types';

// Sections that render "always open" (no collapse toggle)
const ALWAYS_OPEN_SECTIONS = new Set(['Outcome Distribution']);

interface DynamicChartSectionProps {
  cases: SignalsCaseRecord[];
  displayConfig: SignalsDisplayConfig;
}

export function DynamicChartSection({ cases, displayConfig }: DynamicChartSectionProps) {
  const { chart_sections, color_maps } = displayConfig;

  // Trend data
  const trendSignals = useMemo(() => extractTrendSignals(displayConfig), [displayConfig]);
  const trendData = useMemo(() => computeSignalTrend(cases, trendSignals), [cases, trendSignals]);

  if (chart_sections.length === 0 && trendSignals.length === 0) return null;

  return (
    <div className="space-y-5">
      {/* Trend chart */}
      {trendData.length > 1 && (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="border-b border-border px-4 py-2">
            <h3 className="text-sm font-medium text-text-primary">Signal Trends Over Time</h3>
          </div>
          <div className="h-64 px-2 py-2">
            <SignalsTrendChart data={trendData} signals={trendSignals.map((s) => s.label)} />
          </div>
        </div>
      )}

      {/* Config-driven chart sections */}
      {chart_sections.map((section, sIdx) => (
        <ChartSectionBlock
          key={sIdx}
          section={section}
          cases={cases}
          colorMaps={color_maps || {}}
          collapsible={!ALWAYS_OPEN_SECTIONS.has(section.title)}
        />
      ))}
    </div>
  );
}

interface ChartSectionBlockProps {
  section: SignalsChartSection;
  cases: SignalsCaseRecord[];
  colorMaps: Record<string, Record<string, string>>;
  collapsible?: boolean;
}

function ChartSectionBlock({
  section,
  cases,
  colorMaps,
  collapsible = false,
}: ChartSectionBlockProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const charts = section.charts || [];
  if (charts.length === 0) return null;

  const layoutClass =
    section.layout === 'full'
      ? 'grid-cols-1'
      : section.layout === 'grid_3'
        ? 'grid-cols-1 md:grid-cols-3'
        : 'grid-cols-1 md:grid-cols-2';

  return (
    <div>
      {collapsible ? (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mb-2 flex w-full items-center gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 text-text-muted transition-transform',
              !isExpanded && '-rotate-90'
            )}
          />
          <h3 className="text-sm font-semibold text-text-primary">{section.title}</h3>
        </button>
      ) : (
        <h3 className="mb-2 text-sm font-semibold text-text-primary">{section.title}</h3>
      )}
      {isExpanded && (
        <div className={`grid gap-4 ${layoutClass}`}>
          {charts.map((chart, cIdx) => (
            <ChartCard
              key={cIdx}
              metric={chart.metric}
              signal={chart.signal}
              type={chart.type}
              title={chart.title}
              cases={cases}
              colorMaps={colorMaps}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ChartCardProps {
  metric: string;
  signal: string;
  type: string;
  title: string;
  cases: SignalsCaseRecord[];
  colorMaps: Record<string, Record<string, string>>;
}

function ChartCard({ metric, signal, type, title, cases, colorMaps }: ChartCardProps) {
  const colorMapKey = `${metric}__${signal}`;
  const colorMap = colorMaps[colorMapKey];

  const distData = useMemo(() => {
    if (type === 'ranked_list' || type === 'single_stat' || type === 'text_list') return [];
    return computeClassificationDistribution(cases, metric, signal, colorMap);
  }, [cases, metric, signal, colorMap, type]);

  const rankedData = useMemo(() => {
    if (type !== 'ranked_list') return [];
    return computeRankedList(cases, metric, signal, 8);
  }, [cases, metric, signal, type]);

  const textListData = useMemo(() => {
    if (type !== 'text_list') return [];
    return computeTextList(cases, metric, signal, 15);
  }, [cases, metric, signal, type]);

  const boolStat = useMemo(() => {
    if (type !== 'single_stat') return null;
    return computeBooleanStat(cases, metric, signal);
  }, [cases, metric, signal, type]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="border-b border-border px-4 py-2">
        <h3 className="text-sm font-medium text-text-primary">{title}</h3>
      </div>
      <div
        className={
          type === 'stacked_bar'
            ? 'px-2 py-1'
            : type === 'ranked_list' || type === 'text_list'
              ? 'max-h-72 overflow-y-auto px-2 py-2'
              : 'h-56 px-2 py-2'
        }
      >
        {type === 'bar' && <BarChart data={distData} />}
        {type === 'horizontal_bar' && <HorizontalBarChart data={distData} />}
        {type === 'donut' && <DonutChart data={distData} />}
        {type === 'stacked_bar' && <StackedBarChart data={distData} />}
        {type === 'ranked_list' && <RankedListView data={rankedData} />}
        {type === 'text_list' && <TextListView data={textListData} />}
        {type === 'single_stat' && boolStat && (
          <SingleStatCard
            label={title}
            value={`${boolStat.rate.toFixed(1)}%`}
            subtitle={`${boolStat.trueCount} of ${boolStat.total}`}
          />
        )}
      </div>
    </div>
  );
}
