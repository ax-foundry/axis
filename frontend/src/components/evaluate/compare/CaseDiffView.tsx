'use client';

import {
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Minus,
  Filter,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useMemo, useCallback, useState } from 'react';
import ReactMarkdown from 'react-markdown';

import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';

import type { CaseDiffFilter } from '@/stores/ui-store';
import type { ComparisonRow } from '@/types';

// Convert plain URLs in text to markdown links
function linkifyContent(content: string): string {
  const urlRegex = /(?<!\]\()(?<!\[)(https?:\/\/[^\s\)]+)/g;
  return content.replace(urlRegex, (url) => {
    const cleanUrl = url.replace(/[,.\s]+$/, '');
    return `[${cleanUrl}](${cleanUrl})`;
  });
}

// Markdown renderer component for responses
function MarkdownContent({ content, className }: { content: string; className?: string }) {
  const processedContent = linkifyContent(content);

  return (
    <div className={cn('prose prose-sm max-w-none', className)}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-3 leading-relaxed last:mb-0">{children}</p>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-primary underline hover:text-primary-dark"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-text-primary">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className="my-2 ml-4 list-outside list-disc space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 ml-4 list-outside list-decimal space-y-1">{children}</ol>
          ),
          li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
          code: ({ children, className }) => {
            const isInline = !className;
            return isInline ? (
              <code className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-xs text-gray-800">
                {children}
              </code>
            ) : (
              <code className="block overflow-x-auto rounded-lg bg-gray-100 p-3 font-mono text-xs">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-lg bg-gray-100 p-3">{children}</pre>
          ),
          h1: ({ children }) => (
            <h1 className="mb-2 mt-4 text-lg font-bold text-text-primary">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-3 text-base font-semibold text-text-primary">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2 text-sm font-semibold text-text-primary">{children}</h3>
          ),
          hr: () => <hr className="my-4 border-t border-border" />,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-4 border-primary/30 pl-4 italic text-text-secondary">
              {children}
            </blockquote>
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

// Response panel with expand/collapse
interface ResponsePanelProps {
  content: string;
  label: string;
  variant: 'baseline' | 'challenger';
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function ResponsePanel({
  content,
  label,
  variant,
  isExpanded,
  onToggleExpand,
}: ResponsePanelProps) {
  const isBaseline = variant === 'baseline';

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn('h-3 w-3 rounded-full', isBaseline ? 'bg-gray-400' : 'bg-primary')} />
          <span className="text-sm font-medium text-text-secondary">
            {isBaseline ? 'Baseline' : 'Challenger'}: {label}
          </span>
        </div>
        <button
          onClick={onToggleExpand}
          className="rounded p-1 text-text-muted transition-colors hover:bg-gray-100 hover:text-text-secondary"
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>
      <div
        className={cn(
          'flex-1 overflow-y-auto rounded-lg border p-4',
          isBaseline ? 'border-gray-200 bg-gray-50' : 'border-primary/20 bg-primary-pale/20',
          isExpanded ? 'max-h-[500px]' : 'max-h-[250px]'
        )}
      >
        {content ? (
          <MarkdownContent content={content} className="text-sm text-text-primary" />
        ) : (
          <p className="text-sm italic text-text-muted">No response available</p>
        )}
      </div>
    </div>
  );
}

// Side-by-side response comparison
interface ResponseComparisonProps {
  baselineContent: string;
  challengerContent: string;
  baselineLabel: string;
  challengerLabel: string;
}

function ResponseComparison({
  baselineContent,
  challengerContent,
  baselineLabel,
  challengerLabel,
}: ResponseComparisonProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium text-text-secondary">Responses</div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-text-secondary"
        >
          {isExpanded ? (
            <>
              <Minimize2 className="h-3 w-3" />
              Collapse
            </>
          ) : (
            <>
              <Maximize2 className="h-3 w-3" />
              Expand
            </>
          )}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ResponsePanel
          content={baselineContent}
          label={baselineLabel}
          variant="baseline"
          isExpanded={isExpanded}
          onToggleExpand={() => setIsExpanded(!isExpanded)}
        />
        <ResponsePanel
          content={challengerContent}
          label={challengerLabel}
          variant="challenger"
          isExpanded={isExpanded}
          onToggleExpand={() => setIsExpanded(!isExpanded)}
        />
      </div>
    </div>
  );
}

interface CaseDiffViewProps {
  rows: ComparisonRow[];
  className?: string;
}

export function CaseDiffView({ rows, className }: CaseDiffViewProps) {
  const {
    compareBaselineExperiment,
    compareChallengerExperiment,
    compareCaseDiffCurrentId,
    setCompareCaseDiffCurrentId,
    compareCaseDiffFilter,
    setCompareCaseDiffFilter,
  } = useUIStore();

  // Get all metrics
  const allMetrics = useMemo(() => {
    const metricSet = new Set<string>();
    rows.forEach((row) => {
      Object.keys(row.metrics).forEach((m) => metricSet.add(m));
    });
    return Array.from(metricSet).sort();
  }, [rows]);

  // Group rows by test case ID
  const caseMap = useMemo(() => {
    const map = new Map<
      string,
      { baseline: ComparisonRow | null; challenger: ComparisonRow | null }
    >();

    rows.forEach((row) => {
      const exp = row.experimentName || 'Default';
      if (!map.has(row.id)) {
        map.set(row.id, { baseline: null, challenger: null });
      }
      const entry = map.get(row.id)!;
      if (exp === compareBaselineExperiment) {
        entry.baseline = row;
      } else if (exp === compareChallengerExperiment) {
        entry.challenger = row;
      }
    });

    return map;
  }, [rows, compareBaselineExperiment, compareChallengerExperiment]);

  // Get comparable cases (cases that have both baseline and challenger)
  const comparableCases = useMemo(() => {
    const cases: Array<{
      id: string;
      baseline: ComparisonRow;
      challenger: ComparisonRow;
      winner: 'baseline' | 'challenger' | 'tie';
      diff: number;
    }> = [];

    caseMap.forEach((entry, id) => {
      if (entry.baseline && entry.challenger) {
        const diff = entry.challenger.overallScore - entry.baseline.overallScore;
        let winner: 'baseline' | 'challenger' | 'tie' = 'tie';
        if (diff > 0.01) winner = 'challenger';
        else if (diff < -0.01) winner = 'baseline';

        cases.push({
          id,
          baseline: entry.baseline,
          challenger: entry.challenger,
          winner,
          diff,
        });
      }
    });

    return cases;
  }, [caseMap]);

  // Apply filter
  const filteredCases = useMemo(() => {
    switch (compareCaseDiffFilter) {
      case 'challenger_wins':
        return comparableCases.filter((c) => c.winner === 'challenger');
      case 'baseline_wins':
        return comparableCases.filter((c) => c.winner === 'baseline');
      case 'significant_diff':
        return comparableCases.filter((c) => Math.abs(c.diff) > 0.1);
      default:
        return comparableCases;
    }
  }, [comparableCases, compareCaseDiffFilter]);

  // Sort by diff magnitude (most different first)
  const sortedCases = useMemo(() => {
    return [...filteredCases].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [filteredCases]);

  // Find current index
  const currentIndex = useMemo(() => {
    if (!compareCaseDiffCurrentId) return 0;
    const idx = sortedCases.findIndex((c) => c.id === compareCaseDiffCurrentId);
    return idx >= 0 ? idx : 0;
  }, [sortedCases, compareCaseDiffCurrentId]);

  // Get current case
  const currentCase = sortedCases[currentIndex] || null;

  // Navigation handlers
  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCompareCaseDiffCurrentId(sortedCases[currentIndex - 1].id);
    }
  }, [currentIndex, sortedCases, setCompareCaseDiffCurrentId]);

  const goToNext = useCallback(() => {
    if (currentIndex < sortedCases.length - 1) {
      setCompareCaseDiffCurrentId(sortedCases[currentIndex + 1].id);
    }
  }, [currentIndex, sortedCases, setCompareCaseDiffCurrentId]);

  const jumpToCase = useCallback(
    (caseId: string) => {
      setCompareCaseDiffCurrentId(caseId);
    },
    [setCompareCaseDiffCurrentId]
  );

  if (!compareBaselineExperiment || !compareChallengerExperiment) {
    return (
      <div className={cn('border-border/50 rounded-xl border bg-white p-6 text-center', className)}>
        <p className="text-text-muted">
          Select baseline and challenger experiments to compare cases
        </p>
      </div>
    );
  }

  if (sortedCases.length === 0) {
    return (
      <div className={cn('border-border/50 rounded-xl border bg-white p-6 text-center', className)}>
        <p className="text-text-muted">
          No comparable test cases found
          {compareCaseDiffFilter !== 'all' && ' with the current filter'}
        </p>
        {compareCaseDiffFilter !== 'all' && (
          <button
            onClick={() => setCompareCaseDiffFilter('all')}
            className="mt-2 text-sm text-primary hover:underline"
          >
            Clear filter
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'border-border/50 overflow-hidden rounded-xl border bg-white shadow-sm',
        className
      )}
    >
      {/* Header with Navigation */}
      <div className="border-border/50 border-b bg-gray-50 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="font-semibold text-text-primary">Case-Level Comparison</h3>
            <span className="text-sm text-text-muted">
              {currentIndex + 1} of {sortedCases.length} cases
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Filter Dropdown */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-text-muted" />
              <select
                value={compareCaseDiffFilter}
                onChange={(e) => setCompareCaseDiffFilter(e.target.value as CaseDiffFilter)}
                className="rounded-lg border border-border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="all">All Cases</option>
                <option value="challenger_wins">Challenger Wins</option>
                <option value="baseline_wins">Baseline Wins</option>
                <option value="significant_diff">Large Difference (&gt;10%)</option>
              </select>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={goToPrevious}
                disabled={currentIndex === 0}
                className={cn(
                  'rounded-lg border p-1.5 transition-all',
                  currentIndex === 0
                    ? 'cursor-not-allowed border-gray-200 text-gray-300'
                    : 'border-border text-text-secondary hover:bg-gray-100'
                )}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={goToNext}
                disabled={currentIndex >= sortedCases.length - 1}
                className={cn(
                  'rounded-lg border p-1.5 transition-all',
                  currentIndex >= sortedCases.length - 1
                    ? 'cursor-not-allowed border-gray-200 text-gray-300'
                    : 'border-border text-text-secondary hover:bg-gray-100'
                )}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Jump to Case */}
            <select
              value={currentCase?.id || ''}
              onChange={(e) => jumpToCase(e.target.value)}
              className="max-w-[200px] rounded-lg border border-border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {sortedCases.map((c, idx) => (
                <option key={c.id} value={c.id}>
                  {idx + 1}. {c.id.slice(0, 20)}...
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {currentCase && (
        <div className="p-5">
          {/* Query Section */}
          <div className="mb-4">
            <div className="mb-1 text-sm font-medium text-text-secondary">Query</div>
            <div className="border-border/30 rounded-lg border bg-gray-50 p-3">
              <MarkdownContent
                content={currentCase.baseline.query || 'No query available'}
                className="text-sm text-text-primary"
              />
            </div>
          </div>

          {/* Side-by-Side Responses */}
          <ResponseComparison
            baselineContent={currentCase.baseline.actualOutput}
            challengerContent={currentCase.challenger.actualOutput}
            baselineLabel={compareBaselineExperiment || 'Baseline'}
            challengerLabel={compareChallengerExperiment || 'Challenger'}
          />

          {/* Metrics Comparison */}
          <div>
            <div className="mb-2 text-sm font-medium text-text-secondary">Metrics Comparison</div>
            <div className="border-border/50 overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-border/50 border-b bg-gray-50">
                    <th className="px-4 py-2 text-left font-medium text-text-secondary">Metric</th>
                    <th className="px-4 py-2 text-center font-medium text-text-secondary">
                      Baseline
                    </th>
                    <th className="px-4 py-2 text-center font-medium text-text-secondary">
                      Challenger
                    </th>
                    <th className="px-4 py-2 text-center font-medium text-text-secondary">
                      Difference
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allMetrics.map((metric) => {
                    const baselineScore = currentCase.baseline.metrics[metric];
                    const challengerScore = currentCase.challenger.metrics[metric];
                    const hasBaseline = typeof baselineScore === 'number';
                    const hasChallenger = typeof challengerScore === 'number';
                    const diff =
                      hasBaseline && hasChallenger ? challengerScore - baselineScore : null;

                    return (
                      <tr key={metric} className="border-border/50 border-b last:border-0">
                        <td className="px-4 py-2 font-medium text-text-primary">{metric}</td>
                        <td className="px-4 py-2 text-center text-text-secondary">
                          {hasBaseline ? baselineScore.toFixed(3) : '-'}
                        </td>
                        <td className="px-4 py-2 text-center text-text-secondary">
                          {hasChallenger ? challengerScore.toFixed(3) : '-'}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {diff !== null ? (
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 font-medium',
                                diff > 0.01
                                  ? 'text-green-600'
                                  : diff < -0.01
                                    ? 'text-red-600'
                                    : 'text-gray-500'
                              )}
                            >
                              {diff > 0.01 ? (
                                <ArrowUp className="h-3 w-3" />
                              ) : diff < -0.01 ? (
                                <ArrowDown className="h-3 w-3" />
                              ) : (
                                <Minus className="h-3 w-3" />
                              )}
                              {diff > 0 ? '+' : ''}
                              {diff.toFixed(3)}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Overall Score Row */}
                  <tr className="bg-gray-50 font-medium">
                    <td className="px-4 py-2 text-text-primary">Overall Score</td>
                    <td className="px-4 py-2 text-center text-text-secondary">
                      {currentCase.baseline.overallScore.toFixed(3)}
                    </td>
                    <td className="px-4 py-2 text-center text-text-secondary">
                      {currentCase.challenger.overallScore.toFixed(3)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 font-medium',
                          currentCase.diff > 0.01
                            ? 'text-green-600'
                            : currentCase.diff < -0.01
                              ? 'text-red-600'
                              : 'text-gray-500'
                        )}
                      >
                        {currentCase.diff > 0.01 ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : currentCase.diff < -0.01 ? (
                          <ArrowDown className="h-3 w-3" />
                        ) : (
                          <Minus className="h-3 w-3" />
                        )}
                        {currentCase.diff > 0 ? '+' : ''}
                        {currentCase.diff.toFixed(3)}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Winner Badge */}
          <div className="mt-4 flex items-center justify-center">
            <div
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium',
                currentCase.winner === 'challenger'
                  ? 'bg-green-100 text-green-700'
                  : currentCase.winner === 'baseline'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-600'
              )}
            >
              {currentCase.winner === 'tie'
                ? 'Tie - No significant difference'
                : `${currentCase.winner === 'challenger' ? 'Challenger' : 'Baseline'} wins this case`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
