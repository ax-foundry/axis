/**
 * Calculate the mean of an array of numbers
 */
export function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate the standard deviation of an array of numbers
 */
export function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = calculateMean(values);
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Calculate Cohen's d effect size between two groups
 * Positive value means group1 > group2
 */
export function calculateCohenD(group1: number[], group2: number[]): number {
  if (group1.length === 0 || group2.length === 0) return 0;

  const mean1 = calculateMean(group1);
  const mean2 = calculateMean(group2);

  const std1 = calculateStdDev(group1);
  const std2 = calculateStdDev(group2);

  // Pooled standard deviation
  const n1 = group1.length;
  const n2 = group2.length;

  if (n1 + n2 < 3) return 0;

  const pooledStd = Math.sqrt(((n1 - 1) * std1 * std1 + (n2 - 1) * std2 * std2) / (n1 + n2 - 2));

  if (pooledStd === 0) return 0;

  return (mean1 - mean2) / pooledStd;
}

/**
 * Perform a two-sample t-test (Welch's t-test for unequal variances)
 * Returns t-statistic and p-value
 */
export function tTest(
  group1: number[],
  group2: number[]
): { t: number; p: number; degreesOfFreedom: number } {
  if (group1.length < 2 || group2.length < 2) {
    return { t: 0, p: 1, degreesOfFreedom: 0 };
  }

  const n1 = group1.length;
  const n2 = group2.length;
  const mean1 = calculateMean(group1);
  const mean2 = calculateMean(group2);
  const var1 = Math.pow(calculateStdDev(group1), 2);
  const var2 = Math.pow(calculateStdDev(group2), 2);

  // Welch's t-test
  const se = Math.sqrt(var1 / n1 + var2 / n2);

  if (se === 0) {
    return { t: 0, p: 1, degreesOfFreedom: n1 + n2 - 2 };
  }

  const t = (mean1 - mean2) / se;

  // Welch-Satterthwaite degrees of freedom
  const num = Math.pow(var1 / n1 + var2 / n2, 2);
  const denom = Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1);
  const df = denom > 0 ? num / denom : n1 + n2 - 2;

  // Calculate p-value using Student's t-distribution approximation
  const p = tDistributionPValue(Math.abs(t), df);

  return { t, p, degreesOfFreedom: df };
}

/**
 * Approximate p-value for t-distribution (two-tailed)
 * Uses a simplified approximation suitable for practical purposes
 */
function tDistributionPValue(t: number, df: number): number {
  if (df <= 0) return 1;

  // Use normal approximation for large df
  if (df > 100) {
    return 2 * (1 - normalCDF(Math.abs(t)));
  }

  // Beta function approximation for t-distribution CDF
  const x = df / (df + t * t);
  const a = df / 2;
  const b = 0.5;

  // Incomplete beta function approximation
  const betaCDF = incompleteBeta(x, a, b);
  return betaCDF;
}

/**
 * Standard normal CDF approximation
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Incomplete beta function approximation
 */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use continued fraction approximation
  const bt =
    x === 0 || x === 1
      ? 0
      : Math.exp(
          logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
        );

  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betaContinuedFraction(x, a, b)) / a;
  } else {
    return 1 - (bt * betaContinuedFraction(1 - x, b, a)) / b;
  }
}

/**
 * Log gamma function approximation (Lanczos approximation)
 */
function logGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }

  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i);
  }

  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Continued fraction for incomplete beta
 */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const maxIterations = 100;
  const epsilon = 1e-10;

  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < epsilon) d = epsilon;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;

    // Even step
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = 1 + aa / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1 / d;
    h *= d * c;

    // Odd step
    aa = -((a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = 1 + aa / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1) < epsilon) break;
  }

  return h;
}

/**
 * Interpret Cohen's d effect size
 */
export function interpretEffectSize(d: number): 'negligible' | 'small' | 'medium' | 'large' {
  const absD = Math.abs(d);
  if (absD < 0.2) return 'negligible';
  if (absD < 0.5) return 'small';
  if (absD < 0.8) return 'medium';
  return 'large';
}

/**
 * Get significance level from p-value
 */
export function getSignificanceLevel(p: number): {
  level: string;
  stars: string;
  isSignificant: boolean;
} {
  if (p < 0.001) {
    return { level: 'p < 0.001', stars: '***', isSignificant: true };
  }
  if (p < 0.01) {
    return { level: 'p < 0.01', stars: '**', isSignificant: true };
  }
  if (p < 0.05) {
    return { level: 'p < 0.05', stars: '*', isSignificant: true };
  }
  return { level: `p = ${p.toFixed(3)}`, stars: '', isSignificant: false };
}

/**
 * Calculate confidence interval for a mean
 */
export function confidenceInterval(
  values: number[],
  confidenceLevel: number = 0.95
): { lower: number; upper: number; margin: number } {
  if (values.length < 2) {
    const mean = values.length === 1 ? values[0] : 0;
    return { lower: mean, upper: mean, margin: 0 };
  }

  const mean = calculateMean(values);
  const std = calculateStdDev(values);
  const n = values.length;

  // Z-score for confidence level (using normal approximation)
  const z = confidenceLevel === 0.95 ? 1.96 : confidenceLevel === 0.99 ? 2.576 : 1.645;

  const margin = z * (std / Math.sqrt(n));

  return {
    lower: mean - margin,
    upper: mean + margin,
    margin,
  };
}

/**
 * Compare two experiments across a metric
 */
export interface MetricComparison {
  metricName: string;
  baselineMean: number;
  baselineStd: number;
  baselineN: number;
  challengerMean: number;
  challengerStd: number;
  challengerN: number;
  difference: number;
  percentChange: number;
  cohenD: number;
  effectSize: 'negligible' | 'small' | 'medium' | 'large';
  tStatistic: number;
  pValue: number;
  significanceLevel: string;
  stars: string;
  isSignificant: boolean;
  winner: 'baseline' | 'challenger' | 'tie';
}

export function compareMetrics(
  baselineValues: number[],
  challengerValues: number[],
  metricName: string,
  higherIsBetter: boolean = true
): MetricComparison {
  const baselineMean = calculateMean(baselineValues);
  const baselineStd = calculateStdDev(baselineValues);
  const challengerMean = calculateMean(challengerValues);
  const challengerStd = calculateStdDev(challengerValues);

  const difference = challengerMean - baselineMean;
  const percentChange = baselineMean !== 0 ? (difference / baselineMean) * 100 : 0;

  const cohenD = calculateCohenD(challengerValues, baselineValues);
  const effectSize = interpretEffectSize(cohenD);

  const { t, p } = tTest(challengerValues, baselineValues);
  const { level, stars, isSignificant } = getSignificanceLevel(p);

  // Determine winner
  let winner: 'baseline' | 'challenger' | 'tie';
  if (!isSignificant || Math.abs(difference) < 0.001) {
    winner = 'tie';
  } else if (higherIsBetter) {
    winner = challengerMean > baselineMean ? 'challenger' : 'baseline';
  } else {
    winner = challengerMean < baselineMean ? 'challenger' : 'baseline';
  }

  return {
    metricName,
    baselineMean,
    baselineStd,
    baselineN: baselineValues.length,
    challengerMean,
    challengerStd,
    challengerN: challengerValues.length,
    difference,
    percentChange,
    cohenD,
    effectSize,
    tStatistic: t,
    pValue: p,
    significanceLevel: level,
    stars,
    isSignificant,
    winner,
  };
}
