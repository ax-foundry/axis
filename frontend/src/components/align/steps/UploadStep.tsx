'use client';

import { Info, ArrowRight, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { FileUpload } from '@/components/file-upload';
import { cn } from '@/lib/utils';
import { useCalibrationStore } from '@/stores/calibration-store';
import { Columns } from '@/types';

export function UploadStep() {
  const { data, columns, setCurrentStep, setAnnotation } = useCalibrationStore();
  const [hasImportedLabels, setHasImportedLabels] = useState(false);
  const hasData = data.length > 0;

  // Detect pre-labeled data columns
  const preLabeledInfo = useMemo(() => {
    if (!hasData || columns.length === 0) return null;

    const lowerColumns = columns.map((c) => c.toLowerCase());
    const hasScoreColumn =
      lowerColumns.includes('score') ||
      lowerColumns.includes('label') ||
      lowerColumns.includes('human_score');

    if (!hasScoreColumn) return null;

    // Find the actual column names
    const scoreColumn = columns.find((c) =>
      ['score', 'label', 'human_score'].includes(c.toLowerCase())
    );
    const notesColumn = columns.find((c) =>
      ['notes', 'reason', 'reasoning'].includes(c.toLowerCase())
    );

    // Count labeled records
    let labeledCount = 0;
    let acceptCount = 0;
    let rejectCount = 0;

    if (scoreColumn) {
      for (const record of data) {
        const scoreValue = record[scoreColumn];
        if (scoreValue !== undefined && scoreValue !== null && scoreValue !== '') {
          const score =
            typeof scoreValue === 'string' ? parseInt(scoreValue, 10) : Number(scoreValue);
          if (score === 0 || score === 1) {
            labeledCount++;
            if (score === 1) acceptCount++;
            else rejectCount++;
          }
        }
      }
    }

    return {
      scoreColumn,
      notesColumn,
      labeledCount,
      acceptCount,
      rejectCount,
      totalRecords: data.length,
    };
  }, [data, columns, hasData]);

  const handleImportLabels = () => {
    if (!preLabeledInfo?.scoreColumn) return;

    const { scoreColumn, notesColumn } = preLabeledInfo;

    for (const record of data) {
      const recordId = record[Columns.DATASET_ID];
      const scoreValue = record[scoreColumn];

      if (scoreValue !== undefined && scoreValue !== null && scoreValue !== '') {
        const score =
          typeof scoreValue === 'string' ? parseInt(scoreValue, 10) : Number(scoreValue);
        if (score === 0 || score === 1) {
          const notes = notesColumn ? String(record[notesColumn] || '') : undefined;
          setAnnotation(recordId, score as 0 | 1, notes);
        }
      }
    }

    setHasImportedLabels(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-xl font-semibold text-text-primary">Upload Ground Truth Data</h2>
        <p className="text-text-muted">
          Upload data with query-response pairs that you&apos;ll annotate to calibrate your LLM
          judge.
        </p>
      </div>

      {/* Requirements info */}
      <div className="rounded-lg border border-primary/20 bg-primary-pale/30 p-4">
        <div className="flex gap-3">
          <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
          <div className="space-y-2 text-sm text-text-secondary">
            <p className="font-medium text-text-primary">Required CSV columns:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>
                <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">id</code> -
                Unique identifier for each record
              </li>
              <li>
                <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">query</code> -
                The user query or input
              </li>
              <li>
                <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">
                  actual_output
                </code>{' '}
                - The AI-generated response to evaluate
              </li>
            </ul>
            <p className="text-text-muted">
              Optional:{' '}
              <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">
                expected_output
              </code>{' '}
              for reference comparison
            </p>
          </div>
        </div>
      </div>

      <FileUpload targetStore="calibration" />

      {/* Pre-labeled Data Detection */}
      {preLabeledInfo && preLabeledInfo.labeledCount > 0 && !hasImportedLabels && (
        <div className="rounded-lg border border-accent-gold/30 bg-gradient-to-r from-accent-gold/10 to-accent-gold/5 p-4">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent-gold" />
            <div className="flex-1">
              <p className="font-medium text-text-primary">Pre-labeled Data Detected</p>
              <p className="mt-1 text-sm text-text-secondary">
                Found{' '}
                <span className="font-medium text-accent-gold">{preLabeledInfo.labeledCount}</span>{' '}
                records with existing labels ({preLabeledInfo.acceptCount} accepted,{' '}
                {preLabeledInfo.rejectCount} rejected)
                {preLabeledInfo.notesColumn && ' including notes'}.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={handleImportLabels}
                  className="flex items-center gap-2 rounded-lg bg-accent-gold px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-gold/90"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Use Existing Labels
                </button>
                <button
                  onClick={() => setCurrentStep('review')}
                  className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-gray-50"
                >
                  Re-annotate from Scratch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Labels Imported Success */}
      {hasImportedLabels && preLabeledInfo && (
        <div className="border-success/30 from-success/10 to-success/5 rounded-lg border bg-gradient-to-r p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-success" />
            <div>
              <p className="font-medium text-text-primary">Labels Imported Successfully</p>
              <p className="mt-1 text-sm text-text-secondary">
                Imported {preLabeledInfo.labeledCount} labels from your data. You can review and
                modify them, or proceed directly to build your evaluation.
              </p>
            </div>
          </div>
        </div>
      )}

      {hasData && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-muted">
            {data.length} records loaded
            {hasImportedLabels && preLabeledInfo
              ? ` with ${preLabeledInfo.labeledCount} labels`
              : ''}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentStep('review')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-6 py-2.5 font-medium transition-all',
                hasImportedLabels
                  ? 'border border-border bg-white text-text-secondary hover:bg-gray-50'
                  : 'bg-primary text-white hover:bg-primary-dark hover:shadow-lg hover:shadow-primary/20'
              )}
            >
              {hasImportedLabels ? 'Review Labels' : 'Continue to Review & Label'}
              <ArrowRight className="h-4 w-4" />
            </button>
            {hasImportedLabels && (
              <button
                onClick={() => setCurrentStep('build')}
                className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 font-medium text-white transition-all hover:bg-primary-dark hover:shadow-lg hover:shadow-primary/20"
              >
                Skip to Build Eval
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
