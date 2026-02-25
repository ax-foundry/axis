'use client';

import { Check, Database, Loader2, Settings, Table, X } from 'lucide-react';
import { useEffect } from 'react';

import { cn } from '@/lib/utils';
import { useDatabaseStore } from '@/stores/database-store';
import { useUIStore } from '@/stores/ui-store';

import { ConnectionForm } from './ConnectionForm';
import { DataSelector } from './DataSelector';
import { ImportPreview } from './ImportPreview';

import type { DatabaseStep } from '@/stores/database-store';

interface StepConfig {
  id: DatabaseStep;
  label: string;
  icon: typeof Database;
}

const STEPS: StepConfig[] = [
  { id: 'connect', label: 'Connect', icon: Database },
  { id: 'select', label: 'Select Data', icon: Table },
  { id: 'preview', label: 'Import', icon: Settings },
];

function getStepIndex(step: DatabaseStep): number {
  // 'importing' maps to the same index as 'preview' (overlay state)
  if (step === 'importing') return STEPS.length - 1;
  const idx = STEPS.findIndex((s) => s.id === step);
  return idx >= 0 ? idx : 0;
}

export function DatabaseModal() {
  const { databaseModalOpen, setDatabaseModalOpen } = useUIStore();
  const { step, reset, isLoading } = useDatabaseStore();

  // Reset state when modal closes
  useEffect(() => {
    if (!databaseModalOpen) {
      // Delay reset to allow closing animation
      const timeout = setTimeout(() => {
        reset();
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [databaseModalOpen, reset]);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && databaseModalOpen && !isLoading) {
        setDatabaseModalOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [databaseModalOpen, isLoading, setDatabaseModalOpen]);

  if (!databaseModalOpen) return null;

  const currentStepIndex = getStepIndex(step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => !isLoading && setDatabaseModalOpen(false)}
      />

      {/* Modal */}
      <div className="relative flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-lg shadow-violet-500/25">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Pull from Database</h2>
              <p className="text-sm text-text-muted">
                Connect to PostgreSQL and import evaluation data
              </p>
            </div>
          </div>
          <button
            onClick={() => !isLoading && setDatabaseModalOpen(false)}
            disabled={isLoading}
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="border-b border-border px-6 py-3">
          <div className="flex items-center justify-between">
            {STEPS.map((s, idx) => {
              const isCompleted = idx < currentStepIndex;
              const isCurrent = s.id === step || (step === 'importing' && s.id === 'preview');
              const Icon = s.icon;

              return (
                <div key={s.id} className="flex items-center">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors',
                        isCompleted && 'bg-success text-white',
                        isCurrent && 'bg-violet-500 text-white',
                        !isCompleted && !isCurrent && 'bg-gray-100 text-text-muted'
                      )}
                    >
                      {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <span
                      className={cn(
                        'text-sm font-medium',
                        isCurrent && 'text-violet-600',
                        isCompleted && 'text-success',
                        !isCompleted && !isCurrent && 'text-text-muted'
                      )}
                    >
                      {s.label}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div
                      className={cn(
                        'mx-3 h-px w-12 transition-colors',
                        idx < currentStepIndex ? 'bg-success' : 'bg-border'
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'connect' && <ConnectionForm />}
          {step === 'select' && <DataSelector />}
          {(step === 'preview' || step === 'importing') && <ImportPreview />}
        </div>

        {/* Importing overlay */}
        {step === 'importing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <div className="text-center">
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-violet-500" />
              <p className="mt-4 text-lg font-medium text-text-primary">Importing data...</p>
              <p className="text-sm text-text-muted">This may take a moment</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
