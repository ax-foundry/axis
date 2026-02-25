'use client';

import {
  X,
  ChevronDown,
  ChevronRight,
  Star,
  CheckCircle,
  XCircle,
  AlertCircle,
  Copy,
  ExternalLink,
  MessageSquareText,
  Lightbulb,
  Activity,
  Cpu,
  Globe,
  Timer,
  Calendar,
} from 'lucide-react';
import React, { useState } from 'react';

import { pythonToJson } from '@/components/shared';
import { cn } from '@/lib/utils';
import { Colors, Thresholds } from '@/types';

import type { MonitoringRecord } from '@/types';

interface Signal {
  name: string;
  value: unknown;
  score?: number | null;
  description?: string;
  headline_display?: boolean;
}

interface GroupedSignals {
  [group: string]: Signal[];
}

interface FailingOutputDetailModalProps {
  record: MonitoringRecord | null;
  metricName: string;
  metricScore: number;
  onClose: () => void;
}

function getScoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) return Colors.accentSilver;
  if (score >= Thresholds.GREEN_THRESHOLD) return Colors.success;
  if (score <= Thresholds.RED_THRESHOLD) return Colors.error;
  return Colors.warning;
}

function formatScore(score: number): string {
  return score.toFixed(3);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'N/A';
    return formatScore(value);
  }
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

// ---- Inline markdown rendering (similar to signals' parseSlackMarkdown) ----

function parseInlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match: *bold*, `code`, [n] references
  const regex = /\*([^*]+)\*|`([^`]+)`|\[(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      nodes.push(
        <strong key={key++} className="font-semibold">
          {match[1]}
        </strong>
      );
    } else if (match[2]) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-gray-200 px-1 py-0.5 font-mono text-xs text-text-primary"
        >
          {match[2]}
        </code>
      );
    } else if (match[3]) {
      nodes.push(
        <sup key={key++} className="text-[9px] font-medium text-primary">
          [{match[3]}]
        </sup>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {parseInlineMarkdown(line)}
        </span>
      ))}
    </>
  );
}

// ---- Metadata value classification & rendering ----

interface MetadataField {
  key: string;
  label: string;
  value: unknown;
  isComplex: boolean;
}

function classifyAsComplex(value: unknown): boolean {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return false;
  if (typeof value === 'string') return value.length > 100;
  if (Array.isArray(value)) return value.length > 0 && value.some((v) => typeof v === 'object');
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return false;
}

function getComplexValuePreview(value: unknown): string {
  if (typeof value === 'string') {
    const oneLine = value.trim().replace(/\s+/g, ' ');
    return oneLine.length > 80 ? oneLine.slice(0, 80) + '\u2026' : oneLine;
  }
  if (Array.isArray(value)) return `${value.length} item${value.length !== 1 ? 's' : ''}`;
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value);
    return `${keys.length} field${keys.length !== 1 ? 's' : ''}`;
  }
  return String(value);
}

function InlineMetadataValue({ value }: { value: unknown }) {
  if (value == null) return <span className="text-text-muted">&mdash;</span>;
  if (typeof value === 'boolean')
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
          value ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-text-muted'
        )}
      >
        {value ? 'Yes' : 'No'}
      </span>
    );
  if (typeof value === 'number')
    return (
      <span className="font-mono font-medium text-text-secondary">{value.toLocaleString()}</span>
    );
  if (Array.isArray(value))
    return value.length === 0 ? (
      <span className="text-text-muted">&mdash;</span>
    ) : (
      <span className="break-words font-medium text-text-secondary">{value.join(', ')}</span>
    );
  if (typeof value === 'object' && value !== null)
    return Object.keys(value).length === 0 ? (
      <span className="text-text-muted">&mdash;</span>
    ) : (
      <span className="font-medium text-text-secondary">{JSON.stringify(value)}</span>
    );
  return <span className="break-words font-medium text-text-secondary">{String(value)}</span>;
}

function StructuredValueView({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value == null) return <span className="text-text-muted">&mdash;</span>;

  if (typeof value === 'boolean')
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
          value ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-text-muted'
        )}
      >
        {value ? 'Yes' : 'No'}
      </span>
    );
  if (typeof value === 'number')
    return <span className="font-mono text-sm">{value.toLocaleString()}</span>;

  if (typeof value === 'string') {
    if (value.length > 120)
      return (
        <div className="border-border/30 max-h-48 overflow-y-auto rounded border bg-white p-2">
          <p className="text-sm leading-relaxed text-text-secondary">
            <MarkdownContent content={value} />
          </p>
        </div>
      );
    return (
      <span className="break-words text-sm text-text-secondary">
        <MarkdownContent content={value} />
      </span>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-text-muted">&mdash;</span>;
    if (value.every((v) => typeof v !== 'object' || v === null))
      return <span className="break-words text-sm text-text-secondary">{value.join(', ')}</span>;
    return (
      <div className="space-y-1.5">
        {value.map((item, i) => (
          <div key={i} className="border-border/30 rounded border bg-white/80 p-2">
            <span className="mr-2 text-[10px] font-semibold text-text-muted">#{i + 1}</span>
            <StructuredValueView value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-text-muted">&mdash;</span>;

    if (depth > 2) {
      return (
        <pre className="max-h-32 overflow-auto rounded bg-gray-100 p-2 font-mono text-xs text-text-secondary">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    }

    return (
      <div className={cn(depth > 0 && 'border-border/30 ml-3 border-l-2 pl-3')}>
        <dl className="space-y-1.5">
          {entries.map(([k, v]) => {
            const hasNestedContent =
              (typeof v === 'object' &&
                v !== null &&
                (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0)) ||
              (typeof v === 'string' && v.length > 120);
            return (
              <div key={k} className={hasNestedContent ? '' : 'flex items-baseline gap-2'}>
                <dt
                  className={cn(
                    'shrink-0 text-[10px] text-text-muted',
                    hasNestedContent && 'mb-0.5 font-semibold uppercase tracking-wider'
                  )}
                >
                  {k.replace(/_/g, ' ')}
                  {!hasNestedContent && ':'}
                </dt>
                <dd className={hasNestedContent ? 'mt-0.5' : ''}>
                  <StructuredValueView value={v} depth={depth + 1} />
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    );
  }

  return <span className="text-sm">{String(value)}</span>;
}

function parseGroupName(groupName: string): { label: string; preview?: string } {
  const statementMatch = groupName.match(/^(statement_\d+)\s*\((.+)\)$/);
  if (statementMatch) {
    return {
      label: statementMatch[1].replace('_', ' ').toUpperCase(),
      preview:
        statementMatch[2].length > 60
          ? statementMatch[2].substring(0, 60) + '...'
          : statementMatch[2],
    };
  }
  return { label: groupName };
}

function SignalRow({
  signal,
  isExpanded,
  onToggle,
}: {
  signal: Signal;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const scoreColor = getScoreColor(signal.score);
  const hasDetails = signal.description && signal.description !== `Signal: ${signal.name}`;
  const isVerdict = signal.name === 'verdict';
  const isStatement = signal.name === 'statement';
  const isReason = signal.name === 'reason';
  const valueStr = String(signal.value).toLowerCase();
  const isPositive = valueStr === 'yes' || valueStr === 'true' || signal.score === 1;
  const isNegative = valueStr === 'no' || valueStr === 'false' || signal.score === 0;

  const canExpand =
    hasDetails ||
    isStatement ||
    isReason ||
    (typeof signal.value === 'object' && signal.value !== null);

  return (
    <div className="border-border/30 border-b last:border-b-0">
      <button
        onClick={canExpand ? onToggle : undefined}
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
          canExpand ? 'cursor-pointer hover:bg-primary/5' : 'cursor-default'
        )}
      >
        {canExpand ? (
          isExpanded ? (
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-muted" />
          )
        ) : (
          <div className="h-4 w-4 flex-shrink-0" />
        )}

        {signal.headline_display && (
          <Star className="h-3 w-3 flex-shrink-0 text-amber-500" fill="currentColor" />
        )}

        <span
          className={cn(
            'min-w-[80px] flex-shrink-0 text-sm font-medium',
            isVerdict ? 'text-text-primary' : 'text-text-muted'
          )}
        >
          {signal.name}
        </span>

        {isVerdict ? (
          <div className="flex flex-1 items-center gap-2">
            {isPositive ? (
              <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-600" />
            ) : isNegative ? (
              <XCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
            ) : (
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-yellow-500" />
            )}
            <span
              className={cn(
                'text-sm font-medium',
                isPositive ? 'text-green-600' : isNegative ? 'text-red-500' : 'text-yellow-600'
              )}
            >
              {String(signal.value).toUpperCase()}
            </span>
          </div>
        ) : (
          <span
            className={cn(
              'flex-1 text-sm',
              isStatement || isReason ? 'truncate text-text-secondary' : 'text-text-secondary'
            )}
          >
            {formatValue(signal.value)}
          </span>
        )}

        {signal.score !== null && signal.score !== undefined && !isVerdict && (
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: scoreColor }} />
            <span className="text-xs font-medium" style={{ color: scoreColor }}>
              {formatScore(signal.score)}
            </span>
          </div>
        )}
      </button>

      {isExpanded && canExpand && (
        <div className="space-y-2 px-3 pb-3 pl-10">
          {(isStatement || isReason) && typeof signal.value === 'string' && (
            <p className="rounded-md bg-gray-50 p-2 text-sm leading-relaxed text-text-secondary">
              {signal.value}
            </p>
          )}
          {hasDetails && (
            <p className="text-xs italic leading-relaxed text-text-muted">{signal.description}</p>
          )}
          {typeof signal.value === 'object' && signal.value !== null && (
            <pre className="max-h-32 overflow-x-auto overflow-y-auto rounded-md bg-gray-100 p-2 text-xs text-text-secondary">
              {JSON.stringify(signal.value, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function SignalGroup({ groupName, signals }: { groupName: string; signals: Signal[] }) {
  const [expandedSignals, setExpandedSignals] = useState<Set<number>>(new Set());
  const [isGroupExpanded, setIsGroupExpanded] = useState(groupName === 'overall');

  const toggleSignal = (index: number) => {
    setExpandedSignals((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const { label, preview } = parseGroupName(groupName);

  const verdictSignal = signals.find((s) => s.name === 'verdict');
  const verdictValue = verdictSignal ? String(verdictSignal.value).toLowerCase() : null;
  const isPositiveVerdict =
    verdictValue === 'yes' || verdictValue === 'true' || verdictSignal?.score === 1;
  const isNegativeVerdict =
    verdictValue === 'no' || verdictValue === 'false' || verdictSignal?.score === 0;

  const sortedSignals = [...signals].sort((a, b) => {
    if (a.name === 'verdict') return -1;
    if (b.name === 'verdict') return 1;
    if (a.headline_display && !b.headline_display) return -1;
    if (!a.headline_display && b.headline_display) return 1;
    if (a.name === 'statement') return -1;
    if (b.name === 'statement') return 1;
    return a.name.localeCompare(b.name);
  });

  const isStatementGroup = groupName.startsWith('statement_');

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border',
        isStatementGroup && verdictSignal
          ? isPositiveVerdict
            ? 'border-green-200 bg-green-50/30'
            : isNegativeVerdict
              ? 'border-red-200 bg-red-50/30'
              : 'border-border/50'
          : 'border-border/50'
      )}
    >
      <button
        onClick={() => setIsGroupExpanded(!isGroupExpanded)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 transition-colors',
          isStatementGroup && verdictSignal
            ? isPositiveVerdict
              ? 'bg-green-50 hover:bg-green-100'
              : isNegativeVerdict
                ? 'bg-red-50 hover:bg-red-100'
                : 'bg-primary/5 hover:bg-primary/10'
            : 'bg-primary/5 hover:bg-primary/10'
        )}
      >
        {isGroupExpanded ? (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-text-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-muted" />
        )}

        {isStatementGroup &&
          verdictSignal &&
          (isPositiveVerdict ? (
            <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-600" />
          ) : isNegativeVerdict ? (
            <XCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-yellow-500" />
          ))}

        <span className="flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-text-primary">
          {label}
        </span>

        {preview && (
          <span className="flex-1 truncate text-left text-xs text-text-muted">{preview}</span>
        )}

        {!preview && (
          <span className="text-xs text-text-muted">
            ({signals.length} signal{signals.length !== 1 ? 's' : ''})
          </span>
        )}
      </button>

      {isGroupExpanded && (
        <div className="bg-white">
          {sortedSignals.map((signal, index) => (
            <SignalRow
              key={index}
              signal={signal}
              isExpanded={expandedSignals.has(index)}
              onToggle={() => toggleSignal(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Parse signals from various formats
function parseSignals(rawSignals: unknown, metricName?: string): GroupedSignals | null {
  if (!rawSignals) return null;

  let signalData: unknown = rawSignals;

  // If it's a string, try to parse as JSON first
  if (typeof signalData === 'string') {
    const rawStr = signalData;
    let parsed = false;

    // Try parsing as valid JSON first (preserves apostrophes in values)
    try {
      signalData = JSON.parse(rawStr);
      parsed = true;
    } catch {
      // Not valid JSON — try converting Python dict syntax to JSON
      try {
        const jsonStr = pythonToJson(rawStr);
        signalData = JSON.parse(jsonStr);
        parsed = true;
      } catch {
        // Not parseable
      }
    }

    if (!parsed) {
      // Treat as raw log output
      const lines = rawStr.split('\n').filter((s: string) => s.trim());
      if (lines.length > 0) {
        return {
          logs: lines.map((line: string, i: number) => ({
            name: `line_${i + 1}`,
            value: line.trim(),
          })),
        } as GroupedSignals;
      }
      return null;
    }
  }

  // If it's an object, check if it contains metric-specific signals
  if (typeof signalData === 'object' && signalData !== null && !Array.isArray(signalData)) {
    const obj = signalData as Record<string, unknown>;

    // Check if this object has metric names as keys (nested by metric)
    if (metricName) {
      const baseMetricName = metricName.replace(/_score$/, '');
      // Try to find signals for this specific metric
      const metricSignalsValue =
        obj[metricName] || obj[baseMetricName] || obj[`${baseMetricName}_signals`];

      if (metricSignalsValue) {
        // Recursively parse the metric-specific signals
        return parseSignals(metricSignalsValue);
      }
    }

    // Check if the object is already in the grouped signals format
    // (keys are group names like "overall", "statement_0", etc.)
    const keys = Object.keys(obj);
    const looksLikeGroupedSignals = keys.some(
      (k) =>
        k === 'overall' ||
        k.startsWith('statement_') ||
        k === 'signals' ||
        k === 'logs' ||
        (Array.isArray(obj[k]) &&
          (obj[k] as unknown[]).length > 0 &&
          typeof (obj[k] as unknown[])[0] === 'object')
    );

    if (looksLikeGroupedSignals) {
      return obj as GroupedSignals;
    }

    // Otherwise, convert the object into signal format
    // (treat each key-value pair as a signal)
    const signals: Signal[] = [];
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined) {
        signals.push({
          name: key,
          value: value,
          score:
            typeof value === 'number' && value >= 0 && value <= 1
              ? value
              : key === 'verdict' &&
                  (String(value).toLowerCase() === 'yes' || String(value).toLowerCase() === 'true')
                ? 1
                : key === 'verdict' &&
                    (String(value).toLowerCase() === 'no' ||
                      String(value).toLowerCase() === 'false')
                  ? 0
                  : undefined,
        });
      }
    }
    if (signals.length > 0) {
      return { overall: signals } as GroupedSignals;
    }
    return null;
  }

  // If it's an array
  if (Array.isArray(signalData)) {
    return {
      signals: signalData.map((s, i) =>
        typeof s === 'string' ? { name: `signal_${i + 1}`, value: s } : s
      ),
    } as GroupedSignals;
  }

  return null;
}

export function FailingOutputDetailModal({
  record,
  metricName,
  metricScore,
  onClose,
}: FailingOutputDetailModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  const [expandedComplexFields, setExpandedComplexFields] = useState<Set<string>>(new Set());

  if (!record) return null;

  const scoreColor = getScoreColor(metricScore);

  // Get the base metric name (without _score suffix)
  const baseMetricName = metricName.replace(/_score$/, '');

  // Try to find metric-specific signals in various formats
  const metricSignals =
    record[`${baseMetricName}_signals`] ||
    record[`${metricName}_signals`] ||
    record[`${baseMetricName}Signals`] ||
    record.signals;

  // Try to find metric-specific explanation
  const metricExplanation =
    (record[`${baseMetricName}_explanation`] as string | undefined) ||
    (record[`${metricName}_explanation`] as string | undefined) ||
    (record[`${baseMetricName}Explanation`] as string | undefined) ||
    (record.explanation as string | undefined);

  // Try to find metric-specific critique
  const metricCritique =
    (record[`${baseMetricName}_critique`] as string | undefined) ||
    (record[`${metricName}_critique`] as string | undefined) ||
    (record[`${baseMetricName}Critique`] as string | undefined) ||
    (record.critique as string | undefined);

  // Try to find metric weight
  const metricWeight =
    (record[`${baseMetricName}_weight`] as number | undefined) ||
    (record[`${metricName}_weight`] as number | undefined) ||
    (record.weight as number | undefined);

  const groupedSignals = parseSignals(metricSignals, metricName);
  const hasSignals = groupedSignals && Object.keys(groupedSignals).length > 0;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Collect and classify metadata fields
  const allMetadataFields: MetadataField[] = [];
  Object.entries(record).forEach(([key, value]) => {
    // Skip standard fields and metric columns
    if (
      [
        'id',
        'trace_id',
        'timestamp',
        'query',
        'actual_output',
        'expected_output',
        'agent_name',
        'environment',
        'latency_ms',
        'error',
        'signals',
        'explanation',
        'critique',
        'evaluation_name',
        'weight',
      ].includes(key)
    )
      return;
    // Skip metric-specific columns
    if (key.endsWith('_score')) return;
    if (key.endsWith('_signals')) return;
    if (key.endsWith('_explanation')) return;
    if (key.endsWith('_critique')) return;
    if (key.endsWith('_weight')) return;
    if (key.endsWith('Signals')) return;
    if (key.endsWith('Explanation')) return;
    if (key.endsWith('Critique')) return;
    if (value === null || value === undefined) return;

    // Try to parse string values that look like JSON or Python dicts
    let parsedValue = value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          parsedValue = JSON.parse(trimmed);
        } catch {
          // Try Python dict syntax (single quotes, None, True, False)
          try {
            parsedValue = JSON.parse(pythonToJson(trimmed));
          } catch {
            // Keep original string
          }
        }
      }
    }

    allMetadataFields.push({
      key,
      label: key.replace(/_/g, ' '),
      value: parsedValue,
      isComplex: classifyAsComplex(parsedValue),
    });
  });

  const simpleFields = allMetadataFields.filter((f) => !f.isComplex);
  const complexFields = allMetadataFields.filter((f) => f.isComplex);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center">
              <span
                className="font-mono text-2xl font-bold leading-none"
                style={{ color: scoreColor }}
              >
                {metricScore.toFixed(3)}
              </span>
              <div
                className="mt-1.5 h-1 w-10 rounded-full"
                style={{ backgroundColor: `${scoreColor}30` }}
              >
                <div
                  className="h-1 rounded-full transition-all"
                  style={{
                    width: `${Math.min(metricScore * 100, 100)}%`,
                    backgroundColor: scoreColor,
                  }}
                />
              </div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <h3 className="text-lg font-semibold text-text-primary">
                {baseMetricName.charAt(0).toUpperCase() +
                  baseMetricName.slice(1).replace(/_/g, ' ')}
              </h3>
              {metricWeight != null && (
                <p className="text-xs text-text-muted">Weight: {metricWeight}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[calc(90vh-80px)] space-y-4 overflow-y-auto p-5">
          {/* Trace ID Banner */}
          {record.trace_id && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-gray-50/50 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                  <ExternalLink className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-medium text-text-muted">Trace ID (Langfuse)</p>
                  <code className="font-mono text-sm font-medium text-text-primary">
                    {record.trace_id}
                  </code>
                </div>
              </div>
              <button
                onClick={() => copyToClipboard(record.trace_id || '', 'trace_id')}
                className="flex items-center gap-1 rounded-md border border-border bg-white px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:border-primary/30 hover:text-primary"
              >
                <Copy className="h-3 w-3" />
                {copiedField === 'trace_id' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}

          {/* Input/Output Section */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  <MessageSquareText className="h-3.5 w-3.5 text-primary-soft" />
                  Input (Query)
                </h4>
                {record.query && (
                  <button
                    onClick={() => copyToClipboard(record.query || '', 'query')}
                    className="flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-primary"
                  >
                    <Copy className="h-3 w-3" />
                    {copiedField === 'query' ? 'Copied!' : 'Copy'}
                  </button>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-gray-50/50 p-3">
                <p className="whitespace-pre-wrap text-sm text-text-secondary">
                  {record.query || 'No input available'}
                </p>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  <Cpu className="h-3.5 w-3.5 text-accent-gold" />
                  LLM Output
                </h4>
                {record.actual_output && (
                  <button
                    onClick={() => copyToClipboard(record.actual_output || '', 'output')}
                    className="flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-primary"
                  >
                    <Copy className="h-3 w-3" />
                    {copiedField === 'output' ? 'Copied!' : 'Copy'}
                  </button>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-gray-50/50 p-3">
                <p className="whitespace-pre-wrap text-sm text-text-secondary">
                  {record.actual_output || 'No output available'}
                </p>
              </div>
            </div>
          </div>

          {/* Expected Output */}
          {record.expected_output && (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
                <CheckCircle className="h-3.5 w-3.5 text-success" />
                Expected Output
              </h4>
              <div className="max-h-32 overflow-y-auto rounded-lg border border-border bg-gray-50/50 p-3">
                <p className="whitespace-pre-wrap text-sm text-text-secondary">
                  {record.expected_output}
                </p>
              </div>
            </div>
          )}

          {/* Explanation */}
          {metricExplanation && (
            <div className="rounded-lg border border-primary/15 bg-primary/[0.03]">
              <h4 className="flex items-center gap-1.5 border-b border-primary/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-primary">
                <Lightbulb className="h-3.5 w-3.5" />
                Explanation
              </h4>
              <div className="p-3">
                <p className="text-sm leading-relaxed text-text-secondary">{metricExplanation}</p>
              </div>
            </div>
          )}

          {/* Critique */}
          {metricCritique && (
            <div className="border-warning/15 bg-warning/[0.03] rounded-lg border">
              <h4 className="border-warning/10 flex items-center gap-1.5 border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-warning">
                <AlertCircle className="h-3.5 w-3.5" />
                Critique
              </h4>
              <div className="p-3">
                <p className="text-sm leading-relaxed text-text-secondary">{metricCritique}</p>
              </div>
            </div>
          )}

          {/* Signals */}
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
              <Activity className="h-3.5 w-3.5 text-primary" />
              Signals
            </h4>
            {hasSignals ? (
              <div className="space-y-2">
                {Object.entries(groupedSignals!)
                  .sort(([a], [b]) => {
                    // Preserve backend/source ordering by default.
                    // Only pin "overall" first when present.
                    if (a === 'overall' && b !== 'overall') return -1;
                    if (b === 'overall' && a !== 'overall') return 1;
                    return 0;
                  })
                  .map(([groupName, signals]) => (
                    <SignalGroup key={groupName} groupName={groupName} signals={signals} />
                  ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-primary-pale bg-primary/5 p-6 text-center">
                <AlertCircle className="mx-auto mb-2 h-8 w-8 text-primary-soft" />
                <p className="text-sm text-text-muted">No signals available for this metric.</p>
                <p className="text-text-muted/70 mt-1 text-xs">
                  Signals provide detailed breakdown of why this score was assigned.
                </p>
              </div>
            )}
          </div>

          {/* Additional Metadata */}
          {allMetadataFields.length > 0 && (
            <div className="border-border/50 overflow-hidden rounded-lg border">
              <button
                onClick={() => setMetadataExpanded(!metadataExpanded)}
                className="flex w-full items-center gap-2 bg-primary/5 px-3 py-2 transition-colors hover:bg-primary/10"
              >
                {metadataExpanded ? (
                  <ChevronDown className="h-4 w-4 flex-shrink-0 text-primary" />
                ) : (
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-primary" />
                )}
                <span className="flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Additional Metadata
                </span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {allMetadataFields.length} field
                  {allMetadataFields.length !== 1 ? 's' : ''}
                </span>
              </button>
              {metadataExpanded && (
                <div className="bg-gray-50/50">
                  {/* Simple fields in a 2-col grid */}
                  {simpleFields.length > 0 && (
                    <div className="px-3 py-2">
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        {simpleFields.map(({ key, label, value }) => (
                          <div key={key}>
                            <dt className="text-xs text-text-muted">{label}</dt>
                            <dd className="mt-0.5">
                              <InlineMetadataValue value={value} />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}

                  {/* Complex fields as individual collapsible sections */}
                  {complexFields.length > 0 && (
                    <div className="border-border/30 border-t">
                      {complexFields.map(({ key, label, value }) => {
                        const isExpanded = expandedComplexFields.has(key);
                        return (
                          <div key={key} className="border-border/20 border-b last:border-b-0">
                            <button
                              onClick={() => {
                                setExpandedComplexFields((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                });
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-gray-100"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
                              )}
                              <span className="text-xs font-medium text-text-primary">{label}</span>
                              <span className="truncate text-[10px] text-text-muted">
                                {getComplexValuePreview(value)}
                              </span>
                            </button>
                            {isExpanded && (
                              <div className="px-3 pb-3 pl-8">
                                <div className="border-border/30 rounded-lg border bg-gray-100/50 p-3">
                                  <StructuredValueView value={value} />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {record.has_errors && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-error">
                Error
              </h4>
              <div className="border-error/20 bg-error/5 rounded-lg border p-3">
                <pre className="whitespace-pre-wrap font-mono text-sm text-error">
                  This record has errors
                </pre>
              </div>
            </div>
          )}

          {/* Basic Info Footer */}
          <div className="grid grid-cols-4 gap-2 text-sm">
            <div className="rounded-lg border border-border bg-gray-50/50 p-3">
              <div className="flex items-center gap-1.5">
                <Cpu className="h-3 w-3 text-primary" />
                <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
                  Model
                </p>
              </div>
              <p className="mt-1 font-medium text-text-primary">{record.model_name || '-'}</p>
            </div>
            <div className="rounded-lg border border-border bg-gray-50/50 p-3">
              <div className="flex items-center gap-1.5">
                <Globe className="h-3 w-3 text-primary-light" />
                <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
                  Environment
                </p>
              </div>
              <p className="mt-1 font-medium text-text-primary">{record.environment || '-'}</p>
            </div>
            <div className="rounded-lg border border-border bg-gray-50/50 p-3">
              <div className="flex items-center gap-1.5">
                <Timer className="h-3 w-3 text-accent-gold" />
                <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
                  Latency
                </p>
              </div>
              <p className="mt-1 font-mono font-medium text-text-primary">
                {record.latency ? `${record.latency.toFixed(2)}s` : '-'}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-gray-50/50 p-3">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3 text-primary-soft" />
                <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
                  Timestamp
                </p>
              </div>
              <p className="mt-1 font-medium text-text-primary">
                {record.timestamp ? new Date(record.timestamp).toLocaleString() : '-'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
