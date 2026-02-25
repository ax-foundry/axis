'use client';

import { X, Copy, Check, GitCompare, Columns } from 'lucide-react';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';
import { Thresholds } from '@/types';

import { DictContentSection } from './DictContentSection';

import type { ComparisonRow } from '@/types';

interface TestCaseDetailModalProps {
  rows: ComparisonRow[];
  metrics: string[];
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

function ContentSection({ title, content }: { title: string; content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!content) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-primary"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-4 font-mono text-sm text-text-secondary">
        {content}
      </div>
    </div>
  );
}

function ExperimentCard({ row, metrics }: { row: ComparisonRow; metrics: string[] }) {
  return (
    <div className="min-w-0 flex-1">
      {/* Header */}
      <div className="border-border/30 rounded-t-xl border-b bg-gray-50 p-4">
        <p className="text-sm font-semibold text-text-primary">{row.experimentName || 'Default'}</p>
        <p className={cn('mt-1 text-2xl font-bold', getScoreColor(row.overallScore))}>
          {(row.overallScore * 100).toFixed(1)}%
        </p>
      </div>

      {/* Metrics */}
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2">
          {metrics.slice(0, 6).map((metric) => {
            const score = row.metrics[metric];
            if (score === undefined) return null;

            return (
              <div key={metric} className={cn('rounded-lg p-2', getScoreBgColor(score))}>
                <p className="truncate text-xs text-text-muted" title={metric}>
                  {metric}
                </p>
                <p className={cn('text-sm font-semibold', getScoreColor(score))}>
                  {(score * 100).toFixed(1)}%
                </p>
              </div>
            );
          })}
        </div>

        {/* Response Preview */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-text-muted">Response</p>
          <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 font-mono text-xs text-text-secondary">
            {row.actualOutput.length > 500
              ? row.actualOutput.substring(0, 500) + '...'
              : row.actualOutput}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TestCaseDetailModal({ rows, metrics }: TestCaseDetailModalProps) {
  const {
    selectedCompareTestCaseId,
    closeTestCaseDetail,
    compareDetailCompareMode,
    setCompareDetailCompareMode,
    compareVisibleFields,
  } = useUIStore();

  const testCase = useMemo(() => {
    return rows.find((r) => r.id === selectedCompareTestCaseId);
  }, [rows, selectedCompareTestCaseId]);

  // Find all rows with the same test case ID (different experiments)
  const relatedRows = useMemo(() => {
    if (!selectedCompareTestCaseId) return [];
    return rows.filter((r) => r.id === selectedCompareTestCaseId);
  }, [rows, selectedCompareTestCaseId]);

  const hasMultipleExperiments = relatedRows.length > 1;

  if (!testCase) return null;

  const overallScore = testCase.overallScore;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={closeTestCaseDetail}
      />

      {/* Modal */}
      <div
        className={cn(
          'relative max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl transition-all',
          compareDetailCompareMode && hasMultipleExperiments
            ? 'w-full max-w-5xl'
            : 'w-full max-w-3xl'
        )}
      >
        {/* Header */}
        <div className="border-border/50 flex items-center justify-between border-b bg-gray-50 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Test Case Details</h3>
            <p className="max-w-md truncate text-sm text-text-muted" title={testCase.id}>
              ID: {testCase.id}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasMultipleExperiments && (
              <button
                onClick={() => setCompareDetailCompareMode(!compareDetailCompareMode)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all',
                  compareDetailCompareMode
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-text-secondary hover:border-primary hover:text-primary'
                )}
                title="Compare experiments side-by-side"
              >
                <GitCompare className="h-4 w-4" />
                <span>Compare</span>
              </button>
            )}
            <button
              onClick={closeTestCaseDetail}
              className="rounded-lg p-2 text-text-muted transition-colors hover:bg-gray-200 hover:text-text-primary"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="max-h-[calc(90vh-80px)] overflow-y-auto p-6">
          {compareDetailCompareMode && hasMultipleExperiments ? (
            /* Compare Mode - Side by Side */
            <div className="space-y-6">
              {/* Query (shared) */}
              <ContentSection title="Query" content={testCase.query} />

              {/* Additional Input (shared, if visible) */}
              {compareVisibleFields.includes('additional_input') && testCase.additionalInput && (
                <DictContentSection title="Additional Input" content={testCase.additionalInput} />
              )}

              {/* Additional Output (shared, if visible) */}
              {compareVisibleFields.includes('additional_output') && testCase.additionalOutput && (
                <DictContentSection title="Additional Output" content={testCase.additionalOutput} />
              )}

              {/* Conversation (shared, if visible) */}
              {compareVisibleFields.includes('conversation') && testCase.conversation && (
                <ContentSection title="Conversation" content={testCase.conversation} />
              )}

              {/* Retrieved Content (shared, if visible) */}
              {compareVisibleFields.includes('retrieved_content') && testCase.retrievedContent && (
                <ContentSection title="Retrieved Content" content={testCase.retrievedContent} />
              )}

              {/* Side-by-side experiment cards */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <Columns className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold text-text-primary">
                    Experiment Comparison ({relatedRows.length} experiments)
                  </h4>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {relatedRows.map((row) => (
                    <div
                      key={`${row.id}-${row.experimentName}`}
                      className="border-border/50 w-72 flex-shrink-0 overflow-hidden rounded-xl border"
                    >
                      <ExperimentCard row={row} metrics={metrics} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Expected Output (if visible) */}
              {compareVisibleFields.includes('expected_output') && testCase.expectedOutput && (
                <ContentSection title="Expected Output" content={testCase.expectedOutput} />
              )}
            </div>
          ) : (
            /* Normal Mode - Single View */
            <div className="space-y-6">
              {/* Overall Score */}
              <div className="flex items-center gap-4 rounded-xl bg-gray-50 p-4">
                <div className="flex-1">
                  <p className="text-sm text-text-muted">Overall Score</p>
                  <p className={cn('text-3xl font-bold', getScoreColor(overallScore))}>
                    {(overallScore * 100).toFixed(1)}%
                  </p>
                </div>
                {testCase.experimentName && (
                  <div className="text-right">
                    <p className="text-sm text-text-muted">Experiment</p>
                    <p className="text-sm font-medium text-text-primary">
                      {testCase.experimentName}
                    </p>
                  </div>
                )}
                {hasMultipleExperiments && (
                  <div className="text-right">
                    <p className="text-sm text-text-muted">Experiments</p>
                    <p className="text-sm font-medium text-primary">
                      {relatedRows.length} available
                    </p>
                  </div>
                )}
              </div>

              {/* Metrics Grid */}
              <div>
                <h4 className="mb-3 text-sm font-semibold text-text-primary">Metric Scores</h4>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {metrics.map((metric) => {
                    const score = testCase.metrics[metric];
                    if (score === undefined) return null;

                    return (
                      <div
                        key={metric}
                        className={cn(
                          'rounded-lg border p-3',
                          getScoreBgColor(score),
                          'border-border/50'
                        )}
                      >
                        <p className="truncate text-xs text-text-muted" title={metric}>
                          {metric}
                        </p>
                        <p className={cn('text-lg font-semibold', getScoreColor(score))}>
                          {(score * 100).toFixed(1)}%
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Content Sections */}
              <ContentSection title="Query" content={testCase.query} />
              {compareVisibleFields.includes('additional_input') && testCase.additionalInput && (
                <DictContentSection title="Additional Input" content={testCase.additionalInput} />
              )}
              <ContentSection title="Actual Output" content={testCase.actualOutput} />
              {compareVisibleFields.includes('additional_output') && testCase.additionalOutput && (
                <DictContentSection title="Additional Output" content={testCase.additionalOutput} />
              )}
              {compareVisibleFields.includes('expected_output') && testCase.expectedOutput && (
                <ContentSection title="Expected Output" content={testCase.expectedOutput} />
              )}
              {compareVisibleFields.includes('conversation') && testCase.conversation && (
                <ContentSection title="Conversation" content={testCase.conversation} />
              )}
              {compareVisibleFields.includes('retrieved_content') && testCase.retrievedContent && (
                <ContentSection title="Retrieved Content" content={testCase.retrievedContent} />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-border/50 border-t bg-gray-50 px-6 py-4">
          <button
            onClick={closeTestCaseDetail}
            className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-white transition-colors hover:bg-primary-dark"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
