'use client';

import { CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

import type { MonitoringAlert } from '@/types';

// ---------------------------------------------------------------------------
// Method pill colors
// ---------------------------------------------------------------------------

const METHOD_STYLES: Record<string, string> = {
  'z-score': 'bg-blue-50 text-blue-700',
  'moving-average': 'bg-purple-50 text-purple-700',
  'rate-of-change': 'bg-orange-50 text-orange-700',
  threshold: 'bg-gray-100 text-gray-600',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatValue(value: number | undefined, unit?: string): string {
  if (value === undefined || value === null) return '-';
  if (unit === '%') return `${value.toFixed(1)}%`;
  if (unit === 'ms') return `${value.toFixed(0)}ms`;
  return value.toFixed(3);
}

function formatSigned(value: number | undefined, unit?: string): string {
  if (value === undefined || value === null) return '-';
  const sign = value > 0 ? '+' : '';
  if (unit === '%') return `${sign}${value.toFixed(1)}pp`;
  if (unit === 'ms') return `${sign}${value.toFixed(0)}ms`;
  return `${sign}${value.toFixed(3)}`;
}

/** Pick the 3 value blocks to render for a given alert method. */
function getValueBlocks(alert: MonitoringAlert): { label: string; value: string }[] {
  const m = alert.metadata;
  if (!m) return [];

  switch (alert.method) {
    case 'z-score':
      return [
        { label: 'Current', value: formatValue(m.currentValue, m.unit) },
        { label: 'Z-Score', value: m.zScore !== undefined ? m.zScore.toFixed(2) : '-' },
        {
          label: 'Threshold',
          value: m.threshold !== undefined ? `\u00b1${m.threshold}` : '-',
        },
      ];
    case 'moving-average':
      return [
        { label: 'Current', value: formatValue(m.currentValue, m.unit) },
        { label: 'MA', value: m.movingAverage !== undefined ? m.movingAverage.toFixed(3) : '-' },
        { label: 'Deviation', value: formatValue(m.deviation, m.unit) },
      ];
    case 'rate-of-change':
      return [
        { label: 'Current', value: formatValue(m.currentValue, m.unit) },
        { label: 'Previous', value: formatValue(m.previousValue, m.unit) },
        { label: 'Change', value: formatSigned(m.deviation, m.unit) },
      ];
    case 'threshold': {
      const gap =
        m.currentValue !== undefined && m.threshold !== undefined
          ? m.currentValue - m.threshold
          : undefined;
      return [
        { label: 'Current', value: formatValue(m.currentValue, m.unit) },
        { label: 'Target', value: formatValue(m.threshold, m.unit) },
        { label: 'Gap', value: formatSigned(gap, m.unit) },
      ];
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryStrip({ alerts }: { alerts: MonitoringAlert[] }) {
  const errorCount = alerts.filter((a) => a.type === 'error').length;
  const warningCount = alerts.filter((a) => a.type === 'warning').length;

  if (alerts.length === 0) {
    return (
      <div className="border-success/30 bg-success/5 flex items-center gap-2 rounded-lg border px-4 py-3">
        <CheckCircle2 className="h-5 w-5 text-success" />
        <span className="text-sm font-medium text-success">All systems nominal</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {errorCount > 0 && (
        <span className="bg-error/10 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-error">
          <span className="h-1.5 w-1.5 rounded-full bg-error" />
          {errorCount} Error{errorCount !== 1 ? 's' : ''}
        </span>
      )}
      {warningCount > 0 && (
        <span className="bg-warning/10 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-warning">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          {warningCount} Warning{warningCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

function MethodPill({ method }: { method?: string }) {
  if (!method) return null;
  const style = METHOD_STYLES[method] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', style)}>{method}</span>
  );
}

function ValueBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-gray-50 px-3 py-2">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="font-mono text-sm font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function AlertCard({ alert }: { alert: MonitoringAlert }) {
  const blocks = getValueBlocks(alert);
  const hasStructuredData = blocks.length > 0;

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-white p-4',
        alert.type === 'error' ? 'border-l-4 border-l-error' : 'border-l-4 border-l-warning'
      )}
    >
      {/* Row 1: severity dot + title + severity badge + method pill */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'h-2 w-2 flex-shrink-0 rounded-full',
            alert.type === 'error' ? 'bg-error' : 'bg-warning'
          )}
        />
        <span className="text-sm font-medium text-text-primary">{alert.title}</span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
            alert.type === 'error' ? 'bg-error/10 text-error' : 'bg-warning/10 text-warning'
          )}
        >
          {alert.type}
        </span>
        <MethodPill method={alert.method} />
      </div>

      {/* Row 2: metric name */}
      {alert.metric && <div className="mt-1 pl-4 text-xs text-text-muted">{alert.metric}</div>}

      {/* Row 3: structured value blocks OR fallback prose */}
      {hasStructuredData ? (
        <div className="mt-3 grid grid-cols-3 gap-2 pl-4">
          {blocks.map((block) => (
            <ValueBlock key={block.label} label={block.label} value={block.value} />
          ))}
        </div>
      ) : (
        <p className="mt-2 pl-4 text-sm text-text-muted">{alert.message}</p>
      )}
    </div>
  );
}

function AlertGroup({
  title,
  alerts,
  defaultExpanded = true,
}: {
  title: string;
  alerts: MonitoringAlert[];
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 py-2"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-text-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 text-text-muted" />
        )}
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          {title}
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-text-muted">
          {alerts.length}
        </span>
      </button>
      {expanded && (
        <div className="space-y-3 pb-2">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface AlertsTabProps {
  alerts: MonitoringAlert[];
}

export function AlertsTab({ alerts }: AlertsTabProps) {
  const { thresholdAlerts, anomalyAlerts } = useMemo(() => {
    const threshold: MonitoringAlert[] = [];
    const anomaly: MonitoringAlert[] = [];

    alerts.forEach((a) => {
      if (a.category === 'anomaly') {
        anomaly.push(a);
      } else {
        // Default to threshold for backward compat (no category)
        threshold.push(a);
      }
    });

    return { thresholdAlerts: threshold, anomalyAlerts: anomaly };
  }, [alerts]);

  // Empty state
  if (alerts.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-white p-8">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <CheckCircle2 className="mb-3 h-12 w-12 text-success opacity-40" />
          <p className="text-sm font-medium text-text-primary">All systems nominal</p>
          <p className="mt-1 text-xs text-text-muted">No alerts detected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <SummaryStrip alerts={alerts} />

      {/* Grouped sections */}
      <div className="rounded-lg border border-border bg-white p-5">
        <div className="space-y-2">
          {thresholdAlerts.length > 0 && (
            <AlertGroup title="Threshold Alerts" alerts={thresholdAlerts} />
          )}
          {anomalyAlerts.length > 0 && (
            <AlertGroup title="Anomaly Detection" alerts={anomalyAlerts} />
          )}
        </div>
      </div>
    </div>
  );
}
