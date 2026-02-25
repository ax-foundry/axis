'use client';

import { Download, FileJson, FileText, Table, ChevronDown } from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';

import { compareMetrics, type MetricComparison } from '@/lib/stats';
import { useBranding } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';

import type { ComparisonRow } from '@/types';

interface ExportComparisonReportProps {
  rows: ComparisonRow[];
  className?: string;
}

type ExportFormat = 'json' | 'csv' | 'markdown';

export function ExportComparisonReport({ rows, className }: ExportComparisonReportProps) {
  const { compareBaselineExperiment, compareChallengerExperiment } = useUIStore();
  const branding = useBranding();
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Get all metrics
  const allMetrics = useMemo(() => {
    const metricSet = new Set<string>();
    rows.forEach((row) => {
      Object.keys(row.metrics).forEach((m) => metricSet.add(m));
    });
    return Array.from(metricSet).sort();
  }, [rows]);

  // Filter rows by experiment
  const { baselineRows, challengerRows } = useMemo(() => {
    return {
      baselineRows: rows.filter(
        (r) => (r.experimentName || 'Default') === compareBaselineExperiment
      ),
      challengerRows: rows.filter(
        (r) => (r.experimentName || 'Default') === compareChallengerExperiment
      ),
    };
  }, [rows, compareBaselineExperiment, compareChallengerExperiment]);

  // Calculate per-metric comparisons
  const metricComparisons = useMemo((): MetricComparison[] => {
    if (!compareBaselineExperiment || !compareChallengerExperiment) return [];

    return allMetrics.map((metricName) => {
      const baselineValues = baselineRows
        .map((r) => r.metrics[metricName])
        .filter((v): v is number => typeof v === 'number' && !isNaN(v));

      const challengerValues = challengerRows
        .map((r) => r.metrics[metricName])
        .filter((v): v is number => typeof v === 'number' && !isNaN(v));

      return compareMetrics(baselineValues, challengerValues, metricName);
    });
  }, [
    allMetrics,
    baselineRows,
    challengerRows,
    compareBaselineExperiment,
    compareChallengerExperiment,
  ]);

  // Build per-case comparison data
  const caseComparisons = useMemo(() => {
    const caseMap = new Map<
      string,
      { baseline: ComparisonRow | null; challenger: ComparisonRow | null }
    >();

    rows.forEach((row) => {
      const exp = row.experimentName || 'Default';
      if (!caseMap.has(row.id)) {
        caseMap.set(row.id, { baseline: null, challenger: null });
      }
      const entry = caseMap.get(row.id)!;
      if (exp === compareBaselineExperiment) {
        entry.baseline = row;
      } else if (exp === compareChallengerExperiment) {
        entry.challenger = row;
      }
    });

    const results: Array<{
      id: string;
      query: string;
      baselineScore: number | null;
      challengerScore: number | null;
      diff: number | null;
      winner: string;
      metrics: Record<
        string,
        { baseline: number | null; challenger: number | null; diff: number | null }
      >;
    }> = [];

    caseMap.forEach((entry, id) => {
      if (entry.baseline || entry.challenger) {
        const baselineScore = entry.baseline?.overallScore ?? null;
        const challengerScore = entry.challenger?.overallScore ?? null;
        const diff =
          baselineScore !== null && challengerScore !== null
            ? challengerScore - baselineScore
            : null;

        let winner = 'N/A';
        if (diff !== null) {
          if (diff > 0.01) winner = 'Challenger';
          else if (diff < -0.01) winner = 'Baseline';
          else winner = 'Tie';
        }

        const metrics: Record<
          string,
          { baseline: number | null; challenger: number | null; diff: number | null }
        > = {};
        allMetrics.forEach((m) => {
          const b = entry.baseline?.metrics[m] ?? null;
          const c = entry.challenger?.metrics[m] ?? null;
          metrics[m] = {
            baseline: b,
            challenger: c,
            diff: b !== null && c !== null ? c - b : null,
          };
        });

        results.push({
          id,
          query: entry.baseline?.query || entry.challenger?.query || '',
          baselineScore,
          challengerScore,
          diff,
          winner,
          metrics,
        });
      }
    });

    return results;
  }, [rows, allMetrics, compareBaselineExperiment, compareChallengerExperiment]);

  // Export functions
  const exportJSON = useCallback(() => {
    const data = {
      exportedAt: new Date().toISOString(),
      comparison: {
        baseline: compareBaselineExperiment,
        challenger: compareChallengerExperiment,
      },
      summary: {
        totalCases: caseComparisons.length,
        challengerWins: caseComparisons.filter((c) => c.winner === 'Challenger').length,
        baselineWins: caseComparisons.filter((c) => c.winner === 'Baseline').length,
        ties: caseComparisons.filter((c) => c.winner === 'Tie').length,
      },
      metricComparisons: metricComparisons.map((m) => ({
        metric: m.metricName,
        baselineMean: m.baselineMean,
        baselineStd: m.baselineStd,
        challengerMean: m.challengerMean,
        challengerStd: m.challengerStd,
        difference: m.difference,
        percentChange: m.percentChange,
        cohenD: m.cohenD,
        effectSize: m.effectSize,
        pValue: m.pValue,
        isSignificant: m.isSignificant,
        winner: m.winner,
      })),
      caseComparisons,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `comparison-report-${Date.now()}.json`);
  }, [compareBaselineExperiment, compareChallengerExperiment, metricComparisons, caseComparisons]);

  const exportCSV = useCallback(() => {
    const headers = [
      'Case ID',
      'Query',
      'Baseline Score',
      'Challenger Score',
      'Difference',
      'Winner',
      ...allMetrics.flatMap((m) => [`${m} (Baseline)`, `${m} (Challenger)`, `${m} (Diff)`]),
    ];

    const csvRows = [
      headers.join(','),
      ...caseComparisons.map((c) => {
        const values = [
          escapeCSV(c.id),
          escapeCSV(c.query),
          c.baselineScore?.toFixed(4) ?? '',
          c.challengerScore?.toFixed(4) ?? '',
          c.diff?.toFixed(4) ?? '',
          c.winner,
          ...allMetrics.flatMap((m) => [
            c.metrics[m]?.baseline?.toFixed(4) ?? '',
            c.metrics[m]?.challenger?.toFixed(4) ?? '',
            c.metrics[m]?.diff?.toFixed(4) ?? '',
          ]),
        ];
        return values.join(',');
      }),
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    downloadBlob(blob, `comparison-report-${Date.now()}.csv`);
  }, [allMetrics, caseComparisons]);

  const exportMarkdown = useCallback(() => {
    const challengerWins = caseComparisons.filter((c) => c.winner === 'Challenger').length;
    const baselineWins = caseComparisons.filter((c) => c.winner === 'Baseline').length;
    const ties = caseComparisons.filter((c) => c.winner === 'Tie').length;

    const overallWinner =
      challengerWins > baselineWins
        ? 'Challenger'
        : baselineWins > challengerWins
          ? 'Baseline'
          : 'Tie';

    let md = `# Model Comparison Report

**Generated:** ${new Date().toLocaleString()}

## Overview

| | |
|---|---|
| **Baseline** | ${compareBaselineExperiment} |
| **Challenger** | ${compareChallengerExperiment} |
| **Total Cases** | ${caseComparisons.length} |
| **Overall Winner** | ${overallWinner} |

## Win/Loss Summary

| Outcome | Count | Percentage |
|---------|-------|------------|
| Challenger Wins | ${challengerWins} | ${((challengerWins / caseComparisons.length) * 100).toFixed(1)}% |
| Baseline Wins | ${baselineWins} | ${((baselineWins / caseComparisons.length) * 100).toFixed(1)}% |
| Ties | ${ties} | ${((ties / caseComparisons.length) * 100).toFixed(1)}% |

## Per-Metric Analysis

| Metric | Baseline Mean | Challenger Mean | Difference | % Change | Effect Size | Significant |
|--------|---------------|-----------------|------------|----------|-------------|-------------|
`;

    metricComparisons.forEach((m) => {
      md += `| ${m.metricName} | ${m.baselineMean.toFixed(3)} | ${m.challengerMean.toFixed(3)} | ${m.difference >= 0 ? '+' : ''}${m.difference.toFixed(3)} | ${m.percentChange >= 0 ? '+' : ''}${m.percentChange.toFixed(1)}% | ${m.effectSize} | ${m.isSignificant ? 'Yes ' + m.stars : 'No'} |
`;
    });

    md += `
## Top Divergent Cases

### Challenger Wins (Top 5)
`;

    const challengerWinCases = caseComparisons
      .filter((c) => c.winner === 'Challenger')
      .sort((a, b) => (b.diff ?? 0) - (a.diff ?? 0))
      .slice(0, 5);

    if (challengerWinCases.length > 0) {
      md += `| Case ID | Baseline | Challenger | Diff |
|---------|----------|------------|------|
`;
      challengerWinCases.forEach((c) => {
        md += `| ${c.id.slice(0, 20)} | ${c.baselineScore?.toFixed(3) ?? '-'} | ${c.challengerScore?.toFixed(3) ?? '-'} | +${c.diff?.toFixed(3) ?? '-'} |
`;
      });
    } else {
      md += '*No cases where challenger wins*\n';
    }

    md += `
### Baseline Wins (Top 5)
`;

    const baselineWinCases = caseComparisons
      .filter((c) => c.winner === 'Baseline')
      .sort((a, b) => (a.diff ?? 0) - (b.diff ?? 0))
      .slice(0, 5);

    if (baselineWinCases.length > 0) {
      md += `| Case ID | Baseline | Challenger | Diff |
|---------|----------|------------|------|
`;
      baselineWinCases.forEach((c) => {
        md += `| ${c.id.slice(0, 20)} | ${c.baselineScore?.toFixed(3) ?? '-'} | ${c.challengerScore?.toFixed(3) ?? '-'} | ${c.diff?.toFixed(3) ?? '-'} |
`;
      });
    } else {
      md += '*No cases where baseline wins*\n';
    }

    md += `
---
*${branding.report_footer}*
`;

    const blob = new Blob([md], { type: 'text/markdown' });
    downloadBlob(blob, `comparison-report-${Date.now()}.md`);
  }, [
    compareBaselineExperiment,
    compareChallengerExperiment,
    metricComparisons,
    caseComparisons,
    branding.report_footer,
  ]);

  const handleExport = async (format: ExportFormat) => {
    setIsExporting(true);
    try {
      switch (format) {
        case 'json':
          exportJSON();
          break;
        case 'csv':
          exportCSV();
          break;
        case 'markdown':
          exportMarkdown();
          break;
      }
    } finally {
      setIsExporting(false);
      setIsOpen(false);
    }
  };

  if (!compareBaselineExperiment || !compareChallengerExperiment) {
    return null;
  }

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all',
          'border-border bg-white text-text-secondary hover:bg-gray-50',
          isExporting && 'cursor-not-allowed opacity-50'
        )}
      >
        <Download className="h-4 w-4" />
        Export Report
        <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-border bg-white shadow-lg">
            <div className="py-1">
              <button
                onClick={() => handleExport('json')}
                className="flex w-full items-center gap-3 px-4 py-2 text-sm text-text-secondary hover:bg-gray-50"
              >
                <FileJson className="h-4 w-4 text-blue-500" />
                <div className="text-left">
                  <div className="font-medium">JSON</div>
                  <div className="text-xs text-text-muted">Full comparison data</div>
                </div>
              </button>
              <button
                onClick={() => handleExport('csv')}
                className="flex w-full items-center gap-3 px-4 py-2 text-sm text-text-secondary hover:bg-gray-50"
              >
                <Table className="h-4 w-4 text-green-500" />
                <div className="text-left">
                  <div className="font-medium">CSV</div>
                  <div className="text-xs text-text-muted">Per-case metrics</div>
                </div>
              </button>
              <button
                onClick={() => handleExport('markdown')}
                className="flex w-full items-center gap-3 px-4 py-2 text-sm text-text-secondary hover:bg-gray-50"
              >
                <FileText className="h-4 w-4 text-purple-500" />
                <div className="text-left">
                  <div className="font-medium">Markdown</div>
                  <div className="text-xs text-text-muted">Shareable summary</div>
                </div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
