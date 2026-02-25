'use client';

import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { cn } from '@/lib/utils';
import { useDataStore, useUIStore } from '@/stores';
import { Columns, ChartColors } from '@/types';

interface ResponseLengthBin {
  category: string;
  experimentName: string;
  count: number;
  avgScore: number;
  minLength: number;
  maxLength: number;
}

const LENGTH_BINS = [
  { label: '0-100', min: 0, max: 100 },
  { label: '100-300', min: 100, max: 300 },
  { label: '300-500', min: 300, max: 500 },
  { label: '500-1000', min: 500, max: 1000 },
  { label: '1000+', min: 1000, max: Infinity },
];

export function ResponseAnalysisTab() {
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

  // Compute response lengths and metrics
  const analysisData = useMemo(() => {
    if (!data || data.length === 0) return null;

    const experiments = new Map<
      string,
      {
        records: Map<string, { length: number; scores: Record<string, number> }>;
      }
    >();

    if (format === 'tree_format' || format === 'flat_format') {
      // Group by experiment and test case ID
      data.forEach((row) => {
        const id = row[Columns.DATASET_ID] as string;
        const expName = (row[Columns.EXPERIMENT_NAME] as string) || 'Default';
        const output = (row[Columns.ACTUAL_OUTPUT] as string) || '';
        const metricName = row[Columns.METRIC_NAME] as string;
        const score = row[Columns.METRIC_SCORE] as number;

        if (!experiments.has(expName)) {
          experiments.set(expName, { records: new Map() });
        }
        const exp = experiments.get(expName)!;

        if (!exp.records.has(id)) {
          exp.records.set(id, { length: output.length, scores: {} });
        }

        if (metricName && typeof score === 'number') {
          exp.records.get(id)!.scores[metricName] = score;
        }
      });
    } else {
      // Simple format
      data.forEach((row, idx) => {
        const id = (row[Columns.DATASET_ID] as string) || `row_${idx}`;
        const expName = (row[Columns.EXPERIMENT_NAME] as string) || 'Default';
        const output = (row[Columns.ACTUAL_OUTPUT] as string) || '';

        if (!experiments.has(expName)) {
          experiments.set(expName, { records: new Map() });
        }
        const exp = experiments.get(expName)!;

        const scores: Record<string, number> = {};
        metricColumns.forEach((col) => {
          const val = row[col] as number;
          if (typeof val === 'number') scores[col] = val;
        });

        exp.records.set(id, { length: output.length, scores });
      });
    }

    // Bin data by response length
    const binned: ResponseLengthBin[] = [];
    const expNames = Array.from(experiments.keys()).sort();

    expNames.forEach((expName) => {
      const exp = experiments.get(expName)!;

      LENGTH_BINS.forEach((bin) => {
        const inBin: { length: number; score: number }[] = [];

        exp.records.forEach((record) => {
          if (record.length >= bin.min && record.length < bin.max) {
            const score = activeMetric ? record.scores[activeMetric] : null;
            if (score !== null && score !== undefined) {
              inBin.push({ length: record.length, score });
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
            minLength: bin.min,
            maxLength: bin.max,
          });
        }
      });
    });

    return {
      experiments: expNames,
      binned,
      totalRecords: Array.from(experiments.values()).reduce(
        (sum, exp) => sum + exp.records.size,
        0
      ),
    };
  }, [data, format, metricColumns, activeMetric]);

  // Prepare histogram data
  const histogramData = useMemo(() => {
    if (!analysisData) return [];

    const traces: Plotly.Data[] = [];

    analysisData.experiments.forEach((expName, idx) => {
      const bins = analysisData.binned.filter((b) => b.experimentName === expName);
      const counts = LENGTH_BINS.map((lb) => {
        const bin = bins.find((b) => b.category === lb.label);
        return bin ? bin.count : 0;
      });

      traces.push({
        type: 'bar',
        name: expName,
        x: LENGTH_BINS.map((b) => b.label),
        y: counts,
        marker: { color: ChartColors[idx % ChartColors.length] },
      } as Plotly.Data);
    });

    return traces;
  }, [analysisData]);

  // Prepare performance by length data
  const performanceData = useMemo(() => {
    if (!analysisData) return [];

    const traces: Plotly.Data[] = [];

    analysisData.experiments.forEach((expName, idx) => {
      const bins = analysisData.binned.filter((b) => b.experimentName === expName);
      const scores = LENGTH_BINS.map((lb) => {
        const bin = bins.find((b) => b.category === lb.label);
        return bin ? bin.avgScore : null;
      });

      traces.push({
        type: 'scatter',
        mode: 'lines+markers',
        name: expName,
        x: LENGTH_BINS.map((b) => b.label),
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
        No data available. Upload evaluation data to see response analysis.
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
            Analyzing {analysisData.totalRecords} responses across {analysisData.experiments.length}{' '}
            experiment(s)
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Response Length Histogram */}
        <div className="border-border/50 rounded-xl border bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-text-primary">
            Response Length Distribution
          </h3>
          <div className="h-[350px]">
            <PlotlyChart
              data={histogramData}
              layout={{
                barmode: 'group',
                xaxis: {
                  title: 'Response Length (characters)',
                },
                yaxis: {
                  title: 'Count',
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

        {/* Performance by Length */}
        <div className="border-border/50 rounded-xl border bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-text-primary">
            {activeMetric || 'Score'} by Response Length
          </h3>
          <div className="h-[350px]">
            <PlotlyChart
              data={performanceData}
              layout={{
                xaxis: {
                  title: 'Response Length (characters)',
                },
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

      {/* Summary Statistics */}
      {analysisData && analysisData.binned.length > 0 && (
        <div className="border-border/50 rounded-xl border bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-text-primary">Length Bin Statistics</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left font-medium text-text-secondary">
                    Length Bin
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
                {LENGTH_BINS.map((bin) => (
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
