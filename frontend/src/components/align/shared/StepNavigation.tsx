'use client';

import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useCalibrationStore } from '@/stores/calibration-store';

import type { AlignStep } from '@/types';

const steps: Array<{
  id: AlignStep;
  label: string;
  number: number;
}> = [
  { id: 'upload', label: 'Upload', number: 1 },
  { id: 'review', label: 'Review & Label', number: 2 },
  { id: 'build', label: 'Build Eval', number: 3 },
];

export function StepNavigation() {
  const { currentStep, setCurrentStep, canNavigateToStep } = useCalibrationStore();
  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <nav className="flex border-b border-border">
      {steps.map((step, index) => {
        const isActive = step.id === currentStep;
        const isPast = index < currentStepIndex;
        const canNavigate = canNavigateToStep(step.id);

        return (
          <button
            key={step.id}
            onClick={() => canNavigate && setCurrentStep(step.id)}
            disabled={!canNavigate}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-all',
              isActive
                ? 'border-primary text-primary'
                : isPast
                  ? 'border-transparent text-success'
                  : canNavigate
                    ? 'cursor-pointer border-transparent text-text-muted hover:text-text-primary'
                    : 'cursor-not-allowed border-transparent text-text-muted'
            )}
          >
            {isPast ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <span
                className={cn(
                  'inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] text-xs font-semibold',
                  isActive
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-text-muted'
                )}
              >
                {step.number}
              </span>
            )}
            {step.label}
          </button>
        );
      })}
    </nav>
  );
}
