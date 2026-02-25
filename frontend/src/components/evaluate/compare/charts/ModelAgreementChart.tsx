'use client';

import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { Colors, type ComparisonRow } from '@/types';

import { calculateModelAgreement, getExperiments } from './utils';

interface ModelAgreementChartProps {
  rows: ComparisonRow[];
  threshold: number;
  onThresholdChange: (threshold: number) => void;
}

export function ModelAgreementChart({
  rows,
  threshold,
  onThresholdChange,
}: ModelAgreementChartProps) {
  const experiments = useMemo(() => getExperiments(rows), [rows]);

  const agreementData = useMemo(() => {
    return calculateModelAgreement(rows, threshold);
  }, [rows, threshold]);

  const { heatmapData, barData, confusionMatrices } = useMemo(() => {
    if (experiments.length < 2) {
      return { heatmapData: null, barData: null, confusionMatrices: [] };
    }

    // Create agreement matrix
    const n = experiments.length;
    const matrix: number[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => 1));

    agreementData.forEach((item) => {
      const i = experiments.indexOf(item.model1);
      const j = experiments.indexOf(item.model2);
      if (i >= 0 && j >= 0) {
        matrix[i][j] = item.agreementRate;
        matrix[j][i] = item.agreementRate;
      }
    });

    // Heatmap for agreement rates
    const heatmap = {
      type: 'heatmap' as const,
      z: matrix,
      x: experiments,
      y: experiments,
      colorscale: [
        [0, Colors.error],
        [0.5, Colors.warning],
        [1, Colors.success],
      ],
      zmin: 0,
      zmax: 1,
      text: matrix.map((row) => row.map((v) => `${(v * 100).toFixed(1)}%`)) as unknown as string[],
      texttemplate: '%{text}',
      hovertemplate: '<b>%{x}</b> vs <b>%{y}</b><br>Agreement: %{z:.1%}<extra></extra>',
    } as Plotly.Data;

    // Bar chart for pairwise agreement rates
    const pairLabels = agreementData.map((d) => `${d.model1} vs ${d.model2}`);
    const agreementRates = agreementData.map((d) => d.agreementRate);

    const bar: Plotly.Data = {
      type: 'bar',
      x: pairLabels,
      y: agreementRates,
      marker: {
        color: agreementRates.map((rate) => {
          if (rate >= 0.8) return Colors.success;
          if (rate >= 0.5) return Colors.warning;
          return Colors.error;
        }),
      },
      text: agreementRates.map((r) => `${(r * 100).toFixed(1)}%`),
      textposition: 'auto',
      hovertemplate: '<b>%{x}</b><br>Agreement: %{y:.1%}<extra></extra>',
    };

    // Confusion matrix details for each pair
    const confusions = agreementData.map((item) => ({
      pair: `${item.model1} vs ${item.model2}`,
      model1: item.model1,
      model2: item.model2,
      bothPass: item.bothPass,
      bothFail: item.bothFail,
      model1Only: item.model1Only,
      model2Only: item.model2Only,
      total: item.bothPass + item.bothFail + item.model1Only + item.model2Only,
      agreementRate: item.agreementRate,
    }));

    return {
      heatmapData: heatmap,
      barData: bar,
      confusionMatrices: confusions,
    };
  }, [agreementData, experiments]);

  if (rows.length === 0 || experiments.length < 2) {
    return (
      <div className="flex h-[400px] items-center justify-center text-text-muted">
        Need at least 2 experiments for agreement analysis
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Threshold Control */}
      <div className="border-border/50 rounded-xl border bg-white p-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-text-primary">Pass Threshold:</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={threshold}
            onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-gray-200"
          />
          <span className="w-12 font-mono text-sm text-text-secondary">
            {(threshold * 100).toFixed(0)}%
          </span>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Test cases with overall score &ge; {(threshold * 100).toFixed(0)}% are considered
          &quot;Pass&quot;
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Agreement Heatmap */}
        <div className="border-border/50 rounded-xl border bg-white p-4">
          <h4 className="mb-3 text-sm font-medium text-text-primary">Agreement Matrix</h4>
          <div className="h-[350px]">
            {heatmapData && (
              <PlotlyChart
                data={[heatmapData]}
                layout={{
                  xaxis: { side: 'bottom' },
                  yaxis: { autorange: 'reversed' },
                  margin: { l: 100, r: 20, t: 20, b: 80 },
                }}
              />
            )}
          </div>
        </div>

        {/* Pairwise Agreement Bars */}
        <div className="border-border/50 rounded-xl border bg-white p-4">
          <h4 className="mb-3 text-sm font-medium text-text-primary">Pairwise Agreement Rates</h4>
          <div className="h-[350px]">
            {barData && (
              <PlotlyChart
                data={[barData]}
                layout={{
                  xaxis: {
                    title: 'Model Pair',
                    tickangle: -45,
                  },
                  yaxis: {
                    title: 'Agreement Rate',
                    range: [0, 1.05],
                  },
                  showlegend: false,
                  margin: { l: 60, r: 20, t: 20, b: 100 },
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Detailed Confusion Matrices */}
      <div className="border-border/50 rounded-xl border bg-white p-4">
        <h4 className="mb-3 text-sm font-medium text-text-primary">Confusion Matrix Details</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium text-text-secondary">Pair</th>
                <th className="px-4 py-2 text-center font-medium text-text-secondary">Both Pass</th>
                <th className="px-4 py-2 text-center font-medium text-text-secondary">Both Fail</th>
                <th className="px-4 py-2 text-center font-medium text-text-secondary">
                  First Only
                </th>
                <th className="px-4 py-2 text-center font-medium text-text-secondary">
                  Second Only
                </th>
                <th className="px-4 py-2 text-center font-medium text-text-secondary">Agreement</th>
              </tr>
            </thead>
            <tbody>
              {confusionMatrices.map((item) => (
                <tr key={item.pair} className="border-border/50 border-b">
                  <td className="px-4 py-2 font-medium text-text-primary">{item.pair}</td>
                  <td className="px-4 py-2 text-center">
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                      {item.bothPass}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                      {item.bothFail}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
                      {item.model1Only}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
                      {item.model2Only}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span
                      className="font-mono font-medium"
                      style={{
                        color:
                          item.agreementRate >= 0.8
                            ? Colors.success
                            : item.agreementRate >= 0.5
                              ? Colors.warning
                              : Colors.error,
                      }}
                    >
                      {(item.agreementRate * 100).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
