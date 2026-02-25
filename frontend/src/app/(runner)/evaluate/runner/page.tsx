'use client';

import { Lock, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  StepNavigation,
  UploadStep,
  AgentConnectStep,
  MetricSelectStep,
  RunStep,
} from '@/components/eval-runner';
import { getFeaturesConfig } from '@/lib/api';
import { useEvalRunnerStore } from '@/stores';

export default function EvalRunnerPage() {
  const router = useRouter();
  const { currentStep, reset, uploadedData, results } = useEvalRunnerStore();
  const [evalRunnerEnabled, setEvalRunnerEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFeaturesConfig()
      .then((config) => setEvalRunnerEnabled(config.eval_runner_enabled))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return null;
  }

  if (!evalRunnerEnabled) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100">
            <Lock className="h-6 w-6 text-text-muted" />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-text-primary">
            Evaluation Runner Disabled
          </h2>
          <p className="mb-6 text-sm text-text-muted">
            The batch evaluation runner has been disabled by your administrator. You can still
            upload pre-computed evaluation results.
          </p>
          <button
            onClick={() => router.push('/evaluate/upload')}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-dark hover:shadow-md"
          >
            Go to Upload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold text-text-primary">Evaluation Runner</h1>
          <p className="text-text-muted">
            Run batch evaluations on your dataset using axion metrics
          </p>
        </div>
        {(uploadedData !== null || results !== null) && (
          <button
            onClick={reset}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-gray-50 hover:text-text-primary"
          >
            <RotateCcw className="h-4 w-4" />
            Start Over
          </button>
        )}
      </div>

      {/* Step Navigation */}
      <div className="mb-8">
        <StepNavigation />
      </div>

      {/* Step Content */}
      <div className="card">
        {currentStep === 'upload' && <UploadStep />}
        {currentStep === 'agent' && <AgentConnectStep />}
        {currentStep === 'metrics' && <MetricSelectStep />}
        {currentStep === 'run' && <RunStep />}
      </div>
    </div>
  );
}
