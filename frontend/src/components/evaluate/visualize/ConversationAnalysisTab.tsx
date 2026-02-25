'use client';

import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { cn } from '@/lib/utils';
import { useDataStore, useUIStore } from '@/stores';
import { Columns, ChartColors } from '@/types';

const TURN_BINS = [
  { label: '1 turn', min: 1, max: 2 },
  { label: '2-3 turns', min: 2, max: 4 },
  { label: '4-5 turns', min: 4, max: 6 },
  { label: '6-10 turns', min: 6, max: 11 },
  { label: '10+ turns', min: 11, max: Infinity },
];

function countTurns(conversation: string | object | null | undefined): number {
  if (!conversation) return 0;

  let text = '';
  if (typeof conversation === 'string') {
    text = conversation;
  } else if (Array.isArray(conversation)) {
    return conversation.length;
  } else if (typeof conversation === 'object') {
    // Try to parse if it's an object with messages
    const arr = (conversation as { messages?: unknown[] }).messages;
    if (Array.isArray(arr)) return arr.length;
    text = JSON.stringify(conversation);
  }

  // Count turns by looking for role markers or message separators
  const rolePatterns = [
    /\b(user|assistant|human|ai|system):/gi,
    /\[user\]|\[assistant\]|\[human\]|\[ai\]/gi,
    /<\/?message>/gi,
  ];

  let maxCount = 0;
  for (const pattern of rolePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      maxCount = Math.max(maxCount, matches.length);
    }
  }

  // If no patterns found, try counting by newlines or paragraphs
  if (maxCount === 0) {
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
    maxCount = Math.max(1, Math.ceil(paragraphs.length / 2)); // Rough estimate: 2 paragraphs per turn
  }

  return maxCount || 1;
}

export function ConversationAnalysisTab() {
  const { data, metricColumns, format } = useDataStore();
  const { analyticsResponseMetric, setAnalyticsResponseMetric } = useUIStore();

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

  const activeMetric = analyticsResponseMetric || availableMetrics[0] || null;

  // Analyze conversations
  const analysisData = useMemo(() => {
    if (!data || data.length === 0) return null;

    const experiments = new Map<
      string,
      {
        records: Map<string, { turns: number; scores: Record<string, number> }>;
      }
    >();

    if (format === 'tree_format' || format === 'flat_format') {
      data.forEach((row) => {
        const id = row[Columns.DATASET_ID] as string;
        const expName = (row[Columns.EXPERIMENT_NAME] as string) || 'Default';
        const conversation = row[Columns.CONVERSATION];
        const metricName = row[Columns.METRIC_NAME] as string;
        const score = row[Columns.METRIC_SCORE] as number;

        if (!experiments.has(expName)) {
          experiments.set(expName, { records: new Map() });
        }
        const exp = experiments.get(expName)!;

        if (!exp.records.has(id)) {
          exp.records.set(id, { turns: countTurns(conversation), scores: {} });
        }

        if (metricName && typeof score === 'number') {
          exp.records.get(id)!.scores[metricName] = score;
        }
      });
    } else {
      data.forEach((row, idx) => {
        const id = (row[Columns.DATASET_ID] as string) || `row_${idx}`;
        const expName = (row[Columns.EXPERIMENT_NAME] as string) || 'Default';
        const conversation = row[Columns.CONVERSATION];

        if (!experiments.has(expName)) {
          experiments.set(expName, { records: new Map() });
        }
        const exp = experiments.get(expName)!;

        const scores: Record<string, number> = {};
        metricColumns.forEach((col) => {
          const val = row[col] as number;
          if (typeof val === 'number') scores[col] = val;
        });

        exp.records.set(id, { turns: countTurns(conversation), scores });
      });
    }

    // Check if any conversations have multiple turns
    let hasMultiTurn = false;
    experiments.forEach((exp) => {
      exp.records.forEach((record) => {
        if (record.turns > 1) hasMultiTurn = true;
      });
    });

    // Bin by turn count
    const binned: {
      category: string;
      experimentName: string;
      count: number;
      avgScore: number;
    }[] = [];

    const expNames = Array.from(experiments.keys()).sort();

    expNames.forEach((expName) => {
      const exp = experiments.get(expName)!;

      TURN_BINS.forEach((bin) => {
        const inBin: { turns: number; score: number }[] = [];

        exp.records.forEach((record) => {
          if (record.turns >= bin.min && record.turns < bin.max) {
            const score = activeMetric ? record.scores[activeMetric] : null;
            if (score !== null && score !== undefined) {
              inBin.push({ turns: record.turns, score });
            }
          }
        });

        if (inBin.length > 0) {
          const avgScore = inBin.reduce((sum, item) => sum + item.score, 0) / inBin.length;
          binned.push({
            category: bin.label,
            experimentName: expName,
            count: inBin.length,
            avgScore,
          });
        }
      });
    });

    return {
      experiments: expNames,
      binned,
      hasMultiTurn,
      totalRecords: Array.from(experiments.values()).reduce(
        (sum, exp) => sum + exp.records.size,
        0
      ),
    };
  }, [data, format, metricColumns, activeMetric]);

  // Prepare chart data
  const histogramData = useMemo(() => {
    if (!analysisData) return [];

    const traces: Plotly.Data[] = [];

    analysisData.experiments.forEach((expName, idx) => {
      const bins = analysisData.binned.filter((b) => b.experimentName === expName);
      const counts = TURN_BINS.map((tb) => {
        const bin = bins.find((b) => b.category === tb.label);
        return bin ? bin.count : 0;
      });

      traces.push({
        type: 'bar',
        name: expName,
        x: TURN_BINS.map((b) => b.label),
        y: counts,
        marker: { color: ChartColors[idx % ChartColors.length] },
      } as Plotly.Data);
    });

    return traces;
  }, [analysisData]);

  const performanceData = useMemo(() => {
    if (!analysisData) return [];

    const traces: Plotly.Data[] = [];

    analysisData.experiments.forEach((expName, idx) => {
      const bins = analysisData.binned.filter((b) => b.experimentName === expName);
      const scores = TURN_BINS.map((tb) => {
        const bin = bins.find((b) => b.category === tb.label);
        return bin ? bin.avgScore : null;
      });

      traces.push({
        type: 'scatter',
        mode: 'lines+markers',
        name: expName,
        x: TURN_BINS.map((b) => b.label),
        y: scores,
        marker: { color: ChartColors[idx % ChartColors.length], size: 10 },
        line: { color: ChartColors[idx % ChartColors.length] },
        connectgaps: true,
      } as Plotly.Data);
    });

    return traces;
  }, [analysisData]);

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-text-muted">
        No data available. Upload evaluation data to see conversation analysis.
      </div>
    );
  }

  if (analysisData && !analysisData.hasMultiTurn) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-text-muted">
        <p className="mb-2">No multi-turn conversation data detected.</p>
        <p className="text-sm">
          This analysis requires data with a &quot;conversation&quot; field containing multiple
          turns.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metric Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted">Analyze Metric:</span>
          <select
            value={activeMetric || ''}
            onChange={(e) => setAnalyticsResponseMetric(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {availableMetrics.map((metric) => (
              <option key={metric} value={metric}>
                {metric}
              </option>
            ))}
          </select>
        </div>
        {analysisData && (
          <span className="text-sm text-text-muted">
            Analyzing {analysisData.totalRecords} conversations across{' '}
            {analysisData.experiments.length} experiment(s)
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Turn Count Distribution */}
        <div className="border-border/50 rounded-xl border bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-text-primary">Turn Count Distribution</h3>
          <div className="h-[350px]">
            <PlotlyChart
              data={histogramData}
              layout={{
                barmode: 'group',
                xaxis: { title: 'Conversation Length' },
                yaxis: { title: 'Count' },
                showlegend: true,
                legend: {
                  orientation: 'h',
                  y: -0.2,
                  x: 0.5,
                  xanchor: 'center',
                },
              }}
            />
          </div>
        </div>

        {/* Performance by Turn Count */}
        <div className="border-border/50 rounded-xl border bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-text-primary">
            {activeMetric || 'Score'} by Turn Count
          </h3>
          <div className="h-[350px]">
            <PlotlyChart
              data={performanceData}
              layout={{
                xaxis: { title: 'Conversation Length' },
                yaxis: {
                  title: `Avg ${activeMetric || 'Score'}`,
                  range: [0, 1.05],
                },
                showlegend: true,
                legend: {
                  orientation: 'h',
                  y: -0.2,
                  x: 0.5,
                  xanchor: 'center',
                },
              }}
            />
          </div>
        </div>
      </div>

      {/* Summary Table */}
      {analysisData && analysisData.binned.length > 0 && (
        <div className="border-border/50 rounded-xl border bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-text-primary">Turn Count Statistics</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left font-medium text-text-secondary">
                    Turn Count
                  </th>
                  {analysisData.experiments.map((exp) => (
                    <th
                      key={exp}
                      colSpan={2}
                      className="px-4 py-2 text-center font-medium text-text-secondary"
                    >
                      {exp}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-border bg-gray-50">
                  <th className="px-4 py-1"></th>
                  {analysisData.experiments.map((exp) => (
                    <>
                      <th
                        key={`${exp}-count`}
                        className="px-4 py-1 text-center text-xs text-text-muted"
                      >
                        Count
                      </th>
                      <th
                        key={`${exp}-score`}
                        className="px-4 py-1 text-center text-xs text-text-muted"
                      >
                        Avg Score
                      </th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TURN_BINS.map((bin) => (
                  <tr key={bin.label} className="border-border/50 border-b">
                    <td className="px-4 py-2 font-medium text-text-primary">{bin.label}</td>
                    {analysisData.experiments.map((exp) => {
                      const binData = analysisData.binned.find(
                        (b) => b.category === bin.label && b.experimentName === exp
                      );
                      return (
                        <>
                          <td
                            key={`${exp}-${bin.label}-count`}
                            className="px-4 py-2 text-center text-text-secondary"
                          >
                            {binData ? binData.count : '-'}
                          </td>
                          <td key={`${exp}-${bin.label}-score`} className="px-4 py-2 text-center">
                            {binData ? (
                              <span
                                className={cn(
                                  'font-mono',
                                  binData.avgScore >= 0.7
                                    ? 'text-green-600'
                                    : binData.avgScore >= 0.4
                                      ? 'text-yellow-600'
                                      : 'text-red-600'
                                )}
                              >
                                {binData.avgScore.toFixed(3)}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                        </>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
