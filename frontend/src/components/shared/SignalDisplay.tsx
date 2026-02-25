'use client';

import { ChevronDown, ChevronRight, Star, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useState } from 'react';

import { formatScore } from '@/lib/scorecard-utils';
import { cn } from '@/lib/utils';
import { Colors, Thresholds, type GroupedSignals, type Signal } from '@/types';

// ============================================
// Helper Functions
// ============================================

function getScoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) return Colors.accentSilver;
  if (score >= Thresholds.GREEN_THRESHOLD) return Colors.success;
  if (score <= Thresholds.RED_THRESHOLD) return Colors.error;
  return Colors.warning;
}

function isValidScore(score: number | null | undefined): boolean {
  return score !== null && score !== undefined && !Number.isNaN(score);
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

// Parse group name like "statement_0 (Knowledge articles are...)" into cleaner display
function parseGroupName(groupName: string): { label: string; preview?: string } {
  // Check for statement pattern
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

// ============================================
// SignalRow Component
// ============================================

interface SignalRowProps {
  signal: Signal;
  isExpanded: boolean;
  onToggle: () => void;
}

export function SignalRow({ signal, isExpanded, onToggle }: SignalRowProps) {
  const scoreColor = getScoreColor(signal.score);
  const hasDetails = signal.description && signal.description !== `Signal: ${signal.name}`;
  const isVerdict = signal.name === 'verdict';
  const isStatement = signal.name === 'statement';
  const isReason = signal.name === 'reason';
  const valueStr = String(signal.value).toLowerCase();
  const isPositive = valueStr === 'yes' || valueStr === 'true' || signal.score === 1;
  const isNegative = valueStr === 'no' || valueStr === 'false' || signal.score === 0;

  // For statement signals, allow expansion to see full text
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
          canExpand ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'
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

        {/* Headline indicator */}
        {signal.headline_display && (
          <Star className="h-3 w-3 flex-shrink-0 text-amber-500" fill="currentColor" />
        )}

        {/* Signal name */}
        <span
          className={cn(
            'min-w-[80px] flex-shrink-0 text-sm font-medium',
            isVerdict ? 'text-text-primary' : 'text-text-muted'
          )}
        >
          {signal.name}
        </span>

        {/* Signal value - special handling for verdict */}
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

        {/* Score indicator - only show for valid scores */}
        {isValidScore(signal.score) && !isVerdict && (
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: scoreColor }} />
            <span className="text-xs font-medium" style={{ color: scoreColor }}>
              {formatScore(signal.score as number)}
            </span>
          </div>
        )}
      </button>

      {/* Expanded details */}
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

// ============================================
// SignalGroup Component
// ============================================

interface SignalGroupProps {
  groupName: string;
  signals: Signal[];
  defaultExpanded?: boolean;
}

export function SignalGroup({ groupName, signals, defaultExpanded }: SignalGroupProps) {
  const [expandedSignals, setExpandedSignals] = useState<Set<number>>(new Set());
  const [isGroupExpanded, setIsGroupExpanded] = useState(
    defaultExpanded ?? groupName === 'overall'
  );

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

  // Parse the group name for cleaner display
  const { label, preview } = parseGroupName(groupName);

  // Find verdict signal for this group
  const verdictSignal = signals.find((s) => s.name === 'verdict');
  const verdictValue = verdictSignal ? String(verdictSignal.value).toLowerCase() : null;
  const isPositiveVerdict =
    verdictValue === 'yes' || verdictValue === 'true' || verdictSignal?.score === 1;
  const isNegativeVerdict =
    verdictValue === 'no' || verdictValue === 'false' || verdictSignal?.score === 0;

  // Sort signals: verdict first, then headline_display, then others
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
                : 'bg-gray-50 hover:bg-gray-100'
            : 'bg-gray-50 hover:bg-gray-100'
        )}
      >
        {isGroupExpanded ? (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-text-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-muted" />
        )}

        {/* Verdict indicator for statement groups */}
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

// ============================================
// SignalDisplay Component (renders grouped signals)
// ============================================

interface SignalDisplayProps {
  signals: GroupedSignals | Signal[] | string | null;
  className?: string;
}

/**
 * Renders a collection of signals, handling various input formats.
 * Can receive:
 * - GroupedSignals: Object with group names as keys
 * - Signal[]: Array of signals (put into default group)
 * - string: JSON string or raw log output
 * - null: Renders nothing
 */
export function SignalDisplay({ signals, className }: SignalDisplayProps) {
  // Parse signals into GroupedSignals format
  const groupedSignals = parseSignals(signals);

  if (!groupedSignals || Object.keys(groupedSignals).length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      {Object.entries(groupedSignals)
        .sort(([a], [b]) => {
          // "overall" always first
          if (a === 'overall') return -1;
          if (b === 'overall') return 1;
          // Sort statement_X groups numerically
          const aMatch = a.match(/^statement_(\d+)/);
          const bMatch = b.match(/^statement_(\d+)/);
          if (aMatch && bMatch) {
            return parseInt(aMatch[1]) - parseInt(bMatch[1]);
          }
          if (aMatch) return -1;
          if (bMatch) return 1;
          return a.localeCompare(b);
        })
        .map(([groupName, groupSignals]) => (
          <SignalGroup key={groupName} groupName={groupName} signals={groupSignals} />
        ))}
    </div>
  );
}

/**
 * Parse various signal input formats into GroupedSignals.
 */
export function parseSignals(
  signals: GroupedSignals | Signal[] | string | null
): GroupedSignals | null {
  if (!signals) return null;

  // If it's already an object with groups
  if (typeof signals === 'object' && !Array.isArray(signals)) {
    return signals as GroupedSignals;
  }

  // If it's a string, try to parse as JSON
  if (typeof signals === 'string') {
    try {
      const parsed = JSON.parse(signals);

      // Check if it's grouped signals
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as GroupedSignals;
      }

      // If it's an array of signals, put them in a default group
      if (Array.isArray(parsed)) {
        return { signals: parsed } as GroupedSignals;
      }

      // Plain string that was valid JSON but not what we expect
      return { raw: [{ name: 'output', value: signals }] } as GroupedSignals;
    } catch {
      // Not JSON - treat as raw log output, split by newlines
      const lines = signals.split('\n').filter((s) => s.trim());
      if (lines.length > 0) {
        return {
          logs: lines.map((line, i) => ({
            name: `line_${i + 1}`,
            value: line.trim(),
          })),
        } as GroupedSignals;
      }
      return null;
    }
  }

  // If it's an array
  if (Array.isArray(signals)) {
    return {
      signals: signals.map((s, i) =>
        typeof s === 'string' ? { name: `signal_${i + 1}`, value: s } : s
      ),
    } as GroupedSignals;
  }

  return null;
}
