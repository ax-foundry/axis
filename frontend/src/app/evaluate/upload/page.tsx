'use client';

import { Upload, Check, ArrowRight, FlaskConical } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { DataPreview } from '@/components/data-preview';
import { FileUpload } from '@/components/file-upload';
import { useFilteredEvalData } from '@/lib/hooks/useFilteredEvalData';
import { useDataStore } from '@/stores';

export default function UploadPage() {
  const router = useRouter();
  const { format, rowCount } = useDataStore();
  const { evaluationNames, recordsByName } = useFilteredEvalData();
  const hasData = rowCount > 0;

  const handleContinue = () => {
    router.push('/evaluate/scorecard');
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Upload className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Upload Evaluation Data</h2>
          <p className="text-sm text-text-muted">Import your CSV file or try an example dataset</p>
        </div>
      </div>

      <FileUpload />

      {hasData && (
        <div className="mt-8 border-t border-border pt-8">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-success/10 flex h-12 w-12 items-center justify-center rounded-lg">
                <Check className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="font-semibold text-text-primary">Data Loaded Successfully</p>
                <p className="text-sm text-text-muted">
                  Format: <span className="font-medium text-primary">{format}</span> &bull;{' '}
                  {rowCount} records
                </p>
              </div>
            </div>
            <button onClick={handleContinue} className="btn-primary flex items-center gap-2">
              Continue to Scorecard
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {/* Evaluation Names Breakdown */}
          {evaluationNames.length > 1 && (
            <div className="mb-6 overflow-hidden rounded-lg border border-border bg-white">
              <div className="flex items-center gap-2 border-b border-border bg-gray-50 px-4 py-2.5">
                <FlaskConical className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium text-text-primary">
                  {evaluationNames.length} Evaluation Names Detected
                </h3>
                <span className="ml-auto text-xs text-text-muted">
                  Use the filter bar above to scope each view
                </span>
              </div>
              <div className="grid grid-cols-2 divide-x divide-border sm:grid-cols-3 lg:grid-cols-4">
                {evaluationNames.map((name) => {
                  const count = recordsByName[name] ?? 0;
                  const pct = rowCount > 0 ? Math.round((count / rowCount) * 100) : 0;
                  return (
                    <div key={name} className="px-4 py-3">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span
                          className="max-w-[120px] truncate text-xs font-medium text-text-primary"
                          title={name}
                        >
                          {name}
                        </span>
                        <span className="text-xs font-semibold text-primary">{pct}%</span>
                      </div>
                      <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-xs text-text-muted">{count} records</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <DataPreview />
        </div>
      )}
    </div>
  );
}
