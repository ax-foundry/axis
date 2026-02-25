'use client';

import { X } from 'lucide-react';
import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { cn } from '@/lib/utils';
import { ChartColors } from '@/types';

import { HealthIndicator } from './HealthIndicator';

import type { MonitoringHierarchyNode, MonitoringRecord } from '@/types';

interface MetricDetailPanelProps {
  node: MonitoringHierarchyNode;
  records: MonitoringRecord[];
  onClose: () => void;
  onNavigateToTab?: (tab: string) => void;
}

interface CategoryCount {
  value: string;
  count: number;
  percentage: number;
}

function ClassificationDetail({ records }: { records: MonitoringRecord[] }) {
  const categories = useMemo(() => {
    const counts = new Map<string, number>();

    for (const r of records) {
      // Classification labels come through the explanation field
      const raw = r.explanation ?? r.actual_output;
      const label = raw ? String(raw).trim() : '(empty)';
      if (label) {
        counts.set(label, (counts.get(label) || 0) + 1);
      }
    }

    const total = records.length;
    const result: CategoryCount[] = Array.from(counts.entries())
      .map(([value, count]) => ({
        value,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return { items: result, total };
  }, [records]);

  const pieData = useMemo(() => {
    const items = categories.items;
    return [
      {
        type: 'pie' as const,
        labels: items.map((c) => c.value),
        values: items.map((c) => c.count),
        hole: 0.5,
        marker: {
          colors: items.map((_, i) => ChartColors[i % ChartColors.length]),
          line: { color: 'white', width: 2 },
        },
        textinfo: 'label+percent' as const,
        textposition: 'outside' as const,
        textfont: { size: 11, family: 'Inter, system-ui' },
        hovertemplate: '<b>%{label}</b><br>Count: %{value}<br>%{percent}<extra></extra>',
        sort: false,
      },
    ];
  }, [categories.items]);

  if (categories.items.length === 0) {
    return <p className="py-6 text-center text-sm text-text-muted">No classification data</p>;
  }

  return (
    <>
      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-text-muted">Total Records</p>
          <p className="font-mono text-xl font-bold text-text-primary">
            {categories.total.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-text-muted">Unique Categories</p>
          <p className="font-mono text-xl font-bold text-text-primary">{categories.items.length}</p>
        </div>
      </div>

      {/* Pie chart */}
      <div className="mb-6">
        <h4 className="mb-2 text-sm font-medium text-text-primary">Category Distribution</h4>
        <div className="h-72">
          <PlotlyChart
            data={pieData}
            layout={{
              showlegend: false,
              height: 280,
              margin: { l: 20, r: 20, t: 10, b: 10 },
              annotations: [
                {
                  text: `<b>${categories.total}</b><br><span style="font-size:11px;color:#7F8C8D">records</span>`,
                  showarrow: false,
                  font: { size: 18, color: '#2C3E50', family: 'Inter, system-ui' },
                  x: 0.5,
                  y: 0.5,
                },
              ],
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor: 'rgba(0,0,0,0)',
            }}
          />
        </div>
      </div>

      {/* Value counts table */}
      <div>
        <h4 className="mb-2 text-sm font-medium text-text-primary">Value Counts</h4>
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="border-b border-border text-left font-medium uppercase text-text-muted">
                <th className="px-3 py-1.5">Category</th>
                <th className="px-3 py-1.5 text-right">Count</th>
                <th className="px-3 py-1.5 text-right">Percentage</th>
              </tr>
            </thead>
            <tbody>
              {categories.items.map((cat, i) => (
                <tr
                  key={cat.value}
                  className="border-b border-border last:border-0 hover:bg-gray-50"
                >
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: ChartColors[i % ChartColors.length] }}
                      />
                      <span className="font-medium">{cat.value}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{cat.count.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{cat.percentage.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ScoreDetail({
  node,
  metricRecords,
}: {
  node: MonitoringHierarchyNode;
  metricRecords: MonitoringRecord[];
}) {
  const stats = useMemo(() => {
    const scores = metricRecords
      .map((r) => r.metric_score)
      .filter((s): s is number => typeof s === 'number');

    if (scores.length === 0) return null;

    const sorted = [...scores].sort((a, b) => a - b);
    const sum = scores.reduce((a, b) => a + b, 0);

    return {
      count: scores.length,
      mean: sum / scores.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)],
      std: Math.sqrt(
        scores.reduce((acc, s) => acc + (s - sum / scores.length) ** 2, 0) / scores.length
      ),
      passRate: (scores.filter((s) => s >= 0.5).length / scores.length) * 100,
    };
  }, [metricRecords]);

  const trendChartData = useMemo(() => {
    if (node.trendPoints.length === 0) return null;
    return [
      {
        type: 'scatter' as const,
        mode: 'lines+markers' as const,
        x: node.trendPoints.map((p) => p.timestamp),
        y: node.trendPoints.map((p) => p.value),
        line: { color: '#8B9F4F', width: 2 },
        marker: { size: 4 },
        hovertemplate: '%{y:.3f}<br>%{x}<extra></extra>',
      },
    ];
  }, [node.trendPoints]);

  const recentValues = useMemo(() => {
    return metricRecords
      .filter((r) => typeof r.metric_score === 'number')
      .sort((a, b) => new Date(b.timestamp || '').getTime() - new Date(a.timestamp || '').getTime())
      .slice(0, 10);
  }, [metricRecords]);

  return (
    <>
      {/* Stats grid */}
      {stats && (
        <div className="mb-6 grid grid-cols-4 gap-3">
          {[
            { label: 'Mean', value: stats.mean.toFixed(3) },
            { label: 'Std Dev', value: stats.std.toFixed(3) },
            { label: 'Min / Max', value: `${stats.min.toFixed(3)} / ${stats.max.toFixed(3)}` },
            { label: 'Pass Rate', value: `${stats.passRate.toFixed(1)}%` },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border p-3">
              <p className="text-xs text-text-muted">{s.label}</p>
              <p className="font-mono text-sm font-semibold text-text-primary">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Trend chart */}
      {trendChartData && (
        <div className="mb-6">
          <h4 className="mb-2 text-sm font-medium text-text-primary">Score Trend</h4>
          <div className="h-48">
            <PlotlyChart
              data={trendChartData}
              layout={{
                margin: { l: 40, r: 10, t: 10, b: 30 },
                height: 180,
                yaxis: { range: [0, 1.05], tickformat: '.2f' },
                xaxis: { tickfont: { size: 9 } },
                shapes: [
                  {
                    type: 'line',
                    y0: 0.7,
                    y1: 0.7,
                    x0: 0,
                    x1: 1,
                    xref: 'paper',
                    line: { color: '#27AE60', width: 1, dash: 'dash' },
                  },
                  {
                    type: 'line',
                    y0: 0.5,
                    y1: 0.5,
                    x0: 0,
                    x1: 1,
                    xref: 'paper',
                    line: { color: '#F39C12', width: 1, dash: 'dash' },
                  },
                ],
              }}
            />
          </div>
        </div>
      )}

      {/* Recent values */}
      {recentValues.length > 0 && (
        <div className="mb-6">
          <h4 className="mb-2 text-sm font-medium text-text-primary">Recent Values</h4>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="border-b border-border text-left font-medium uppercase text-text-muted">
                  <th className="px-3 py-1.5">Timestamp</th>
                  <th className="px-3 py-1.5">Score</th>
                  <th className="px-3 py-1.5">Trace ID</th>
                </tr>
              </thead>
              <tbody>
                {recentValues.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5 text-text-muted">
                      {r.timestamp ? new Date(r.timestamp).toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={cn(
                          'font-mono font-medium',
                          typeof r.metric_score === 'number'
                            ? r.metric_score >= 0.7
                              ? 'text-success'
                              : r.metric_score >= 0.5
                                ? 'text-warning'
                                : 'text-error'
                            : 'text-text-muted'
                        )}
                      >
                        {typeof r.metric_score === 'number' ? r.metric_score.toFixed(3) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      {r.trace_id ? (
                        <code className="rounded bg-gray-100 px-1 font-mono text-primary">
                          {r.trace_id.slice(0, 8)}...
                        </code>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

export function MetricDetailPanel({
  node,
  records,
  onClose,
  onNavigateToTab,
}: MetricDetailPanelProps) {
  const metricRecords = useMemo(() => {
    return records.filter(
      (r) =>
        String(r.metric_name || '') === node.metricName &&
        String(r.source_name || '') === node.sourceName &&
        String(r.source_component || '(default)') === (node.sourceComponent || '(default)')
    );
  }, [records, node]);

  const isClassification = node.metricCategory === 'CLASSIFICATION';

  // Determine which category tab to navigate to
  const categoryTab = node.metricCategory?.toString().toLowerCase() || 'score';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">{node.name}</h3>
            <p className="text-sm text-text-muted">
              {node.sourceName}
              {node.sourceComponent && node.sourceComponent !== '(default)'
                ? ` / ${node.sourceComponent}`
                : ''}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Health + Category badge row */}
        <div className="mb-4 flex items-center gap-4">
          <HealthIndicator status={node.healthStatus} />
          {node.metricCategory && (
            <span
              className={cn(
                'rounded px-2 py-0.5 text-xs font-semibold uppercase',
                node.metricCategory === 'SCORE'
                  ? 'bg-success/10 text-success'
                  : node.metricCategory === 'CLASSIFICATION'
                    ? 'bg-accent-gold/10 text-accent-gold'
                    : 'bg-accent-silver/20 text-text-secondary'
              )}
            >
              {node.metricCategory}
            </span>
          )}
        </div>

        {/* Category-specific content */}
        {isClassification ? (
          <ClassificationDetail records={metricRecords} />
        ) : (
          <ScoreDetail node={node} metricRecords={metricRecords} />
        )}

        {/* Navigation link */}
        {onNavigateToTab && (
          <button
            onClick={() => onNavigateToTab(categoryTab)}
            className="mt-6 w-full rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
          >
            View in {node.metricCategory || 'Score'} tab →
          </button>
        )}
      </div>
    </div>
  );
}
