import type {
  SignalsCaseRecord,
  SignalsKPIConfig,
  SignalsKPIResult,
  SignalsChartDataPoint,
  SignalsDisplayConfig,
} from '@/types';

// ---------------------------------------------------------------------------
// Numeric formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format seconds into a human-readable duration string.
 * e.g. 19201 → "5h 20m", 1921 → "32m 1s", 45 → "45s"
 */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Format a number into compact notation.
 * e.g. 1162 → "1.2K", 1500000 → "1.5M", 42 → "42"
 */
function formatCompact(value: number): string {
  if (!isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value % 1 === 0 ? value.toLocaleString() : value.toFixed(1);
}

/**
 * Format a numeric value based on the configured format string.
 */
function formatNumericValue(value: number, format?: string): string {
  switch (format) {
    case 'duration':
      return formatDuration(value);
    case 'compact':
      return formatCompact(value);
    case 'percent':
      return `${value.toFixed(1)}%`;
    default:
      return value % 1 === 0 ? value.toLocaleString() : value.toFixed(1);
  }
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

/**
 * Compute an aggregate value from a numeric array.
 */
function computeAggregation(values: number[], method: string): number {
  if (values.length === 0) return 0;
  switch (method) {
    case 'mean': {
      const sum = values.reduce((a, b) => a + b, 0);
      return sum / values.length;
    }
    case 'median': {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'count':
      return values.length;
    case 'p95': {
      const sorted = [...values].sort((a, b) => a - b);
      const idx = Math.ceil(0.95 * sorted.length) - 1;
      return sorted[Math.max(0, idx)];
    }
    default:
      return values.reduce((a, b) => a + b, 0) / values.length;
  }
}

/**
 * Build weekly sparkline for a numeric signal using an aggregation method.
 */
function buildWeeklyNumericSparkline(
  cases: SignalsCaseRecord[],
  fieldKey: string,
  aggregation: string
): { date: string; value: number }[] {
  const weekly = new Map<string, number[]>();

  cases.forEach((c) => {
    if (!c.Timestamp) return;
    const d = new Date(c.Timestamp);
    if (isNaN(d.getTime())) return;
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const ws = new Date(d);
    ws.setDate(diff);
    const weekKey = ws.toISOString().split('T')[0];
    const val = Number(c[fieldKey]);
    if (!isNaN(val)) {
      const bucket = weekly.get(weekKey) ?? [];
      bucket.push(val);
      weekly.set(weekKey, bucket);
    }
  });

  return Array.from(weekly.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date,
      value: computeAggregation(vals, aggregation),
    }));
}

/**
 * Build weekly sparkline for a boolean signal.
 */
function buildWeeklySparkline(
  cases: SignalsCaseRecord[],
  fieldKey: string,
  format?: string
): { date: string; value: number }[] {
  const weekly = new Map<string, { total: number; trueCount: number; sum: number }>();

  cases.forEach((c) => {
    if (!c.Timestamp) return;
    const d = new Date(c.Timestamp);
    if (isNaN(d.getTime())) return;
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const ws = new Date(d);
    ws.setDate(diff);
    const weekKey = ws.toISOString().split('T')[0];
    const bucket = weekly.get(weekKey) ?? { total: 0, trueCount: 0, sum: 0 };
    bucket.total++;
    if (Boolean(c[fieldKey])) bucket.trueCount++;
    bucket.sum += Number(c[fieldKey]) || 0;
    weekly.set(weekKey, bucket);
  });

  return Array.from(weekly.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      value: format === 'percent' && b.total > 0 ? (b.trueCount / b.total) * 100 : b.trueCount,
    }));
}

/**
 * Compute KPI values from cases based on display config.
 */
export function computeKPIs(
  cases: SignalsCaseRecord[],
  kpiConfig: SignalsKPIConfig[]
): SignalsKPIResult[] {
  const total = cases.length;

  return kpiConfig.map((kpi) => {
    if (kpi.aggregate) {
      // Aggregate KPIs
      if (kpi.aggregate === 'total_cases') {
        return {
          key: 'total_cases',
          label: kpi.label,
          value: total.toLocaleString(),
          icon: kpi.icon,
          highlight: kpi.highlight,
          rawValue: total,
          totalCases: total,
        };
      }
      if (kpi.aggregate === 'avg_message_count') {
        const avg =
          total > 0 ? cases.reduce((sum, c) => sum + (Number(c.Message_Count) || 0), 0) / total : 0;
        return {
          key: 'avg_message_count',
          label: kpi.label,
          value: avg.toFixed(1),
          icon: kpi.icon,
          highlight: kpi.highlight,
          rawValue: avg,
          totalCases: total,
        };
      }
      return { key: kpi.aggregate, label: kpi.label, value: '—', icon: kpi.icon };
    }

    // Numeric aggregation KPIs (discriminant: kpi.aggregation is present)
    if (kpi.metric && kpi.signal && kpi.aggregation) {
      const fieldKey = `${kpi.metric}__${kpi.signal}`;
      const values = cases.map((c) => Number(c[fieldKey])).filter((v) => !isNaN(v) && isFinite(v));
      const agg = computeAggregation(values, kpi.aggregation);
      const sparkline = buildWeeklyNumericSparkline(cases, fieldKey, kpi.aggregation);
      const metricName = kpi.metric.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

      return {
        key: fieldKey,
        label: kpi.label,
        value: formatNumericValue(agg, kpi.format),
        icon: kpi.icon,
        highlight: kpi.highlight,
        rawValue: agg,
        format: kpi.format,
        aggregation: kpi.aggregation,
        sparkline,
        totalCases: total,
        metricName,
      };
    }

    // Metric signal KPIs (boolean rate)
    if (kpi.metric && kpi.signal) {
      const fieldKey = `${kpi.metric}__${kpi.signal}`;
      const trueCount = cases.filter((c) => Boolean(c[fieldKey])).length;
      const rate = total > 0 ? (trueCount / total) * 100 : 0;
      const sparkline = buildWeeklySparkline(cases, fieldKey, kpi.format);
      const metricName = kpi.metric.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

      if (kpi.format === 'percent') {
        return {
          key: fieldKey,
          label: kpi.label,
          value: `${rate.toFixed(1)}%`,
          icon: kpi.icon,
          highlight: kpi.highlight,
          rawValue: rate,
          format: 'percent',
          sparkline,
          totalCases: total,
          metricName,
        };
      }
      return {
        key: fieldKey,
        label: kpi.label,
        value: trueCount.toLocaleString(),
        icon: kpi.icon,
        highlight: kpi.highlight,
        rawValue: trueCount,
        sparkline,
        totalCases: total,
        metricName,
      };
    }

    return { key: kpi.label, label: kpi.label, value: '—', icon: kpi.icon };
  });
}

/**
 * Compute distribution data for a classification signal.
 */
export function computeClassificationDistribution(
  cases: SignalsCaseRecord[],
  metric: string,
  signal: string,
  colorMap?: Record<string, string>
): SignalsChartDataPoint[] {
  const key = `${metric}__${signal}`;
  const counts = new Map<string, number>();

  cases.forEach((c) => {
    const val = c[key];
    if (val != null && val !== '') {
      const strVal = String(val);
      counts.set(strVal, (counts.get(strVal) || 0) + 1);
    }
  });

  const total = cases.length;
  const palette = [
    '#8B9F4F',
    '#D4AF37',
    '#B8C5D3',
    '#A4B86C',
    '#6B7A3A',
    '#F39C12',
    '#E74C3C',
    '#7F8C8D',
  ];

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count], i) => ({
      name,
      count,
      rate: total > 0 ? (count / total) * 100 : 0,
      color: colorMap?.[name] ?? palette[i % palette.length],
    }));
}

/**
 * Compute trend data for boolean signals over time.
 */
export function computeSignalTrend(
  cases: SignalsCaseRecord[],
  signals: { metric: string; signal: string; label: string }[]
): { date: string; values: Record<string, number> }[] {
  if (cases.length === 0) return [];

  // Group by week
  const weeklyData = new Map<string, SignalsCaseRecord[]>();

  cases.forEach((c) => {
    if (!c.Timestamp) return;
    const date = new Date(c.Timestamp);
    if (isNaN(date.getTime())) return;
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(date);
    weekStart.setDate(diff);
    const weekKey = weekStart.toISOString().split('T')[0];

    if (!weeklyData.has(weekKey)) {
      weeklyData.set(weekKey, []);
    }
    weeklyData.get(weekKey)!.push(c);
  });

  const sortedWeeks = Array.from(weeklyData.keys()).sort();

  return sortedWeeks.map((week) => {
    const weekCases = weeklyData.get(week)!;
    const total = weekCases.length;
    const values: Record<string, number> = {};

    signals.forEach(({ metric, signal, label }) => {
      const key = `${metric}__${signal}`;
      const count = weekCases.filter((c) => Boolean(c[key])).length;
      values[label] = total > 0 ? (count / total) * 100 : 0;
    });

    return { date: week, values };
  });
}

/**
 * Try to parse a value as a JS array. Handles JSON strings from DuckDB storage.
 */
function tryParseArray(val: unknown): string[] | null {
  if (Array.isArray(val)) {
    return val.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (item): item is string => typeof item === 'string' && item.trim() !== ''
          );
        }
      } catch {
        /* not JSON */
      }
    }
  }
  return null;
}

/**
 * Compute ranked list data from array or string signals (with frequency counts).
 * Used for short categorical values like categories.
 */
export function computeRankedList(
  cases: SignalsCaseRecord[],
  metric: string,
  signal: string,
  limit: number = 8
): { name: string; count: number }[] {
  const key = `${metric}__${signal}`;
  const counts = new Map<string, number>();

  cases.forEach((c) => {
    const parsed = tryParseArray(c[key]);
    if (parsed) {
      parsed.forEach((item) => {
        counts.set(item, (counts.get(item) || 0) + 1);
      });
    } else if (typeof c[key] === 'string' && (c[key] as string).trim()) {
      const s = (c[key] as string).trim();
      counts.set(s, (counts.get(s) || 0) + 1);
    }
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

/**
 * Collect unique text items from array or string signals (no frequency counting).
 * Used for long-form content like learnings, feature requests, suggested actions.
 */
export function computeTextList(
  cases: SignalsCaseRecord[],
  metric: string,
  signal: string,
  limit: number = 15
): string[] {
  const key = `${metric}__${signal}`;
  const seen = new Set<string>();
  const items: string[] = [];

  cases.forEach((c) => {
    const parsed = tryParseArray(c[key]);
    if (parsed) {
      parsed.forEach((item) => {
        if (!seen.has(item)) {
          seen.add(item);
          items.push(item);
        }
      });
    } else if (typeof c[key] === 'string' && (c[key] as string).trim()) {
      const s = (c[key] as string).trim();
      if (!seen.has(s)) {
        seen.add(s);
        items.push(s);
      }
    }
  });

  return items.slice(0, limit);
}

/**
 * Compute a single boolean stat for a metric signal.
 */
export function computeBooleanStat(
  cases: SignalsCaseRecord[],
  metric: string,
  signal: string
): { trueCount: number; total: number; rate: number } {
  const key = `${metric}__${signal}`;
  const trueCount = cases.filter((c) => Boolean(c[key])).length;
  const total = cases.length;
  return {
    trueCount,
    total,
    rate: total > 0 ? (trueCount / total) * 100 : 0,
  };
}

/**
 * Filter cases based on source selections and metric filters.
 */
export function filterSignalsCases(
  cases: SignalsCaseRecord[],
  opts: {
    sourceName?: string;
    sourceComponent?: string;
    environment?: string;
    metricFilters?: Record<string, string[]>;
    startDate?: string;
    endDate?: string;
  }
): SignalsCaseRecord[] {
  return cases.filter((c) => {
    if (opts.sourceName && c.source_name !== opts.sourceName) return false;
    if (opts.sourceComponent && c.source_component !== opts.sourceComponent) return false;
    if (opts.environment && c.environment !== opts.environment) return false;

    // Time range filter
    if (opts.startDate || opts.endDate) {
      if (c.Timestamp) {
        const recordDate = new Date(c.Timestamp).toISOString().split('T')[0];
        if (opts.startDate && recordDate < opts.startDate) return false;
        if (opts.endDate && recordDate > opts.endDate) return false;
      }
    }

    // Metric filters
    if (opts.metricFilters) {
      for (const [key, selectedValues] of Object.entries(opts.metricFilters)) {
        if (selectedValues.length === 0) continue;
        const cellValue = String(c[key] ?? '');
        if (!selectedValues.includes(cellValue)) return false;
      }
    }

    return true;
  });
}

/**
 * Extract trend signal configs from display config for boolean KPIs.
 */
export function extractTrendSignals(
  displayConfig: SignalsDisplayConfig
): { metric: string; signal: string; label: string }[] {
  return displayConfig.kpi_strip
    .filter((kpi) => kpi.metric && kpi.signal && kpi.format === 'percent')
    .map((kpi) => ({
      metric: kpi.metric!,
      signal: kpi.signal!,
      label: kpi.label,
    }));
}
