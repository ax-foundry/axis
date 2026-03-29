import { formatDuration } from '@/lib/human-signals-utils';

import type { KpiUnit } from '@/types';

/**
 * Format a KPI value for display as a string (e.g., "85.3%", "2m 15s", "42").
 */
export function formatKpiValue(value: number | null, unit: KpiUnit): string {
  if (value === null || value === undefined) return '--';
  switch (unit) {
    case 'percent':
      return `${(value * 100).toFixed(1)}%`;
    case 'seconds':
      return formatDuration(value);
    case 'score':
      return value.toFixed(2);
    case 'count':
      return value.toFixed(0);
    default:
      return String(value);
  }
}

/**
 * Convert a raw KPI value for chart display (e.g., percent × 100).
 */
export function formatKpiChartValue(value: number | null, unit: KpiUnit): number | null {
  if (value === null) return null;
  if (unit === 'percent') return value * 100;
  return value;
}
