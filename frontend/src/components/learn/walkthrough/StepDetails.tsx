'use client';

import type { WalkthroughStep } from '@/types';

interface StepDetailsProps {
  step: WalkthroughStep;
  stepNumber: number;
  totalSteps: number;
}

export function StepDetails({ step, stepNumber, totalSteps }: StepDetailsProps) {
  return (
    <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
      {/* Step Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              Step {stepNumber} of {totalSteps}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-xs ${
                step.animationType === 'flow'
                  ? 'bg-blue-100 text-blue-700'
                  : step.animationType === 'highlight'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-700'
              }`}
            >
              {step.animationType}
            </span>
          </div>
          <h3 className="text-xl font-semibold text-text-primary">{step.title}</h3>
        </div>
      </div>

      {/* Step Description */}
      <p className="mb-4 leading-relaxed text-text-secondary">{step.description}</p>

      {/* Data State */}
      {(step.dataState.input || step.dataState.processing || step.dataState.output) && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium uppercase tracking-wide text-text-muted">
            Current State
          </h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {step.dataState.input && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                <p className="mb-1 text-xs font-medium text-blue-600">Input</p>
                <p className="text-sm text-blue-800">{step.dataState.input}</p>
              </div>
            )}
            {step.dataState.processing && (
              <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                <p className="mb-1 text-xs font-medium text-amber-600">Processing</p>
                <p className="text-sm text-amber-800">{step.dataState.processing}</p>
              </div>
            )}
            {step.dataState.output && (
              <div className="rounded-lg border border-purple-100 bg-purple-50 p-3">
                <p className="mb-1 text-xs font-medium text-purple-600">Output</p>
                <p className="text-sm text-purple-800">{step.dataState.output}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Highlighted Elements Info */}
      {step.highlightElements.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs text-text-muted">
            <span className="font-medium">Focus:</span> {step.highlightElements.join(' → ')}
          </p>
        </div>
      )}
    </div>
  );
}
