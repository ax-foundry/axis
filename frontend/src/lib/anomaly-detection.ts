import type { MonitoringAlert, MonitoringSummaryMetrics, MonitoringTrendData } from '@/types';

// ---------------------------------------------------------------------------
// Config types (mirror backend AnomalyDetectionConfig JSON shape)
// ---------------------------------------------------------------------------

export interface ZScoreConfig {
  enabled: boolean;
  threshold: number;
  severity: string;
  lookback_window: number;
  metrics: string[];
}

export interface MovingAverageConfig {
  enabled: boolean;
  window_size: number;
  deviation_threshold: number;
  severity: string;
  metrics: string[];
}

export interface RateOfChangeConfig {
  enabled: boolean;
  threshold: number;
  severity: string;
  metrics: string[];
}

export interface AnomalyDetectionConfig {
  enabled: boolean;
  min_data_points: number;
  z_score: ZScoreConfig;
  moving_average: MovingAverageConfig;
  rate_of_change: RateOfChangeConfig;
}

export const DEFAULT_ANOMALY_CONFIG: AnomalyDetectionConfig = {
  enabled: false,
  min_data_points: 5,
  z_score: {
    enabled: true,
    threshold: 2.0,
    severity: 'warning',
    lookback_window: 20,
    metrics: [],
  },
  moving_average: {
    enabled: true,
    window_size: 5,
    deviation_threshold: 0.15,
    severity: 'warning',
    metrics: [],
  },
  rate_of_change: {
    enabled: true,
    threshold: 0.3,
    severity: 'error',
    metrics: [],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AlertSeverity = 'warning' | 'error';

function toSeverity(s: string): AlertSeverity {
  return s === 'error' ? 'error' : 'warning';
}

/** Group trend data by metric name, sorted by timestamp ascending. */
function groupByMetric(data: MonitoringTrendData[]): Map<string, MonitoringTrendData[]> {
  const map = new Map<string, MonitoringTrendData[]>();
  for (const d of data) {
    let arr = map.get(d.metric);
    if (!arr) {
      arr = [];
      map.set(d.metric, arr);
    }
    arr.push(d);
  }
  // Sort each group by timestamp ascending
  Array.from(map.values()).forEach((arr) =>
    arr.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  );
  return map;
}

function metricsMatch(configMetrics: string[], metric: string): boolean {
  return configMetrics.length === 0 || configMetrics.includes(metric);
}

// ---------------------------------------------------------------------------
// Z-Score detector
// ---------------------------------------------------------------------------

export function detectZScoreAnomalies(
  trendData: MonitoringTrendData[],
  config: ZScoreConfig,
  minDataPoints: number
): MonitoringAlert[] {
  if (!config.enabled) return [];
  const alerts: MonitoringAlert[] = [];
  const now = new Date().toISOString();

  Array.from(groupByMetric(trendData).entries()).forEach(([metric, points]) => {
    if (!metricsMatch(config.metrics, metric)) return;
    if (points.length < minDataPoints) return;

    const lookback = config.lookback_window > 0 ? points.slice(-config.lookback_window) : points;

    const values = lookback.map((p) => p.avg);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const stddev = Math.sqrt(variance);

    if (stddev === 0) return; // constant data — skip

    const latest = points[points.length - 1];
    const z = (latest.avg - mean) / stddev;

    if (Math.abs(z) > config.threshold) {
      alerts.push({
        id: `anomaly-zscore-${metric}`,
        type: toSeverity(config.severity),
        title: `Z-score anomaly`,
        message: `Latest value ${latest.avg.toFixed(3)} has z-score ${z.toFixed(2)} (threshold: \u00b1${config.threshold})`,
        timestamp: now,
        category: 'anomaly',
        method: 'z-score',
        metric,
        metadata: {
          currentValue: latest.avg,
          threshold: config.threshold,
          deviation: Math.abs(z),
          direction: z > 0 ? 'above' : 'below',
          unit: 'score',
          zScore: z,
        },
      });
    }
  });

  return alerts;
}

// ---------------------------------------------------------------------------
// Moving Average detector
// ---------------------------------------------------------------------------

export function detectMovingAverageAnomalies(
  trendData: MonitoringTrendData[],
  config: MovingAverageConfig,
  minDataPoints: number
): MonitoringAlert[] {
  if (!config.enabled) return [];
  const alerts: MonitoringAlert[] = [];
  const now = new Date().toISOString();

  Array.from(groupByMetric(trendData).entries()).forEach(([metric, points]) => {
    if (!metricsMatch(config.metrics, metric)) return;
    if (points.length < minDataPoints) return;

    const windowSize = Math.min(config.window_size, points.length - 1);
    if (windowSize < 1) return;

    // Compute MA over the last `windowSize` points before the latest
    const maSlice = points.slice(-(windowSize + 1), -1);
    const ma = maSlice.reduce((s, p) => s + p.avg, 0) / maSlice.length;

    const latest = points[points.length - 1];
    const deviation = Math.abs(latest.avg - ma);

    if (deviation > config.deviation_threshold) {
      alerts.push({
        id: `anomaly-ma-${metric}`,
        type: toSeverity(config.severity),
        title: `Moving average anomaly`,
        message: `Latest value ${latest.avg.toFixed(3)} deviates ${deviation.toFixed(3)} from MA ${ma.toFixed(3)} (threshold: ${config.deviation_threshold})`,
        timestamp: now,
        category: 'anomaly',
        method: 'moving-average',
        metric,
        metadata: {
          currentValue: latest.avg,
          threshold: config.deviation_threshold,
          deviation,
          direction: latest.avg > ma ? 'above' : 'below',
          unit: 'score',
          movingAverage: ma,
        },
      });
    }
  });

  return alerts;
}

// ---------------------------------------------------------------------------
// Rate of Change detector
// ---------------------------------------------------------------------------

export function detectRateOfChangeAnomalies(
  trendData: MonitoringTrendData[],
  config: RateOfChangeConfig,
  minDataPoints: number
): MonitoringAlert[] {
  if (!config.enabled) return [];
  const alerts: MonitoringAlert[] = [];
  const now = new Date().toISOString();

  Array.from(groupByMetric(trendData).entries()).forEach(([metric, points]) => {
    if (!metricsMatch(config.metrics, metric)) return;
    if (points.length < Math.max(2, minDataPoints)) return;

    const prev = points[points.length - 2];
    const latest = points[points.length - 1];
    const change = Math.abs(latest.avg - prev.avg);

    if (change > config.threshold) {
      const direction = latest.avg > prev.avg ? 'increased' : 'decreased';
      alerts.push({
        id: `anomaly-roc-${metric}`,
        type: toSeverity(config.severity),
        title: `Rapid change`,
        message: `Score ${direction} by ${change.toFixed(3)} (${prev.avg.toFixed(3)} \u2192 ${latest.avg.toFixed(3)}, threshold: ${config.threshold})`,
        timestamp: now,
        category: 'anomaly',
        method: 'rate-of-change',
        metric,
        metadata: {
          currentValue: latest.avg,
          threshold: config.threshold,
          deviation: change,
          direction,
          unit: 'score',
          previousValue: prev.avg,
        },
      });
    }
  });

  return alerts;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function detectAnomalies(
  trendData: MonitoringTrendData[],
  config: AnomalyDetectionConfig
): MonitoringAlert[] {
  if (!config.enabled || trendData.length === 0) return [];

  return [
    ...detectZScoreAnomalies(trendData, config.z_score, config.min_data_points),
    ...detectMovingAverageAnomalies(trendData, config.moving_average, config.min_data_points),
    ...detectRateOfChangeAnomalies(trendData, config.rate_of_change, config.min_data_points),
  ];
}

// ---------------------------------------------------------------------------
// Threshold alerts (moved from monitoring/page.tsx)
// ---------------------------------------------------------------------------

export function generateThresholdAlerts(
  metrics: MonitoringSummaryMetrics,
  thresholds: { good: number; pass: number } = { good: 0.7, pass: 0.5 }
): MonitoringAlert[] {
  const alerts: MonitoringAlert[] = [];
  const now = new Date().toISOString();

  if (metrics.avgScore < thresholds.good && metrics.totalRecords > 0) {
    alerts.push({
      id: 'low-score',
      type: 'warning',
      title: 'Average score below threshold',
      message: `Average score is ${metrics.avgScore.toFixed(2)}, below the ${thresholds.good} threshold`,
      timestamp: now,
      category: 'threshold',
      method: 'threshold',
      metric: 'Average Score',
      metadata: {
        currentValue: metrics.avgScore,
        threshold: thresholds.good,
        deviation: thresholds.good - metrics.avgScore,
        direction: 'below',
        unit: 'score',
      },
    });
  }

  if (metrics.passRate < 70 && metrics.totalRecords > 0) {
    alerts.push({
      id: 'low-pass-rate',
      type: 'error',
      title: 'Low pass rate',
      message: `Pass rate is ${metrics.passRate.toFixed(1)}%, below the 70% target`,
      timestamp: now,
      category: 'threshold',
      method: 'threshold',
      metric: 'Pass Rate',
      metadata: {
        currentValue: metrics.passRate,
        threshold: 70,
        deviation: 70 - metrics.passRate,
        direction: 'below',
        unit: '%',
      },
    });
  }

  if (metrics.errorRate > 5 && metrics.totalRecords > 0) {
    alerts.push({
      id: 'high-error-rate',
      type: 'error',
      title: 'High error rate',
      message: `Error rate is ${metrics.errorRate.toFixed(1)}%, above the 5% threshold`,
      timestamp: now,
      category: 'threshold',
      method: 'threshold',
      metric: 'Error Rate',
      metadata: {
        currentValue: metrics.errorRate,
        threshold: 5,
        deviation: metrics.errorRate - 5,
        direction: 'above',
        unit: '%',
      },
    });
  }

  if (metrics.p95LatencyMs > 1000 && metrics.totalRecords > 0) {
    alerts.push({
      id: 'high-latency',
      type: 'warning',
      title: 'High P95 latency',
      message: `P95 latency is ${metrics.p95LatencyMs.toFixed(1)}s, above 1000s threshold`,
      timestamp: now,
      category: 'threshold',
      method: 'threshold',
      metric: 'P95 Latency',
      metadata: {
        currentValue: metrics.p95LatencyMs,
        threshold: 1000,
        deviation: metrics.p95LatencyMs - 1000,
        direction: 'above',
        unit: 'ms',
      },
    });
  }

  return alerts;
}
