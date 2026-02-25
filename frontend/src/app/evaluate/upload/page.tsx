'use client';

import { Upload, Check, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { DataPreview } from '@/components/data-preview';
import { FileUpload } from '@/components/file-upload';
import { useDataStore } from '@/stores';

export default function UploadPage() {
  const router = useRouter();
  const { data, format, rowCount } = useDataStore();
  const hasData = data.length > 0;

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
          <DataPreview />
        </div>
      )}
    </div>
  );
}
