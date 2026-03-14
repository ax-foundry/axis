'use client';

import { ChevronDown, ChevronUp, Hash, Percent } from 'lucide-react';
import { useState } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';

import type { KpiSankeyChartData } from '@/types';

interface KPISankeyChartProps {
  chart: KpiSankeyChartData;
  isLoading?: boolean;
}

export function KPISankeyChart({ chart, isLoading }: KPISankeyChartProps) {
  const [expanded, setExpanded] = useState(true);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-surface py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="ml-2 text-sm text-text-muted">Loading Sankey data...</span>
      </div>
    );
  }

  const ChevronIcon = expanded ? ChevronUp : ChevronDown;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between border-b border-border px-4 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900"
      >
        <h3 className="text-sm font-medium text-text-primary">{chart.title}</h3>
        <ChevronIcon className="h-4 w-4 text-text-muted" />
      </button>

      {/* Always-visible summary KPI strip */}
      {chart.summary_kpis.length > 0 && (
        <div className="px-4 py-3">
          <div className="grid auto-cols-fr grid-flow-col items-center gap-4">
            {chart.summary_kpis.map((kpi) => {
              const Icon = kpi.unit === 'percent' ? Percent : Hash;
              const displayValue =
                kpi.unit === 'percent'
                  ? `${kpi.value}%`
                  : typeof kpi.value === 'number'
                    ? kpi.value.toLocaleString()
                    : kpi.value;
              return (
                <div key={kpi.label} className="flex items-center gap-2.5">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: kpi.color ? `${kpi.color}20` : 'rgb(var(--primary) / 0.1)',
                    }}
                  >
                    <Icon
                      className="h-4 w-4"
                      style={{ color: kpi.color || 'rgb(var(--primary))' }}
                    />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-text-primary">{displayValue}</div>
                    <div className="text-xs text-text-muted">{kpi.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expandable detail: Sankey diagram */}
      {expanded && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Column labels */}
          <div className="flex justify-between border-t border-border px-8 pt-3">
            {chart.column_labels.map((label) => (
              <span key={label} className="text-xs font-medium text-text-muted">
                {label}
              </span>
            ))}
          </div>

          {/* Sankey diagram */}
          <div className="px-2 pb-2" style={{ height: 350 }}>
            <PlotlyChart
              data={[
                {
                  type: 'sankey' as Plotly.PlotType,
                  orientation: 'h',
                  node: {
                    label: chart.nodes.map((n) => n.label),
                    color: chart.nodes.map((n) => n.color),
                    pad: 20,
                    thickness: 24,
                    line: { width: 0 },
                    hovertemplate: '<b>%{label}</b><br>Total: %{value:,.0f} cases<extra></extra>',
                  },
                  link: {
                    source: chart.links.map((l) => l.source),
                    target: chart.links.map((l) => l.target),
                    value: chart.links.map((l) => l.value),
                    color: chart.links.map((l) => l.color),
                    hovertemplate:
                      '%{source.label} → %{target.label}<br><b>%{value:,.0f} cases</b><extra></extra>',
                  },
                },
              ]}
              layout={{
                font: { family: 'Inter, system-ui, sans-serif', size: 12 },
                margin: { l: 20, r: 20, t: 10, b: 10 },
                height: 350,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
