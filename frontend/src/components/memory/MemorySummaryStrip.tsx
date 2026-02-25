'use client';

import { AlertTriangle, BookOpen, Brain, OctagonX, Shield } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';

import { useFilteredMemoryData } from '@/lib/hooks/useFilteredMemoryData';
import { getField, useMemoryConfig } from '@/lib/hooks/useMemoryConfig';
import { useChartColors } from '@/lib/theme';
import { useMemoryStore } from '@/stores/memory-store';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

function titleCase(str: string): string {
  return str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function ChartContainer({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="border-b border-border px-4 py-2">
        <h3 className="text-sm font-medium text-text-primary">{title}</h3>
      </div>
      <div className="px-2 py-2">{children}</div>
    </div>
  );
}

export function MemorySummaryStrip() {
  const { summary } = useMemoryStore();
  const data = useFilteredMemoryData();
  const chartColors = useChartColors();
  const { data: config } = useMemoryConfig();

  // Build contradictory pairs set from config
  const contradictoryPairsSet = useMemo(() => {
    const pairs = config?.contradictory_pairs ?? [];
    const set = new Set<string>();
    for (const [a, b] of pairs) {
      set.add(`${a}|${b}`);
      set.add(`${b}|${a}`);
    }
    return set;
  }, [config]);

  // Compute conflicts from store data
  const conflicts = useMemo(() => {
    const groups: Record<string, Array<{ rule_name: string; action: string }>> = {};
    for (const rule of data) {
      const rf = getField(rule, 'group_by');
      if (rf) {
        if (!groups[rf]) groups[rf] = [];
        groups[rf].push({ rule_name: getField(rule, 'name'), action: getField(rule, 'action') });
      }
    }

    const result: Array<{
      risk_factor: string;
      conflicting_rules: Array<{ rule_name: string; action: string }>;
      description: string;
    }> = [];

    for (const [rf, rules] of Object.entries(groups)) {
      const actions = new Set(rules.map((r) => r.action));
      if (actions.size < 2) continue;

      let hasConflict = false;
      const actionsArr = Array.from(actions);
      for (let i = 0; i < actionsArr.length && !hasConflict; i++) {
        for (let j = i + 1; j < actionsArr.length && !hasConflict; j++) {
          if (contradictoryPairsSet.has(`${actionsArr[i]}|${actionsArr[j]}`)) {
            hasConflict = true;
          }
        }
      }

      if (hasConflict) {
        result.push({
          risk_factor: rf,
          conflicting_rules: rules,
          description: `Risk factor '${rf}' has contradictory actions: ${Array.from(actions).sort().join(', ')}`,
        });
      }
    }

    return { data: result, has_conflicts: result.length > 0 };
  }, [data, contradictoryPairsSet]);

  if (!summary) return null;

  const cards = [
    { label: 'Rules', value: summary.rules_count, icon: BookOpen },
    { label: 'Risk Factors', value: summary.risk_factors_count, icon: Brain },
    { label: 'Mitigants', value: summary.mitigants_count, icon: Shield },
    { label: 'Hard Stops', value: summary.hard_stops_count, icon: OctagonX },
  ];

  const axisConfig = {
    showgrid: true,
    gridcolor: 'rgba(0,0,0,0.05)',
    zeroline: false,
    showline: true,
    linecolor: 'rgba(0,0,0,0.1)',
    tickfont: { size: 10 },
  };

  return (
    <div className="space-y-4">
      {/* Compact Inline KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-[18px] w-[18px] text-primary" />
              </div>
              <div>
                <div className="text-xl font-bold text-text-primary">{card.value}</div>
                <div className="text-xs text-text-muted">{card.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartContainer title="Rules by Action">
          {(() => {
            const sorted = [...summary.rules_by_action].sort((a, b) => a.count - b.count);
            const maxCount = Math.max(...sorted.map((a) => a.count), 1);
            return (
              <Plot
                data={[
                  {
                    type: 'bar' as const,
                    y: sorted.map((a) => titleCase(a.action)),
                    x: sorted.map((a) => a.count),
                    orientation: 'h' as const,
                    marker: {
                      color: sorted.map((_, i) => chartColors[i % chartColors.length]),
                      line: { width: 0 },
                    },
                    text: sorted.map((a) => `  ${a.count}`),
                    textposition: 'outside' as const,
                    textfont: {
                      size: 11,
                      color: '#2C3E50',
                      family: 'Inter, system-ui, sans-serif',
                    },
                    hovertemplate:
                      '<b>%{y}</b><br>%{x} rule' + (maxCount > 1 ? 's' : '') + '<extra></extra>',
                    cliponaxis: false,
                  },
                ]}
                layout={{
                  height: Math.max(160, sorted.length * 24 + 30),
                  margin: { l: 10, r: 45, t: 5, b: 10 },
                  paper_bgcolor: 'transparent',
                  plot_bgcolor: 'transparent',
                  font: { family: 'Inter, system-ui, sans-serif', size: 11 },
                  xaxis: {
                    ...axisConfig,
                    showgrid: false,
                    showline: false,
                    showticklabels: false,
                    range: [0, maxCount * 1.2],
                  },
                  yaxis: {
                    ...axisConfig,
                    automargin: true,
                    showline: false,
                    showgrid: false,
                    tickfont: { size: 11, color: '#2C3E50' },
                  },
                  bargap: 0.15,
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%' }}
              />
            );
          })()}
        </ChartContainer>

        <ChartContainer title="Rules by Product">
          {(() => {
            const filtered = summary.rules_by_product.filter(
              (p) => p.product.toLowerCase() !== 'all'
            );
            const sorted = [...filtered].sort((a, b) => b.count - a.count);
            const total = sorted.reduce((sum, p) => sum + p.count, 0);
            return (
              <Plot
                data={[
                  {
                    type: 'pie' as const,
                    labels: sorted.map((p) => titleCase(p.product)),
                    values: sorted.map((p) => p.count),
                    hole: 0.55,
                    marker: {
                      colors: sorted.map((_, i) => chartColors[i % chartColors.length]),
                      line: { color: '#ffffff', width: 2 },
                    },
                    textinfo: 'label+percent' as const,
                    textposition: 'outside' as const,
                    automargin: true,
                    textfont: {
                      size: 11,
                      color: '#2C3E50',
                      family: 'Inter, system-ui, sans-serif',
                    },
                    hovertemplate: '<b>%{label}</b><br>%{value} rules (%{percent})<extra></extra>',
                    pull: 0.02,
                    direction: 'clockwise' as const,
                    sort: false,
                  },
                ]}
                layout={{
                  height: 200,
                  margin: { l: 10, r: 10, t: 10, b: 10 },
                  paper_bgcolor: 'transparent',
                  plot_bgcolor: 'transparent',
                  font: { family: 'Inter, system-ui, sans-serif', size: 11 },
                  showlegend: false,
                  annotations: [
                    {
                      text: `<b>${total}</b><br>rules`,
                      showarrow: false,
                      font: { size: 14, color: '#2C3E50', family: 'Inter, system-ui, sans-serif' },
                      x: 0.5,
                      y: 0.5,
                    },
                  ],
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%' }}
              />
            );
          })()}
        </ChartContainer>
      </div>

      {/* Conflict Banner */}
      {conflicts.has_conflicts && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
          <div>
            <span className="text-sm font-semibold text-amber-800">
              {conflicts.data.length} conflict{conflicts.data.length !== 1 ? 's' : ''} detected
            </span>
            <span className="ml-2 text-sm text-amber-700">
              Some risk factors have contradictory actions.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
