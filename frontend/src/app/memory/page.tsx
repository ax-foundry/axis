'use client';

import {
  AlertCircle,
  Brain,
  CheckCircle2,
  File,
  Loader2,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';

import { BatchesTab } from '@/components/memory/BatchesTab';
import { DecisionQualityTab } from '@/components/memory/DecisionQualityTab';
import { KnowledgeGraphTab } from '@/components/memory/graph/KnowledgeGraphTab';
import { HardStopsTab } from '@/components/memory/HardStopsTab';
import { MemorySummaryStrip } from '@/components/memory/MemorySummaryStrip';
import { MemoryTabs } from '@/components/memory/MemoryTabs';
import { RulesTab } from '@/components/memory/RulesTab';
import { PageHeader } from '@/components/ui/PageHeader';
import { getField, useMemoryConfig } from '@/lib/hooks/useMemoryConfig';
import { useMemoryUpload } from '@/lib/hooks/useMemoryUpload';
import { cn } from '@/lib/utils';
import { useMemoryStore } from '@/stores/memory-store';

const KEY_OPTIONAL_ROLES = ['category', 'group_by', 'product'];

export default function MemoryPage() {
  const {
    activeTab,
    data,
    clearData,
    availableAgentNames,
    selectedAgentName,
    setSelectedAgentName,
  } = useMemoryStore();
  const { data: config } = useMemoryConfig();
  const uploadMutation = useMemoryUpload();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const hasData = data.length > 0;
  const showDashboard = hasData || activeTab === 'knowledge-graph';

  // Expected columns from config (role → CSV column name)
  const expectedColumns = useMemo(() => {
    if (!config) return [];
    const roles = config.required_roles ?? [];
    const extra = ['category', 'group_by', 'product', 'mitigants', 'threshold_type'];
    const allRoles = Array.from(new Set([...roles, ...extra]));
    return allRoles.map((role) => config.field_roles[role] ?? role);
  }, [config]);

  // Check if key optional roles are empty across the entire dataset
  const emptyOptionalRoles = useMemo(() => {
    if (!hasData) return [];
    return KEY_OPTIONAL_ROLES.filter((role) => data.every((r) => !getField(r, role)));
  }, [data, hasData]);

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
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
  });

  const handleReset = () => {
    setSelectedFile(null);
    uploadMutation.reset();
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Brain}
        title="Memory"
        subtitle="Extracted decision rules, logic, and agent learning from source documents"
        actions={
          hasData ? (
            <button
              onClick={clearData}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-gray-50 hover:text-text-primary"
            >
              <RotateCcw className="h-4 w-4" />
              Start Over
            </button>
          ) : undefined
        }
      />

      {/* Agent selector — local to memory page */}
      {hasData && availableAgentNames.length > 1 && (
        <div className="border-b border-border bg-white">
          <div className="mx-auto flex max-w-7xl items-stretch px-6">
            {availableAgentNames.map((name) => (
              <button
                key={name}
                onClick={() => setSelectedAgentName(name)}
                className={cn(
                  'relative px-5 py-2.5 text-[13px] font-medium transition-colors',
                  selectedAgentName === name
                    ? 'text-primary-dark'
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                <span
                  className={cn(
                    'absolute inset-x-3 bottom-0 h-0.5 rounded-t transition-colors',
                    selectedAgentName === name ? 'bg-primary' : 'bg-transparent'
                  )}
                />
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="mx-auto max-w-7xl px-6 py-6">
        {!showDashboard ? (
          /* Empty state — upload */
          <div className="mx-auto max-w-2xl">
            <div className="card p-8">
              <div className="mb-6 flex flex-col items-center text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <h2 className="mb-2 text-xl font-semibold text-text-primary">
                  Import Rule Extractions
                </h2>
                <p className="max-w-md text-sm text-text-muted">
                  Upload a CSV of extracted rules or connect to a database to explore decision
                  logic, mitigants, and hard stops.
                </p>
              </div>

              {/* Inline dropzone */}
              <div
                {...getRootProps()}
                className={cn(
                  'relative cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors duration-150',
                  isDragActive
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-gray-50/50 hover:border-primary/50 hover:bg-gray-50',
                  uploadMutation.isPending && 'pointer-events-none',
                  uploadMutation.isSuccess && 'bg-success/5 border-success'
                )}
              >
                <input {...getInputProps()} />
                {uploadMutation.isPending ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                      <Loader2 className="h-6 w-6 animate-spin text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-text-primary">Processing...</p>
                      <p className="text-sm text-text-muted">Validating data format</p>
                    </div>
                  </div>
                ) : uploadMutation.isSuccess ? (
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
                      <p className="mt-0.5 text-sm text-text-muted">Rule extractions CSV</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Error */}
              {uploadMutation.error && (
                <div className="border-error/20 bg-error/5 mt-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-error">
                  <X className="h-4 w-4 flex-shrink-0" />
                  <span>
                    {uploadMutation.error instanceof Error
                      ? uploadMutation.error.message
                      : 'Upload failed. Please try again.'}
                  </span>
                </div>
              )}

              {/* Expected columns hint */}
              <div className="mt-6 rounded-lg border border-border bg-gray-50 p-4">
                <p className="mb-2 text-xs font-medium text-text-muted">Expected columns:</p>
                <div className="flex flex-wrap gap-2">
                  {expectedColumns.map((col) => (
                    <span
                      key={col}
                      className="rounded bg-white px-2 py-1 font-mono text-xs text-text-secondary shadow-sm"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Dashboard */
          <div className="space-y-5">
            {/* Warning banner for empty optional roles */}
            {emptyOptionalRoles.length > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600" />
                <p className="text-sm text-amber-700">
                  Some data fields are empty — check your CSV or field_roles config.
                </p>
              </div>
            )}

            {hasData && <MemorySummaryStrip />}

            <div className="space-y-4">
              <MemoryTabs />

              <div className="pt-2">
                {activeTab === 'rules' && <RulesTab />}
                {activeTab === 'quality' && <DecisionQualityTab />}
                {activeTab === 'hard-stops' && <HardStopsTab />}
                {activeTab === 'batches' && <BatchesTab />}
                {activeTab === 'knowledge-graph' && <KnowledgeGraphTab />}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
