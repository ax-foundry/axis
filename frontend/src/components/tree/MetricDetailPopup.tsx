'use client';

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { SignalDisplay, parseSignals } from '@/components/shared/SignalDisplay';
import { formatScore } from '@/lib/scorecard-utils';
import { Colors, Thresholds } from '@/types';

import type { TreeNode, AggregateStats } from './tree-visualization';

interface MetricDetailPopupProps {
  node: TreeNode | null;
  position: { x: number; y: number } | null;
  onClose: () => void;
}

function getScoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) return Colors.accentSilver;
  if (score >= Thresholds.GREEN_THRESHOLD) return Colors.success;
  if (score <= Thresholds.RED_THRESHOLD) return Colors.error;
  return Colors.warning;
}

function AggregateStatsDisplay({ stats }: { stats: AggregateStats }) {
  // Create a mini histogram with 10 bins
  const bins = 10;
  const binCounts = new Array(bins).fill(0);
  const binWidth = 1 / bins;

  stats.scores.forEach((score) => {
    const binIndex = Math.min(Math.floor(score / binWidth), bins - 1);
    binCounts[binIndex]++;
  });

  const maxCount = Math.max(...binCounts, 1);

  return (
    <div className="space-y-4">
      {/* Summary Statistics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="border-border/50 rounded-lg border bg-gray-50 p-3">
          <div className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Sample Size
          </div>
          <div className="mt-1 text-xl font-bold text-text-primary">{stats.count}</div>
        </div>
        <div className="border-border/50 rounded-lg border bg-gray-50 p-3">
          <div className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Mean (Avg)
          </div>
          <div className="mt-1 text-xl font-bold" style={{ color: getScoreColor(stats.mean) }}>
            {formatScore(stats.mean)}
          </div>
        </div>
        <div className="border-border/50 rounded-lg border bg-gray-50 p-3">
          <div className="text-xs font-medium uppercase tracking-wider text-text-muted">Median</div>
          <div className="mt-1 text-xl font-bold" style={{ color: getScoreColor(stats.median) }}>
            {formatScore(stats.median)}
          </div>
        </div>
        <div className="border-border/50 rounded-lg border bg-gray-50 p-3">
          <div className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Std Dev
          </div>
          <div className="mt-1 text-xl font-bold text-text-primary">
            {formatScore(stats.stdDev)}
          </div>
        </div>
      </div>

      {/* Percentile Box */}
      <div className="border-border/50 rounded-lg border bg-gray-50 p-3">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
          Score Distribution
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="text-center">
            <div className="text-xs text-text-muted">Min</div>
            <div className="font-semibold" style={{ color: getScoreColor(stats.min) }}>
              {formatScore(stats.min)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-text-muted">25th</div>
            <div className="font-semibold" style={{ color: getScoreColor(stats.p25) }}>
              {formatScore(stats.p25)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-text-muted">Median</div>
            <div className="font-semibold" style={{ color: getScoreColor(stats.median) }}>
              {formatScore(stats.median)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-text-muted">75th</div>
            <div className="font-semibold" style={{ color: getScoreColor(stats.p75) }}>
              {formatScore(stats.p75)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-text-muted">Max</div>
            <div className="font-semibold" style={{ color: getScoreColor(stats.max) }}>
              {formatScore(stats.max)}
            </div>
          </div>
        </div>
        {/* Visual percentile bar */}
        <div className="relative mt-3 h-6 rounded bg-gray-200">
          {/* Full range background */}
          <div
            className="absolute h-full rounded bg-gray-300"
            style={{ left: `${stats.min * 100}%`, width: `${(stats.max - stats.min) * 100}%` }}
          />
          {/* IQR box */}
          <div
            className="absolute h-full rounded"
            style={{
              left: `${stats.p25 * 100}%`,
              width: `${(stats.p75 - stats.p25) * 100}%`,
              backgroundColor: getScoreColor(stats.median),
              opacity: 0.6,
            }}
          />
          {/* Median line */}
          <div
            className="absolute h-full w-0.5"
            style={{ left: `${stats.median * 100}%`, backgroundColor: getScoreColor(stats.median) }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-text-muted">
          <span>0</span>
          <span>0.5</span>
          <span>1</span>
        </div>
      </div>

      {/* Mini Histogram */}
      <div className="border-border/50 rounded-lg border bg-gray-50 p-3">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
          Histogram
        </div>
        <div className="flex h-16 items-end gap-0.5">
          {binCounts.map((count, i) => {
            const binCenter = (i + 0.5) * binWidth;
            const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
            return (
              <div
                key={i}
                className="flex-1 rounded-t transition-all"
                style={{
                  height: `${Math.max(height, 2)}%`,
                  backgroundColor: getScoreColor(binCenter),
                  opacity: count > 0 ? 0.8 : 0.2,
                }}
                title={`${(i * binWidth).toFixed(1)}-${((i + 1) * binWidth).toFixed(1)}: ${count} cases`}
              />
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-xs text-text-muted">
          <span>0</span>
          <span>0.5</span>
          <span>1</span>
        </div>
      </div>
    </div>
  );
}

export function MetricDetailPopup({ node, position, onClose }: MetricDetailPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (node) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [node, onClose]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (node) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [node, onClose]);

  if (!node || !position) return null;

  // Parse signals using shared utility
  const groupedSignals = parseSignals(node.signals as Parameters<typeof parseSignals>[0]);
  const hasSignals = groupedSignals && Object.keys(groupedSignals).length > 0;

  const scoreColor = getScoreColor(node.score);
  const scoreDisplay = node.score !== null ? formatScore(node.score) : 'N/A';

  // Position the popup near the click, but ensure it stays within viewport
  const popupWidth = 500;
  const popupMaxHeight = 600;
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(Math.max(10, position.x - popupWidth / 2), window.innerWidth - popupWidth - 10),
    top: Math.min(Math.max(10, position.y - 20), window.innerHeight - popupMaxHeight - 10),
    zIndex: 1000,
  };

  return (
    <div
      ref={popupRef}
      className="overflow-hidden rounded-xl border border-border bg-white shadow-xl"
      style={{ ...style, width: popupWidth, maxHeight: popupMaxHeight }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-gray-50 px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="h-3 w-3 flex-shrink-0 rounded-full"
            style={{ backgroundColor: scoreColor }}
          />
          <h3 className="font-semibold text-text-primary">{node.name}</h3>
          <span className="text-lg font-bold" style={{ color: scoreColor }}>
            {scoreDisplay}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-muted">
            Weight: <span className="font-medium text-text-primary">{node.weight}</span>
          </span>
          <button onClick={onClose} className="rounded-md p-1 transition-colors hover:bg-gray-200">
            <X className="h-4 w-4 text-text-muted" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4 overflow-y-auto p-4" style={{ maxHeight: popupMaxHeight - 60 }}>
        {/* Aggregated Stats View */}
        {node.isAggregated && node.aggregateStats ? (
          <AggregateStatsDisplay stats={node.aggregateStats} />
        ) : (
          <>
            {/* Explanation */}
            {node.explanation && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Explanation
                </h4>
                <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm leading-relaxed text-text-secondary">
                  {node.explanation}
                </p>
              </div>
            )}

            {/* Signals - using shared SignalDisplay component */}
            {hasSignals && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Signals
                </h4>
                <SignalDisplay signals={groupedSignals} />
              </div>
            )}

            {/* Critique */}
            {node.critique && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Critique
                </h4>
                <p className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm leading-relaxed text-text-secondary">
                  {node.critique}
                </p>
              </div>
            )}

            {/* No details available */}
            {!node.explanation && !hasSignals && !node.critique && (
              <p className="py-4 text-center text-sm italic text-text-muted">
                No additional details available for this metric.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
