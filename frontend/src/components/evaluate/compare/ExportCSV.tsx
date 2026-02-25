'use client';

import { Download } from 'lucide-react';

import type { ComparisonRow } from '@/types';

interface ExportCSVProps {
  rows: ComparisonRow[];
  metrics: string[];
  filename?: string;
}

export function ExportCSV({ rows, metrics, filename = 'comparison-export' }: ExportCSVProps) {
  const handleExport = () => {
    if (rows.length === 0) return;

    // Build CSV header
    const headers = [
      'ID',
      'Experiment',
      'Query',
      'Actual Output',
      'Expected Output',
      ...metrics,
      'Overall Score',
    ];

    // Build CSV rows
    const csvRows = rows.map((row) => {
      const metricValues = metrics.map((m) => {
        const val = row.metrics[m];
        return val !== undefined ? (val * 100).toFixed(2) + '%' : '';
      });

      return [
        escapeCSV(row.id),
        escapeCSV(row.experimentName || ''),
        escapeCSV(row.query),
        escapeCSV(row.actualOutput),
        escapeCSV(row.expectedOutput || ''),
        ...metricValues,
        (row.overallScore * 100).toFixed(2) + '%',
      ];
    });

    // Combine header and rows
    const csvContent = [
      headers.map(escapeCSV).join(','),
      ...csvRows.map((row) => row.join(',')),
    ].join('\n');

    // Create and download blob
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      disabled={rows.length === 0}
      className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-text-secondary transition-all hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
      title="Export filtered data to CSV"
    >
      <Download className="h-4 w-4" />
      <span>Export CSV</span>
    </button>
  );
}

function escapeCSV(value: string): string {
  if (!value) return '""';
  // Escape double quotes and wrap in quotes if contains comma, newline, or quote
  const escaped = value.replace(/"/g, '""');
  if (escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')) {
    return `"${escaped}"`;
  }
  return escaped;
}
