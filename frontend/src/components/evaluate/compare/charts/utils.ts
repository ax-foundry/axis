import type { ComparisonRow, WinLossData, ModelAgreementData } from '@/types';

/**
 * Group comparison rows by experiment name
 */
export function groupByExperiment(rows: ComparisonRow[]): Map<string, ComparisonRow[]> {
  const groups = new Map<string, ComparisonRow[]>();

  rows.forEach((row) => {
    const exp = row.experimentName || 'Default';
    if (!groups.has(exp)) {
      groups.set(exp, []);
    }
    groups.get(exp)!.push(row);
  });

  return groups;
}

/**
 * Extract metric scores for a given metric across all rows
 */
export function extractMetricScores(rows: ComparisonRow[], metric: string): number[] {
  return rows
    .map((row) => row.metrics[metric])
    .filter((score): score is number => typeof score === 'number' && !isNaN(score));
}

/**
 * Calculate statistics for a dataset
 */
export function calculateStats(values: number[]): {
  mean: number;
  std: number;
  min: number;
  max: number;
  median: number;
} {
  if (values.length === 0) {
    return { mean: 0, std: 0, min: 0, max: 0, median: 0 };
  }

  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;

  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(variance);

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return {
    mean,
    std,
    min: Math.min(...values),
    max: Math.max(...values),
    median,
  };
}

/**
 * Calculate linear regression coefficients
 */
export function linearRegression(
  x: number[],
  y: number[]
): {
  slope: number;
  intercept: number;
  r2: number;
} {
  if (x.length !== y.length || x.length < 2) {
    return { slope: 0, intercept: 0, r2: 0 };
  }

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

  const denominator = n * sumX2 - sumX * sumX;
  if (Math.abs(denominator) < 1e-10) {
    return { slope: 0, intercept: sumY / n, r2: 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared
  const yMean = sumY / n;
  const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
  const ssResidual = y.reduce((sum, yi, i) => {
    const predicted = slope * x[i] + intercept;
    return sum + Math.pow(yi - predicted, 2);
  }, 0);
  const r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  return { slope, intercept, r2 };
}

/**
 * Calculate Pearson correlation coefficient
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return Math.abs(denominator) < 1e-10 ? 0 : numerator / denominator;
}

/**
 * Calculate win/loss/tie for each test case across experiments
 */
export function calculateWinLoss(rows: ComparisonRow[]): WinLossData[] {
  const byQuery = new Map<string, ComparisonRow[]>();

  rows.forEach((row) => {
    if (!byQuery.has(row.id)) {
      byQuery.set(row.id, []);
    }
    byQuery.get(row.id)!.push(row);
  });

  const results: WinLossData[] = [];

  byQuery.forEach((queryRows, queryId) => {
    if (queryRows.length < 2) return; // Need at least 2 experiments to compare

    const scores: Record<string, number> = {};
    queryRows.forEach((row) => {
      const exp = row.experimentName || 'Default';
      scores[exp] = row.overallScore;
    });

    const maxScore = Math.max(...Object.values(scores));
    const winners = Object.entries(scores).filter(([, s]) => s === maxScore);

    let winner: string;
    if (winners.length > 1) {
      winner = 'Tie';
    } else {
      winner = winners[0][0];
    }

    results.push({
      queryId,
      queryText: queryRows[0].query,
      winner,
      maxScore,
      scores,
    });
  });

  return results;
}

/**
 * Calculate pairwise model agreement
 */
export function calculateModelAgreement(
  rows: ComparisonRow[],
  threshold: number = 0.5
): ModelAgreementData[] {
  const byQuery = new Map<string, ComparisonRow[]>();

  rows.forEach((row) => {
    if (!byQuery.has(row.id)) {
      byQuery.set(row.id, []);
    }
    byQuery.get(row.id)!.push(row);
  });

  // Get all experiments
  const experiments = new Set<string>();
  rows.forEach((row) => experiments.add(row.experimentName || 'Default'));
  const expArray = Array.from(experiments);

  if (expArray.length < 2) return [];

  const results: ModelAgreementData[] = [];

  // Calculate pairwise agreement
  for (let i = 0; i < expArray.length; i++) {
    for (let j = i + 1; j < expArray.length; j++) {
      const model1 = expArray[i];
      const model2 = expArray[j];

      let bothPass = 0;
      let bothFail = 0;
      let model1Only = 0;
      let model2Only = 0;
      let total = 0;

      byQuery.forEach((queryRows) => {
        const row1 = queryRows.find((r) => (r.experimentName || 'Default') === model1);
        const row2 = queryRows.find((r) => (r.experimentName || 'Default') === model2);

        if (!row1 || !row2) return;

        const pass1 = row1.overallScore >= threshold;
        const pass2 = row2.overallScore >= threshold;

        total++;

        if (pass1 && pass2) bothPass++;
        else if (!pass1 && !pass2) bothFail++;
        else if (pass1 && !pass2) model1Only++;
        else model2Only++;
      });

      const agreementRate = total > 0 ? (bothPass + bothFail) / total : 0;

      results.push({
        model1,
        model2,
        bothPass,
        bothFail,
        model1Only,
        model2Only,
        agreementRate,
      });
    }
  }

  return results;
}

/**
 * Get unique experiments from rows
 */
export function getExperiments(rows: ComparisonRow[]): string[] {
  const experiments = new Set<string>();
  rows.forEach((row) => experiments.add(row.experimentName || 'Default'));
  return Array.from(experiments).sort();
}

/**
 * Get unique metrics from rows
 */
export function getMetrics(rows: ComparisonRow[]): string[] {
  const metrics = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row.metrics).forEach((m) => metrics.add(m));
  });
  return Array.from(metrics).sort();
}
