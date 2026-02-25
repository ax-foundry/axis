'use client';

import { Upload, Bot, BarChart3, Play, ChevronRight, Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useEvalRunnerStore } from '@/stores';

import type { EvalRunnerStep } from '@/types';

const steps: Array<{
  id: EvalRunnerStep;
  label: string;
  icon: typeof Upload;
  description: string;
  optional?: boolean;
}> = [
  { id: 'upload', label: 'Upload', icon: Upload, description: 'Upload dataset' },
  { id: 'agent', label: 'Agent', icon: Bot, description: 'Connect agent', optional: true },
  { id: 'metrics', label: 'Metrics', icon: BarChart3, description: 'Select metrics' },
  { id: 'run', label: 'Run', icon: Play, description: 'Run evaluation' },
];

export function StepNavigation() {
  const { currentStep, setCurrentStep, canNavigateToStep } = useEvalRunnerStore();
  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <nav className="flex items-center gap-2">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isActive = step.id === currentStep;
        const isPast = index < currentStepIndex;
        const canNavigate = canNavigateToStep(step.id);

        return (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => canNavigate && setCurrentStep(step.id)}
              disabled={!canNavigate}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2 transition-all',
                isActive
                  ? 'bg-primary text-white shadow-md shadow-primary/20'
                  : isPast
                    ? 'cursor-pointer bg-primary-pale text-primary hover:bg-primary-soft'
                    : canNavigate
                      ? 'cursor-pointer bg-gray-100 text-text-secondary hover:bg-gray-200'
                      : 'cursor-not-allowed bg-gray-100 text-text-muted'
              )}
            >
              {isPast ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              <span className="font-medium">{step.label}</span>
              {step.optional && <span className="text-xs opacity-60">(optional)</span>}
            </button>
            {index < steps.length - 1 && (
              <ChevronRight
                className={cn('mx-2 h-5 w-5', isPast ? 'text-primary' : 'text-text-muted')}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
