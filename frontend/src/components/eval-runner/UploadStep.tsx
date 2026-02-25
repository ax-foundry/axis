'use client';

import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  ChevronRight,
  Database,
  CheckCircle2,
  Loader2,
  FileText,
  Server,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useState, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';

import { evalRunnerLoadExample, evalRunnerUploadDataset } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useEvalRunnerStore } from '@/stores';

import type { EvalRunnerColumnMapping } from '@/types';

const REQUIRED_FIELDS: Array<{
  key: keyof EvalRunnerColumnMapping;
  label: string;
  description: string;
}> = [
  { key: 'dataset_id', label: 'ID', description: 'Unique identifier for each row' },
  { key: 'query', label: 'Query', description: 'The input query or question' },
  { key: 'actual_output', label: 'Actual Output', description: 'The response to evaluate' },
];

const OPTIONAL_FIELDS: Array<{
  key: keyof EvalRunnerColumnMapping;
  label: string;
  description: string;
}> = [
  {
    key: 'expected_output',
    label: 'Expected Output',
    description: 'Reference/ground truth output',
  },
  { key: 'retrieved_content', label: 'Retrieved Content', description: 'Context for RAG metrics' },
  {
    key: 'conversation',
    label: 'Conversation',
    description: 'Full conversation for multi-turn metrics',
  },
  { key: 'latency', label: 'Latency', description: 'Response latency in ms' },
  { key: 'tools_called', label: 'Tools Called', description: 'Tools used by the agent' },
  { key: 'expected_tools', label: 'Expected Tools', description: 'Expected tool calls' },
  {
    key: 'acceptance_criteria',
    label: 'Acceptance Criteria',
    description: 'Custom criteria for evaluation',
  },
];

type DataSourceType = 'upload' | 'sample' | 'database';

export function UploadStep() {
  const {
    uploadedData,
    columns,
    columnMapping,
    rowCount,
    fileName,
    setUploadedData,
    setColumnMapping,
    setCurrentStep,
  } = useEvalRunnerStore();

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<DataSourceType | null>(null);

  const loadSampleDataset = useCallback(async () => {
    setIsUploading(true);
    setUploadError(null);
    setActiveSource('sample');

    try {
      const uploadResponse = await evalRunnerLoadExample();

      if (uploadResponse.success) {
        const data = uploadResponse.dataset.preview;
        setUploadedData(data, uploadResponse.dataset.columns, 'eval_runner_sample.csv');

        if (uploadResponse.suggested_mapping) {
          setColumnMapping(uploadResponse.suggested_mapping);
        }
      } else {
        setUploadError(uploadResponse.message || 'Failed to load sample');
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to load sample');
    } finally {
      setIsUploading(false);
    }
  }, [setUploadedData, setColumnMapping]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setIsUploading(true);
      setUploadError(null);
      setActiveSource('upload');

      try {
        const response = await evalRunnerUploadDataset(file);

        if (response.success) {
          const data = response.dataset.preview;
          setUploadedData(data, response.dataset.columns, file.name);

          if (response.suggested_mapping) {
            setColumnMapping(response.suggested_mapping);
          }
        } else {
          setUploadError(response.message || 'Upload failed');
        }
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : 'Upload failed');
      } finally {
        setIsUploading(false);
      }
    },
    [setUploadedData, setColumnMapping]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    noClick: true,
    noKeyboard: true,
  });

  const handleColumnChange = (field: keyof EvalRunnerColumnMapping, value: string) => {
    setColumnMapping({ [field]: value === '' ? null : value });
  };

  const canContinue = useMemo(() => {
    return (
      uploadedData !== null &&
      uploadedData.length > 0 &&
      columnMapping.dataset_id !== null &&
      columnMapping.query !== null
    );
  }, [uploadedData, columnMapping]);

  const handleContinue = () => {
    if (canContinue) {
      setCurrentStep('agent');
    }
  };

  const clearData = () => {
    setUploadedData([], [], undefined);
    setActiveSource(null);
    setUploadError(null);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="mb-1 text-xl font-semibold text-text-primary">Upload Dataset</h2>
          <p className="text-sm text-text-muted">
            Choose a data source for your evaluation dataset
          </p>
        </div>
        {uploadedData && (
          <button
            onClick={clearData}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-gray-50 hover:text-text-primary"
          >
            <X className="h-4 w-4" />
            Clear
          </button>
        )}
      </div>

      {/* Data Source Options */}
      {!uploadedData && (
        <div {...getRootProps()} className="space-y-4">
          <input {...getInputProps()} />

          {/* Main upload area with drag support */}
          <div
            className={cn(
              'relative overflow-hidden rounded-2xl border-2 border-dashed transition-all',
              isDragActive
                ? 'border-primary bg-gradient-to-br from-primary/10 to-primary/5'
                : 'border-border bg-gradient-to-br from-gray-50 to-white',
              isUploading && 'pointer-events-none opacity-60'
            )}
          >
            {/* Decorative background */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(139,159,79,0.05),transparent_50%)]" />

            <div className="relative grid gap-4 p-6 md:grid-cols-3">
              {/* Upload CSV Option */}
              <button
                onClick={open}
                disabled={isUploading}
                className={cn(
                  'group flex flex-col items-center rounded-xl border-2 bg-white p-6 text-center transition-all hover:shadow-lg',
                  activeSource === 'upload' && isUploading
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent hover:border-primary/30 hover:bg-gradient-to-br hover:from-primary/5 hover:to-transparent'
                )}
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 transition-transform group-hover:scale-110">
                  {activeSource === 'upload' && isUploading ? (
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  ) : (
                    <Upload className="h-7 w-7 text-primary" />
                  )}
                </div>
                <h3 className="mb-1 font-semibold text-text-primary">Upload CSV</h3>
                <p className="mb-3 text-sm text-text-muted">Drop a file or click to browse</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs text-text-muted">
                  <FileText className="h-3 w-3" />
                  Max 10MB, 10K rows
                </span>
              </button>

              {/* Load Sample Option */}
              <button
                onClick={loadSampleDataset}
                disabled={isUploading}
                className={cn(
                  'group flex flex-col items-center rounded-xl border-2 bg-white p-6 text-center transition-all hover:shadow-lg',
                  activeSource === 'sample' && isUploading
                    ? 'border-amber-400 bg-amber-50'
                    : 'border-transparent hover:border-amber-300 hover:bg-gradient-to-br hover:from-amber-50 hover:to-transparent'
                )}
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-amber-50 transition-transform group-hover:scale-110">
                  {activeSource === 'sample' && isUploading ? (
                    <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
                  ) : (
                    <Sparkles className="h-7 w-7 text-amber-600" />
                  )}
                </div>
                <h3 className="mb-1 font-semibold text-text-primary">Sample Dataset</h3>
                <p className="mb-3 text-sm text-text-muted">Load example evaluation data</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-700">
                  <FileSpreadsheet className="h-3 w-3" />
                  10 sample rows
                </span>
              </button>

              {/* Connect to Database Option */}
              <button
                disabled={true}
                className="group flex flex-col items-center rounded-xl border-2 border-transparent bg-white p-6 text-center opacity-60"
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-100 to-purple-50">
                  <Server className="h-7 w-7 text-purple-600" />
                </div>
                <h3 className="mb-1 font-semibold text-text-primary">Connect Database</h3>
                <p className="mb-3 text-sm text-text-muted">Query from PostgreSQL</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-3 py-1 text-xs text-purple-700">
                  <Database className="h-3 w-3" />
                  Coming soon
                </span>
              </button>
            </div>

            {/* Drag overlay */}
            {isDragActive && (
              <div className="absolute inset-0 flex items-center justify-center bg-primary/10 backdrop-blur-sm">
                <div className="flex flex-col items-center">
                  <Upload className="h-12 w-12 text-primary" />
                  <p className="mt-2 text-lg font-medium text-primary">Drop your CSV file here</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {uploadError && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
          <div className="flex-1">
            <p className="font-medium text-red-700">Upload failed</p>
            <p className="text-sm text-red-600">{uploadError}</p>
          </div>
          <button
            onClick={() => setUploadError(null)}
            className="rounded-lg p-1 text-red-400 hover:bg-red-100 hover:text-red-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Data Preview */}
      {uploadedData && uploadedData.length > 0 && (
        <>
          {/* File Info Card */}
          <div className="rounded-xl border border-border bg-gradient-to-r from-gray-50 to-white p-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <FileSpreadsheet className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-text-primary">{fileName}</h3>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </div>
                <p className="text-sm text-text-muted">
                  {rowCount} rows · {columns.length} columns
                </p>
              </div>
            </div>
          </div>

          {/* Data Preview Table */}
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="border-b border-border bg-gray-50 px-4 py-3">
              <h3 className="font-medium text-text-primary">Data Preview</h3>
              <p className="text-xs text-text-muted">Showing first 3 rows</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/50">
                  <tr>
                    {columns.slice(0, 5).map((col) => (
                      <th
                        key={col}
                        className="border-b border-border px-4 py-2.5 text-left font-medium text-text-secondary"
                      >
                        {col}
                      </th>
                    ))}
                    {columns.length > 5 && (
                      <th className="border-b border-border px-4 py-2.5 text-left font-medium text-text-muted">
                        +{columns.length - 5} more
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {uploadedData.slice(0, 3).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      {columns.slice(0, 5).map((col) => (
                        <td
                          key={col}
                          className="border-b border-border px-4 py-2.5 text-text-primary"
                        >
                          <span className="line-clamp-1">
                            {String(row[col] ?? '').slice(0, 50)}
                            {String(row[col] ?? '').length > 50 && '...'}
                          </span>
                        </td>
                      ))}
                      {columns.length > 5 && (
                        <td className="border-b border-border px-4 py-2.5 text-text-muted">...</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Column Mapping */}
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="border-b border-border bg-gray-50 px-4 py-3">
              <h3 className="font-medium text-text-primary">Column Mapping</h3>
              <p className="text-xs text-text-muted">Map your columns to evaluation fields</p>
            </div>
            <div className="space-y-6 p-4">
              {/* Required fields */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-sm font-medium text-text-secondary">Required Fields</span>
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    Required
                  </span>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  {REQUIRED_FIELDS.map((field) => {
                    const isMapped =
                      columnMapping[field.key] !== null && columnMapping[field.key] !== undefined;
                    return (
                      <div key={field.key} className="relative">
                        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-text-primary">
                          {field.label}
                          {isMapped && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                        </label>
                        <select
                          value={columnMapping[field.key] ?? ''}
                          onChange={(e) => handleColumnChange(field.key, e.target.value)}
                          className={cn(
                            'w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2',
                            isMapped
                              ? 'border-green-300 bg-green-50 focus:border-green-400 focus:ring-green-200'
                              : 'border-border bg-white focus:border-primary focus:ring-primary/20'
                          )}
                        >
                          <option value="">Select column...</option>
                          {columns.map((col) => (
                            <option key={col} value={col}>
                              {col}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-text-muted">{field.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Optional fields */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-sm font-medium text-text-secondary">Optional Fields</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-text-muted">
                    Optional
                  </span>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  {OPTIONAL_FIELDS.map((field) => {
                    const isMapped =
                      columnMapping[field.key] !== null && columnMapping[field.key] !== undefined;
                    return (
                      <div key={field.key}>
                        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-text-primary">
                          {field.label}
                          {isMapped && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                        </label>
                        <select
                          value={columnMapping[field.key] ?? ''}
                          onChange={(e) => handleColumnChange(field.key, e.target.value)}
                          className={cn(
                            'w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2',
                            isMapped
                              ? 'border-green-300 bg-green-50 focus:border-green-400 focus:ring-green-200'
                              : 'border-border bg-white focus:border-primary focus:ring-primary/20'
                          )}
                        >
                          <option value="">(not mapped)</option>
                          {columns.map((col) => (
                            <option key={col} value={col}>
                              {col}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-text-muted">{field.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Continue Button */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleContinue}
              disabled={!canContinue}
              className={cn(
                'flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-medium transition-all',
                canContinue
                  ? 'bg-gradient-to-r from-primary to-primary-dark text-white shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30'
                  : 'cursor-not-allowed bg-gray-100 text-gray-400'
              )}
            >
              Continue to Agent
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
