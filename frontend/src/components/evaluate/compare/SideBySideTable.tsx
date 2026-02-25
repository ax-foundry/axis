'use client';

import { ChevronDown, ChevronRight, Eye, ChevronUp } from 'lucide-react';
import { useState, useMemo } from 'react';

import {
  CompactConversation,
  ConversationView,
  createConversationFromQueryOutput,
} from '@/components/shared';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';
import { Thresholds } from '@/types';

import { DictContentSection } from './DictContentSection';

import type { ComparisonRow } from '@/types';

interface SideBySideTableProps {
  rows: ComparisonRow[];
  metrics: string[];
}

interface GroupedTestCase {
  id: string;
  query: string;
  expectedOutput?: string;
  additionalInput?: string;
  additionalOutput?: string;
  conversation?: string;
  retrievedContent?: string;
  experiments: Map<string, ComparisonRow>;
}

type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  column: string;
  direction: SortDirection;
}

function getScoreColor(score: number): string {
  if (score >= Thresholds.GREEN_THRESHOLD) return 'text-success';
  if (score <= Thresholds.RED_THRESHOLD) return 'text-error';
  return 'text-warning';
}

function getScoreBgColor(score: number): string {
  if (score >= Thresholds.GREEN_THRESHOLD) return 'bg-success/10';
  if (score <= Thresholds.RED_THRESHOLD) return 'bg-error/10';
  return 'bg-warning/10';
}

function ScoreBadge({ score, label }: { score: number; label?: string }) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium',
        getScoreBgColor(score),
        getScoreColor(score)
      )}
    >
      {label && <span className="mr-1 text-xs text-text-muted">{label}:</span>}
      {(score * 100).toFixed(1)}%
    </div>
  );
}

function ExperimentColumn({ row, metrics }: { row?: ComparisonRow; metrics: string[] }) {
  if (!row) {
    return (
      <div className="p-4 text-center italic text-text-muted">No data for this experiment</div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      {/* Conversation/Output - using CompactConversation for chat-style display */}
      <div className="overflow-hidden rounded-lg bg-gray-50">
        <CompactConversation query={row.query} output={row.actualOutput} maxPreviewLength={120} />
      </div>

      {/* Overall Score */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-muted">Overall Score</span>
        <ScoreBadge score={row.overallScore} />
      </div>

      {/* Metrics Preview */}
      <div className="grid grid-cols-2 gap-2">
        {metrics.slice(0, 4).map((metric) => {
          const score = row.metrics[metric];
          if (score === undefined) return null;
          return (
            <div key={metric} className={cn('rounded-lg p-2', getScoreBgColor(score))}>
              <p className="truncate text-xs text-text-muted" title={metric}>
                {metric.length > 12 ? metric.substring(0, 12) + '...' : metric}
              </p>
              <p className={cn('text-sm font-semibold', getScoreColor(score))}>
                {(score * 100).toFixed(1)}%
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExpandedRow({
  testCase,
  experimentNames,
  metrics,
  visibleFields,
}: {
  testCase: GroupedTestCase;
  experimentNames: string[];
  metrics: string[];
  visibleFields: string[];
}) {
  return (
    <tr>
      <td colSpan={experimentNames.length + 2} className="p-0">
        <div className="border-border/50 border-b border-t bg-gray-50 p-6">
          <div className="space-y-6">
            {/* Additional Input if present and visible */}
            {visibleFields.includes('additional_input') && testCase.additionalInput && (
              <DictContentSection
                title="Additional Input"
                content={testCase.additionalInput}
                compact
              />
            )}

            {/* Conversations Side-by-Side */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-text-primary">
                Conversations by Experiment
              </h4>
              <div
                className={cn(
                  'grid gap-4',
                  experimentNames.length === 1
                    ? 'grid-cols-1'
                    : experimentNames.length === 2
                      ? 'grid-cols-1 lg:grid-cols-2'
                      : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                )}
              >
                {experimentNames.map((expName) => {
                  const row = testCase.experiments.get(expName);
                  if (!row) return null;

                  const messages = createConversationFromQueryOutput(row.query, row.actualOutput);

                  return (
                    <div
                      key={expName}
                      className="border-border/50 overflow-hidden rounded-lg border bg-white"
                    >
                      <div className="border-border/30 border-b bg-gray-100 px-4 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-text-primary">{expName}</span>
                          <ScoreBadge score={row.overallScore} />
                        </div>
                      </div>
                      <ConversationView
                        messages={messages}
                        maxHeight="300px"
                        compact={true}
                        showCopyButtons={true}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Additional Output if present and visible */}
            {visibleFields.includes('additional_output') && testCase.additionalOutput && (
              <DictContentSection
                title="Additional Output"
                content={testCase.additionalOutput}
                compact
              />
            )}

            {/* Conversation field if present and visible */}
            {visibleFields.includes('conversation') && testCase.conversation && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-text-primary">Conversation</h4>
                <div className="border-border/50 max-h-48 overflow-y-auto rounded-lg border bg-white p-4">
                  <p className="whitespace-pre-wrap font-mono text-sm text-text-secondary">
                    {testCase.conversation}
                  </p>
                </div>
              </div>
            )}

            {/* Expected Output if present and visible */}
            {visibleFields.includes('expected_output') && testCase.expectedOutput && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-text-primary">Expected Output</h4>
                <div className="border-border/50 rounded-lg border bg-white p-4">
                  <p className="whitespace-pre-wrap text-sm text-text-secondary">
                    {testCase.expectedOutput}
                  </p>
                </div>
              </div>
            )}

            {/* Retrieved Content if present and visible */}
            {visibleFields.includes('retrieved_content') && testCase.retrievedContent && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-text-primary">Retrieved Content</h4>
                <div className="border-border/50 max-h-48 overflow-y-auto rounded-lg border bg-white p-4">
                  <p className="whitespace-pre-wrap font-mono text-sm text-text-secondary">
                    {testCase.retrievedContent}
                  </p>
                </div>
              </div>
            )}

            {/* All Metrics Grid */}
            <div>
              <h4 className="mb-2 text-sm font-semibold text-text-primary">
                All Metrics by Experiment
              </h4>
              <div className="border-border/50 overflow-hidden overflow-x-auto rounded-lg border bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-border/50 border-b bg-gray-50">
                      <th className="p-3 text-left font-semibold text-text-primary">Metric</th>
                      {experimentNames.map((name) => (
                        <th key={name} className="p-3 text-center font-semibold text-text-primary">
                          {name.length > 15 ? name.substring(0, 15) + '...' : name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map((metric) => (
                      <tr key={metric} className="border-border/30 border-b last:border-0">
                        <td className="p-3 text-text-secondary">{metric}</td>
                        {experimentNames.map((expName) => {
                          const row = testCase.experiments.get(expName);
                          const score = row?.metrics[metric];
                          return (
                            <td key={expName} className="p-3 text-center">
                              {score !== undefined ? (
                                <span className={cn('font-medium', getScoreColor(score))}>
                                  {(score * 100).toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-text-muted">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

export function SideBySideTable({ rows, metrics }: SideBySideTableProps) {
  const { openTestCaseDetail, comparePageSize, compareVisibleFields } = useUIStore();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [sortState, setSortState] = useState<SortState>({ column: '', direction: null });

  // Group rows by test case ID
  const { groupedTestCases, experimentNames } = useMemo(() => {
    const groups = new Map<string, GroupedTestCase>();
    const expNames = new Set<string>();

    rows.forEach((row) => {
      const expName = row.experimentName || 'Default';
      expNames.add(expName);

      if (!groups.has(row.id)) {
        groups.set(row.id, {
          id: row.id,
          query: row.query,
          expectedOutput: row.expectedOutput,
          additionalInput: row.additionalInput,
          additionalOutput: row.additionalOutput,
          conversation: row.conversation,
          retrievedContent: row.retrievedContent,
          experiments: new Map(),
        });
      }

      groups.get(row.id)!.experiments.set(expName, row);
    });

    return {
      groupedTestCases: Array.from(groups.values()),
      experimentNames: Array.from(expNames).sort(),
    };
  }, [rows]);

  // Sort grouped test cases
  const sortedTestCases = useMemo(() => {
    if (!sortState.column || !sortState.direction) return groupedTestCases;

    return [...groupedTestCases].sort((a, b) => {
      if (sortState.column === 'id') {
        return sortState.direction === 'asc' ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
      }

      // Sort by experiment score
      const expName = sortState.column;
      const aRow = a.experiments.get(expName);
      const bRow = b.experiments.get(expName);
      const aScore = aRow?.overallScore ?? 0;
      const bScore = bRow?.overallScore ?? 0;

      return sortState.direction === 'asc' ? aScore - bScore : bScore - aScore;
    });
  }, [groupedTestCases, sortState]);

  // Pagination
  const totalPages = Math.ceil(sortedTestCases.length / comparePageSize);
  const paginatedTestCases = useMemo(() => {
    const start = (currentPage - 1) * comparePageSize;
    return sortedTestCases.slice(start, start + comparePageSize);
  }, [sortedTestCases, currentPage, comparePageSize]);

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSort = (column: string) => {
    setSortState((prev) => {
      if (prev.column === column) {
        if (prev.direction === 'asc') return { column, direction: 'desc' };
        if (prev.direction === 'desc') return { column: '', direction: null };
        return { column, direction: 'asc' };
      }
      return { column, direction: 'asc' };
    });
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortState.column !== column) {
      return <ChevronUp className="text-text-muted/50 h-3 w-3" />;
    }
    return sortState.direction === 'asc' ? (
      <ChevronUp className="h-3 w-3 text-primary" />
    ) : (
      <ChevronDown className="h-3 w-3 text-primary" />
    );
  };

  if (groupedTestCases.length === 0) {
    return (
      <div className="border-border/50 flex h-48 items-center justify-center rounded-xl border bg-white text-text-muted">
        No test cases match the current filters
      </div>
    );
  }

  // Single experiment mode vs multi-experiment mode
  const isMultiExperiment = experimentNames.length > 1;

  return (
    <div className="border-border/50 overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-border/50 border-b bg-gray-50">
              {/* Expand column */}
              <th className="w-10 p-4"></th>

              {/* ID and Query */}
              <th className="min-w-[300px] p-4 text-left">
                <button
                  onClick={() => handleSort('id')}
                  className="flex items-center gap-1 text-sm font-semibold text-text-primary hover:text-primary"
                >
                  Test Case
                  <SortIcon column="id" />
                </button>
              </th>

              {/* Experiment columns */}
              {experimentNames.map((expName) => (
                <th key={expName} className="border-border/30 min-w-[280px] border-l p-4 text-left">
                  <button
                    onClick={() => handleSort(expName)}
                    className="flex items-center gap-1 text-sm font-semibold text-text-primary hover:text-primary"
                  >
                    <span className="max-w-[200px] truncate" title={expName}>
                      {expName}
                    </span>
                    <SortIcon column={expName} />
                  </button>
                </th>
              ))}

              {/* Actions */}
              <th className="w-16 p-4 text-center">
                <span className="text-sm font-semibold text-text-primary">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedTestCases.map((testCase, idx) => {
              const isExpanded = expandedRows.has(testCase.id);

              return (
                <>
                  <tr
                    key={testCase.id}
                    className={cn(
                      'border-border/30 cursor-pointer border-b transition-colors hover:bg-gray-50/50',
                      idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30',
                      isExpanded && 'bg-primary/5'
                    )}
                    onClick={() => toggleExpand(testCase.id)}
                  >
                    {/* Expand icon */}
                    <td className="p-4">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-primary" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-text-muted" />
                      )}
                    </td>

                    {/* ID and Query */}
                    <td className="p-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="max-w-[200px] truncate text-sm font-medium text-text-primary"
                            title={testCase.id}
                          >
                            {testCase.id}
                          </span>
                        </div>
                        <div className="line-clamp-3 text-sm text-text-secondary">
                          {testCase.query.length > 120
                            ? testCase.query.substring(0, 120) + '...'
                            : testCase.query}
                        </div>
                      </div>
                    </td>

                    {/* Experiment columns */}
                    {experimentNames.map((expName) => {
                      const row = testCase.experiments.get(expName);
                      return (
                        <td key={expName} className="border-border/30 border-l p-4 align-top">
                          <ExperimentColumn row={row} metrics={metrics} />
                        </td>
                      );
                    })}

                    {/* Actions */}
                    <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openTestCaseDetail(testCase.id)}
                        className="rounded-lg p-2 text-text-muted transition-colors hover:bg-primary/10 hover:text-primary"
                        title="View full details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>

                  {/* Expanded row */}
                  {isExpanded && (
                    <ExpandedRow
                      key={`${testCase.id}-expanded`}
                      testCase={testCase}
                      experimentNames={experimentNames}
                      metrics={metrics}
                      visibleFields={compareVisibleFields}
                    />
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-border/50 flex items-center justify-between border-t bg-gray-50/50 px-4 py-3">
          <span className="text-sm text-text-muted">
            Showing {(currentPage - 1) * comparePageSize + 1} to{' '}
            {Math.min(currentPage * comparePageSize, sortedTestCases.length)} of{' '}
            {sortedTestCases.length} test cases
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-text-muted">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Experiment count indicator */}
      {isMultiExperiment && (
        <div className="border-border/50 border-t bg-primary/5 px-4 py-2">
          <p className="text-sm font-medium text-primary">
            Comparing {experimentNames.length} experiments: {experimentNames.join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}
