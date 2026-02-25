'use client';

import { Eye, TrendingUp, TrendingDown } from 'lucide-react';
import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';
import { ChartColors, Colors, type ComparisonRow, type WinLossData } from '@/types';

import { calculateWinLoss, getExperiments } from './utils';

interface WinLossChartProps {
  rows: ComparisonRow[];
  onCaseClick?: (caseId: string) => void;
}

export function WinLossChart({ rows, onCaseClick }: WinLossChartProps) {
  const { compareBaselineExperiment, compareChallengerExperiment, setCompareCaseDiffCurrentId } =
    useUIStore();

  const experiments = useMemo(() => getExperiments(rows), [rows]);
  const isBaselineChallengerMode = compareBaselineExperiment && compareChallengerExperiment;

  // Filter rows for baseline vs challenger if selected
  const filteredRows = useMemo(() => {
    if (!isBaselineChallengerMode) return rows;
    return rows.filter((r) => {
      const exp = r.experimentName || 'Default';
      return exp === compareBaselineExperiment || exp === compareChallengerExperiment;
    });
  }, [rows, isBaselineChallengerMode, compareBaselineExperiment, compareChallengerExperiment]);

  const winLossData = useMemo(() => {
    return calculateWinLoss(filteredRows);
  }, [filteredRows]);

  // Categorize cases by winner for baseline vs challenger mode
  const categorizedCases = useMemo(() => {
    if (!isBaselineChallengerMode) return null;

    const challengerWins: WinLossData[] = [];
    const baselineWins: WinLossData[] = [];
    const ties: WinLossData[] = [];

    winLossData.forEach((item) => {
      if (item.winner === 'Tie') {
        ties.push(item);
      } else if (item.winner === compareChallengerExperiment) {
        challengerWins.push(item);
      } else if (item.winner === compareBaselineExperiment) {
        baselineWins.push(item);
      }
    });

    // Sort by score difference (largest first)
    const sortByDiff = (a: WinLossData, b: WinLossData) => {
      const aDiff = Math.abs(
        (a.scores[compareChallengerExperiment!] || 0) - (a.scores[compareBaselineExperiment!] || 0)
      );
      const bDiff = Math.abs(
        (b.scores[compareChallengerExperiment!] || 0) - (b.scores[compareBaselineExperiment!] || 0)
      );
      return bDiff - aDiff;
    };

    return {
      challengerWins: challengerWins.sort(sortByDiff),
      baselineWins: baselineWins.sort(sortByDiff),
      ties: ties.sort(sortByDiff),
    };
  }, [
    winLossData,
    isBaselineChallengerMode,
    compareBaselineExperiment,
    compareChallengerExperiment,
  ]);

  const handleCaseClick = (caseId: string) => {
    setCompareCaseDiffCurrentId(caseId);
    onCaseClick?.(caseId);
  };

  const { pieData, barData, summaryData } = useMemo(() => {
    const counts: Record<string, number> = {};
    experiments.forEach((exp) => {
      counts[exp] = 0;
    });
    counts['Tie'] = 0;

    winLossData.forEach((item) => {
      if (item.winner in counts) {
        counts[item.winner]++;
      }
    });

    // Pie chart data
    const pieLabels = [...experiments, 'Tie'];
    const pieValues = pieLabels.map((label) => counts[label] || 0);
    const pieColors = pieLabels.map((label) => {
      if (label === 'Tie') return Colors.textMuted;
      return ChartColors[experiments.indexOf(label) % ChartColors.length];
    });

    const pie: Plotly.Data = {
      type: 'pie',
      labels: pieLabels,
      values: pieValues,
      marker: { colors: pieColors },
      textinfo: 'label+percent',
      hovertemplate: '<b>%{label}</b><br>Wins: %{value}<br>Rate: %{percent}<extra></extra>',
    };

    // Bar chart data
    const bar: Plotly.Data = {
      type: 'bar',
      x: pieLabels,
      y: pieValues,
      marker: { color: pieColors },
      text: pieValues.map(String),
      textposition: 'auto',
      hovertemplate: '<b>%{x}</b><br>Wins: %{y}<extra></extra>',
    };

    // Summary data for table
    const total = winLossData.length;
    const summary = pieLabels.map((label) => ({
      name: label,
      wins: counts[label] || 0,
      rate: total > 0 ? (((counts[label] || 0) / total) * 100).toFixed(1) : '0.0',
    }));

    return {
      winCounts: counts,
      pieData: pie,
      barData: bar,
      summaryData: summary,
    };
  }, [winLossData, experiments]);

  if (rows.length === 0 || experiments.length < 2) {
    return (
      <div className="flex h-[400px] items-center justify-center text-text-muted">
        Need at least 2 experiments for win/loss analysis
      </div>
    );
  }

  if (winLossData.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center text-text-muted">
        No comparable test cases found (need same ID across experiments)
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pie Chart */}
        <div className="border-border/50 rounded-xl border bg-white p-4">
          <h4 className="mb-3 text-sm font-medium text-text-primary">Win Distribution</h4>
          <div className="h-[300px]">
            <PlotlyChart
              data={[pieData]}
              layout={{
                showlegend: true,
                legend: {
                  orientation: 'h',
                  y: -0.1,
                  x: 0.5,
                  xanchor: 'center',
                },
                margin: { l: 20, r: 20, t: 20, b: 40 },
              }}
            />
          </div>
        </div>

        {/* Bar Chart */}
        <div className="border-border/50 rounded-xl border bg-white p-4">
          <h4 className="mb-3 text-sm font-medium text-text-primary">Win Counts</h4>
          <div className="h-[300px]">
            <PlotlyChart
              data={[barData]}
              layout={{
                xaxis: { title: 'Experiment' },
                yaxis: { title: 'Wins' },
                showlegend: false,
                margin: { l: 50, r: 20, t: 20, b: 50 },
              }}
            />
          </div>
        </div>
      </div>

      {/* Summary Table */}
      <div className="border-border/50 rounded-xl border bg-white p-4">
        <h4 className="mb-3 text-sm font-medium text-text-primary">Win/Loss Summary</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium text-text-secondary">Experiment</th>
                <th className="px-4 py-2 text-center font-medium text-text-secondary">Wins</th>
                <th className="px-4 py-2 text-center font-medium text-text-secondary">Win Rate</th>
                <th className="px-4 py-2 text-left font-medium text-text-secondary">Progress</th>
              </tr>
            </thead>
            <tbody>
              {summaryData.map((item) => (
                <tr key={item.name} className="border-border/50 border-b">
                  <td className="px-4 py-2 font-medium text-text-primary">{item.name}</td>
                  <td className="px-4 py-2 text-center text-text-secondary">{item.wins}</td>
                  <td className="px-4 py-2 text-center text-text-secondary">{item.rate}%</td>
                  <td className="px-4 py-2">
                    <div className="h-2 w-full rounded-full bg-gray-200">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${item.rate}%`,
                          backgroundColor:
                            item.name === 'Tie'
                              ? Colors.textMuted
                              : ChartColors[experiments.indexOf(item.name) % ChartColors.length],
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-text-muted">
          Based on {winLossData.length} test cases with comparable data across experiments
        </p>
      </div>
      {/* Baseline vs Challenger: Divergent Cases */}
      {isBaselineChallengerMode && categorizedCases && (
        <div className="border-border/50 rounded-xl border bg-white p-4">
          <h4 className="mb-3 text-sm font-medium text-text-primary">Most Divergent Test Cases</h4>
          <p className="mb-4 text-xs text-text-muted">
            Click on a test case to view details in the Case Diff View
          </p>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Challenger Wins */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">
                  Challenger Wins ({categorizedCases.challengerWins.length})
                </span>
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {categorizedCases.challengerWins.slice(0, 10).map((item) => (
                  <DivergentCaseItem
                    key={item.queryId}
                    item={item}
                    baseline={compareBaselineExperiment!}
                    challenger={compareChallengerExperiment!}
                    variant="challenger"
                    onClick={() => handleCaseClick(item.queryId)}
                  />
                ))}
                {categorizedCases.challengerWins.length === 0 && (
                  <p className="text-xs italic text-text-muted">No cases</p>
                )}
              </div>
            </div>

            {/* Baseline Wins */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-700">
                  Baseline Wins ({categorizedCases.baselineWins.length})
                </span>
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {categorizedCases.baselineWins.slice(0, 10).map((item) => (
                  <DivergentCaseItem
                    key={item.queryId}
                    item={item}
                    baseline={compareBaselineExperiment!}
                    challenger={compareChallengerExperiment!}
                    variant="baseline"
                    onClick={() => handleCaseClick(item.queryId)}
                  />
                ))}
                {categorizedCases.baselineWins.length === 0 && (
                  <p className="text-xs italic text-text-muted">No cases</p>
                )}
              </div>
            </div>

            {/* Ties */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-4 w-4 items-center justify-center text-gray-500">=</span>
                <span className="text-sm font-medium text-gray-600">
                  Ties ({categorizedCases.ties.length})
                </span>
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {categorizedCases.ties.slice(0, 10).map((item) => (
                  <DivergentCaseItem
                    key={item.queryId}
                    item={item}
                    baseline={compareBaselineExperiment!}
                    challenger={compareChallengerExperiment!}
                    variant="tie"
                    onClick={() => handleCaseClick(item.queryId)}
                  />
                ))}
                {categorizedCases.ties.length === 0 && (
                  <p className="text-xs italic text-text-muted">No cases</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface DivergentCaseItemProps {
  item: WinLossData;
  baseline: string;
  challenger: string;
  variant: 'challenger' | 'baseline' | 'tie';
  onClick: () => void;
}

function DivergentCaseItem({
  item,
  baseline,
  challenger,
  variant,
  onClick,
}: DivergentCaseItemProps) {
  const baselineScore = item.scores[baseline] ?? 0;
  const challengerScore = item.scores[challenger] ?? 0;
  const diff = challengerScore - baselineScore;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-lg border p-2 text-left transition-all hover:shadow-sm',
        variant === 'challenger' && 'border-green-200 bg-green-50/50 hover:bg-green-50',
        variant === 'baseline' && 'border-amber-200 bg-amber-50/50 hover:bg-amber-50',
        variant === 'tie' && 'border-gray-200 bg-gray-50/50 hover:bg-gray-50'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="max-w-[120px] truncate font-mono text-xs text-text-muted">
          {item.queryId}
        </span>
        <Eye className="h-3 w-3 text-text-muted" />
      </div>
      <div className="mt-1 truncate text-xs text-text-secondary">
        {item.queryText.slice(0, 40)}...
      </div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="text-gray-500">{baselineScore.toFixed(2)}</span>
        <span
          className={cn(
            'font-medium',
            diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-500'
          )}
        >
          {diff > 0 ? '+' : ''}
          {diff.toFixed(2)}
        </span>
        <span className="text-primary">{challengerScore.toFixed(2)}</span>
      </div>
    </button>
  );
}
