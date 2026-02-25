'use client';

import { CheckCircle2, Database, File, Loader2, Upload, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

import { useExampleDataset, useUploadFile } from '@/lib/hooks';
import { useAnnotationExampleDataset, useAnnotationUpload } from '@/lib/hooks/useAnnotationUpload';
import {
  useCalibrationExampleDataset,
  useCalibrationUpload,
} from '@/lib/hooks/useCalibrationUpload';
import {
  useHumanSignalsExampleDataset,
  useHumanSignalsUpload,
} from '@/lib/hooks/useHumanSignalsUpload';
import { useMonitoringExampleDataset, useMonitoringUpload } from '@/lib/hooks/useMonitoringUpload';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';

type TargetStore = 'data' | 'annotation' | 'calibration' | 'human_signals' | 'monitoring';
type ImportMode = 'file' | 'database';

// Example datasets per target store
const exampleDatasetsByStore: Record<
  TargetStore,
  Array<{ id: string; name: string; icon: string }>
> = {
  data: [
    { id: 'model', name: 'Example Model', icon: '📊' },
    { id: 'comparison', name: 'Model Comparison', icon: '🔄' },
  ],
  annotation: [{ id: 'annotation', name: 'Annotation Sample', icon: '✏️' }],
  calibration: [{ id: 'align', name: 'Caliber HQ', icon: '⚖️' }],
  human_signals: [{ id: 'hitl', name: 'Human Signals Sample', icon: '💬' }],
  monitoring: [{ id: 'monitoring', name: 'Monitoring Sample', icon: '📈' }],
};

interface FileUploadProps {
  targetStore?: TargetStore;
}

export function FileUpload({ targetStore = 'data' }: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('file');
  const { setDatabaseModalOpen } = useUIStore();

  // Data store mutations
  const dataUploadMutation = useUploadFile();
  const dataExampleMutation = useExampleDataset();

  // Annotation store mutations
  const annotationUploadMutation = useAnnotationUpload();
  const annotationExampleMutation = useAnnotationExampleDataset();

  // Calibration store mutations
  const calibrationUploadMutation = useCalibrationUpload();
  const calibrationExampleMutation = useCalibrationExampleDataset();

  // Human signals store mutations
  const humanSignalsUploadMutation = useHumanSignalsUpload();
  const humanSignalsExampleMutation = useHumanSignalsExampleDataset();

  // Monitoring store mutations
  const monitoringUploadMutation = useMonitoringUpload();
  const monitoringExampleMutation = useMonitoringExampleDataset();

  // Select the appropriate mutations based on target store
  const uploadMutation = {
    data: dataUploadMutation,
    annotation: annotationUploadMutation,
    calibration: calibrationUploadMutation,
    human_signals: humanSignalsUploadMutation,
    monitoring: monitoringUploadMutation,
  }[targetStore];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type ExampleMutation = {
    mutate: (id: string) => void;
    reset: () => void;
    isPending: boolean;
    isSuccess: boolean;
    error: Error | null;
  };
  const exampleMutationMap: Partial<Record<TargetStore, ExampleMutation>> = {
    data: dataExampleMutation,
    annotation: annotationExampleMutation,
    calibration: calibrationExampleMutation,
    human_signals: humanSignalsExampleMutation as unknown as ExampleMutation,
    monitoring: monitoringExampleMutation as unknown as ExampleMutation,
  };
  const exampleMutation = exampleMutationMap[targetStore];

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        setSelectedFile(file);
        uploadMutation.mutate(file);
      }
    },
    [uploadMutation]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
  });

  const handleLoadExample = (datasetId: string) => {
    exampleMutation?.mutate(datasetId);
  };

  const handleReset = () => {
    setSelectedFile(null);
    uploadMutation.reset();
    exampleMutation?.reset();
  };

  const isLoading = uploadMutation.isPending || (exampleMutation?.isPending ?? false);
  const isSuccess = uploadMutation.isSuccess || (exampleMutation?.isSuccess ?? false);
  const error = uploadMutation.error || exampleMutation?.error;

  // Show database option for data, human signals, and monitoring stores
  const showDatabaseOption =
    targetStore === 'data' || targetStore === 'human_signals' || targetStore === 'monitoring';

  return (
    <div className="space-y-4">
      {/* Import Mode Tabs */}
      {showDatabaseOption && !isSuccess && (
        <div className="flex rounded-lg border border-border bg-gray-50 p-1">
          <button
            onClick={() => setImportMode('file')}
            disabled={isLoading}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              importMode === 'file'
                ? 'bg-white text-primary shadow-sm'
                : 'text-text-muted hover:text-primary'
            )}
          >
            <Upload className="h-4 w-4" />
            CSV File
          </button>
          <button
            onClick={() => setImportMode('database')}
            disabled={isLoading}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              importMode === 'database'
                ? 'bg-white text-primary shadow-sm'
                : 'text-text-muted hover:text-primary'
            )}
          >
            <Database className="h-4 w-4" />
            PostgreSQL
          </button>
        </div>
      )}

      {/* File Upload Mode */}
      {(importMode === 'file' || !showDatabaseOption) && (
        <>
          {/* Compact Dropzone */}
          <div
            {...getRootProps()}
            className={cn(
              'relative cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors duration-150',
              isDragActive
                ? 'border-primary bg-primary/5'
                : 'border-border bg-gray-50/50 hover:border-primary/50 hover:bg-gray-50',
              isLoading && 'pointer-events-none',
              isSuccess && 'bg-success/5 border-success'
            )}
          >
            <input {...getInputProps()} />

            {isLoading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
                <div>
                  <p className="font-medium text-text-primary">Processing...</p>
                  <p className="text-sm text-text-muted">Validating data format</p>
                </div>
              </div>
            ) : isSuccess ? (
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success">
                  <CheckCircle2 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="font-medium text-text-primary">Upload Complete</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReset();
                    }}
                    className="mt-1 text-sm font-medium text-primary hover:text-primary-dark"
                  >
                    Upload another file
                  </button>
                </div>
              </div>
            ) : selectedFile ? (
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <File className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-text-primary">{selectedFile.name}</p>
                  <p className="text-sm text-text-muted">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                  className="hover:text-error/80 flex items-center gap-1 text-sm font-medium text-error"
                >
                  <X className="h-3.5 w-3.5" />
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-lg transition-colors',
                    isDragActive ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
                  )}
                >
                  <Upload className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-medium text-text-primary">
                    {isDragActive ? 'Drop to upload' : 'Drop CSV or click to browse'}
                  </p>
                  <p className="mt-0.5 text-sm text-text-muted">
                    Tree format, flat scores, or judgment data
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="border-error/20 bg-error/5 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-error">
              <X className="h-4 w-4 flex-shrink-0" />
              <span>
                {error instanceof Error ? error.message : 'Upload failed. Please try again.'}
              </span>
            </div>
          )}

          {/* Example Datasets - Inline Pills */}
          {exampleDatasetsByStore[targetStore].length > 0 && !isSuccess && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-text-muted">Try example:</span>
              {exampleDatasetsByStore[targetStore].map((dataset) => (
                <button
                  key={dataset.id}
                  onClick={() => handleLoadExample(dataset.id)}
                  disabled={isLoading}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                    'border-border bg-white text-text-primary',
                    'hover:border-primary/30 hover:bg-gray-50 hover:text-primary',
                    'disabled:cursor-not-allowed disabled:opacity-50'
                  )}
                >
                  <span>{dataset.icon}</span>
                  {dataset.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Database Mode */}
      {importMode === 'database' && showDatabaseOption && (
        <div className="rounded-lg border border-border bg-gray-50 p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
              <Database className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="font-medium text-text-primary">Connect to PostgreSQL</p>
              <p className="mt-0.5 text-sm text-text-muted">
                Import evaluation data directly from your database
              </p>
            </div>
            <button
              onClick={() =>
                setDatabaseModalOpen(true, targetStore === 'monitoring' ? 'monitoring' : 'data')
              }
              className="btn-primary flex items-center gap-2"
            >
              <Database className="h-4 w-4" />
              Connect Database
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
