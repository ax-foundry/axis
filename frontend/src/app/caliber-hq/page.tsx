'use client';

import { Download, RotateCcw, Settings, Target } from 'lucide-react';
import { useState, useCallback } from 'react';

import { StepNavigation, UploadStep, AnnotateStep, BuildEvalStep } from '@/components/align';
import { CaliberConfigModal } from '@/components/align/config/CaliberConfigModal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useCalibrationStore } from '@/stores/calibration-store';
import { Columns } from '@/types';

export default function CalibrationPage() {
  const { currentStep, resetAll, data, humanAnnotations } = useCalibrationStore();
  const [configModalOpen, setConfigModalOpen] = useState(false);

  const annotationCount = Object.keys(humanAnnotations).length;

  const handleExport = useCallback(() => {
    if (data.length === 0) return;

    const exportData = data.map((record) => {
      const recordId = record[Columns.DATASET_ID];
      const annotation = humanAnnotations[String(recordId)];
      return {
        ...record,
        human_score: annotation?.score,
        human_notes: annotation?.notes ?? '',
      };
    });

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caliber-annotations-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data, humanAnnotations]);

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Target}
        title="CaliberHQ"
        subtitle="Align LLM judges with human judgment through calibration and pattern discovery"
        maxWidth="max-w-6xl"
        actions={
          data.length > 0 ? (
            <>
              <button
                onClick={() => setConfigModalOpen(true)}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-[7px] text-xs font-medium text-text-secondary transition-all hover:border-primary hover:text-primary"
              >
                <Settings className="h-3.5 w-3.5" />
                Configure
              </button>
              <button
                onClick={handleExport}
                disabled={annotationCount === 0}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-[7px] text-xs font-medium text-text-secondary transition-all hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </button>
              <button
                onClick={resetAll}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-[7px] text-xs font-medium text-text-muted transition-colors hover:bg-gray-50 hover:text-text-primary"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Start Over
              </button>
            </>
          ) : undefined
        }
      />

      {/* Content */}
      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* Step Navigation */}
        <div className="mb-6">
          <StepNavigation />
        </div>

        {/* Step Content */}
        {currentStep === 'upload' && <UploadStep />}
        {currentStep === 'review' && <AnnotateStep />}
        {currentStep === 'build' && <BuildEvalStep />}
      </div>

      <CaliberConfigModal isOpen={configModalOpen} onClose={() => setConfigModalOpen(false)} />
    </div>
  );
}
