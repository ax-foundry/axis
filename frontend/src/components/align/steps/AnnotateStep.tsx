'use client';

import { ArrowRight, ArrowLeft } from 'lucide-react';
import { useEffect, useCallback, useState } from 'react';

import { useCalibrationStore } from '@/stores/calibration-store';
import { Columns } from '@/types';

import { AlignAnnotationCard } from '../annotation/AlignAnnotationCard';
import { AlignAnnotationProgress } from '../annotation/AlignAnnotationProgress';
import { CaliberConfigModal } from '../config/CaliberConfigModal';

export function AnnotateStep() {
  const {
    data,
    humanAnnotations,
    currentAnnotationIndex,
    displayColumns,
    setAnnotation,
    setAnnotationNotes,
    setCurrentAnnotationIndex,
    setCurrentStep,
    getAnnotationProgress,
  } = useCalibrationStore();

  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  const currentRecord = data[currentAnnotationIndex];
  const currentRecordId = currentRecord?.[Columns.DATASET_ID];
  const currentAnnotation = currentRecordId ? humanAnnotations[currentRecordId] : undefined;
  const currentScore = currentAnnotation?.score;
  const currentNotes = currentAnnotation?.notes ?? '';
  const progress = getAnnotationProgress();

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'a':
          if (currentRecordId) {
            setAnnotation(currentRecordId, 1);
            // Auto-advance to next if not at the end
            if (currentAnnotationIndex < data.length - 1) {
              setCurrentAnnotationIndex(currentAnnotationIndex + 1);
            }
          }
          break;
        case 'r':
          if (currentRecordId) {
            setAnnotation(currentRecordId, 0);
            // Auto-advance to next if not at the end
            if (currentAnnotationIndex < data.length - 1) {
              setCurrentAnnotationIndex(currentAnnotationIndex + 1);
            }
          }
          break;
        case 'arrowleft':
          if (currentAnnotationIndex > 0) {
            setCurrentAnnotationIndex(currentAnnotationIndex - 1);
          }
          break;
        case 'arrowright':
          if (currentAnnotationIndex < data.length - 1) {
            setCurrentAnnotationIndex(currentAnnotationIndex + 1);
          }
          break;
      }
    },
    [currentRecordId, currentAnnotationIndex, data.length, setAnnotation, setCurrentAnnotationIndex]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleScore = (score: 0 | 1) => {
    if (currentRecordId) {
      setAnnotation(currentRecordId, score, currentNotes);
      // Auto-advance to next unannotated
      const nextUnannotatedIndex = data.findIndex(
        (record, idx) =>
          idx > currentAnnotationIndex && !(record[Columns.DATASET_ID] in humanAnnotations)
      );
      if (nextUnannotatedIndex !== -1) {
        setCurrentAnnotationIndex(nextUnannotatedIndex);
      } else if (currentAnnotationIndex < data.length - 1) {
        setCurrentAnnotationIndex(currentAnnotationIndex + 1);
      }
    }
  };

  const handleNotesChange = (notes: string) => {
    if (currentRecordId) {
      if (currentAnnotation) {
        setAnnotationNotes(currentRecordId, notes);
      }
    }
  };

  const handleNext = () => {
    if (currentAnnotationIndex < data.length - 1) {
      setCurrentAnnotationIndex(currentAnnotationIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentAnnotationIndex > 0) {
      setCurrentAnnotationIndex(currentAnnotationIndex - 1);
    }
  };

  if (!currentRecord) {
    return (
      <div className="py-12 text-center text-text-muted">
        No data to annotate. Please upload data first.
      </div>
    );
  }

  return (
    <div>
      <CaliberConfigModal isOpen={isConfigModalOpen} onClose={() => setIsConfigModalOpen(false)} />

      {/* Main Grid: annotation card + sticky sidebar */}
      <div className="grid grid-cols-[1fr_300px] items-start gap-5">
        {/* Left: Annotation Card */}
        <AlignAnnotationCard
          record={currentRecord}
          index={currentAnnotationIndex}
          total={data.length}
          currentScore={currentScore}
          currentNotes={currentNotes}
          displayColumns={displayColumns}
          onScore={handleScore}
          onNotesChange={handleNotesChange}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onConfigure={() => setIsConfigModalOpen(true)}
        />

        {/* Right: Sticky Sidebar */}
        <div className="sticky top-5">
          <AlignAnnotationProgress
            records={data}
            annotations={humanAnnotations}
            currentIndex={currentAnnotationIndex}
            onSelectRecord={setCurrentAnnotationIndex}
          />
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <button
          onClick={() => setCurrentStep('upload')}
          className="flex items-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:border-text-muted hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Upload
        </button>

        <span className="text-xs text-text-muted">
          <strong className="text-text-primary">{progress.annotated}</strong> of {progress.total}{' '}
          annotated
        </span>

        <button
          onClick={() => setCurrentStep('build')}
          disabled={progress.annotated === 0}
          className="flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue to Build Eval
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
