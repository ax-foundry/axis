'use client';

import { CheckCircle2, Loader2, X } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { DatasetPushControls } from '@/components/agent-replay/DatasetPushControls';
import { FailureStepSelector, flattenTree } from '@/components/agent-replay/FailureStepSelector';
import { VerdictSelector } from '@/components/agent-replay/VerdictSelector';
import { useTraceReviews, useDatasets, useSaveReview } from '@/lib/hooks/useReplayData';
import { cn } from '@/lib/utils';
import { useReplayStore } from '@/stores/replay-store';

import type { ObservationNodeData, ReviewVerdict } from '@/types/replay';

interface ReviewPanelProps {
  traceId: string;
  agent: string | null;
  traceName: string | null;
  tree: ObservationNodeData[];
  traceInput: unknown;
}

export function ReviewPanel({ traceId, agent, traceName, tree, traceInput }: ReviewPanelProps) {
  const {
    reviewVerdict,
    reviewFailureNodeId,
    reviewToolingNeeds,
    reviewRationale,
    reviewExpectedOutput,
    reviewAddToDataset,
    reviewDatasetName,
    setReviewVerdict,
    setReviewFailureNodeId,
    setReviewToolingNeeds,
    setReviewRationale,
    setReviewExpectedOutput,
    setReviewAddToDataset,
    setReviewDatasetName,
    resetReviewForm,
    toggleReviewPanel,
  } = useReplayStore();

  const { data: existingReviews } = useTraceReviews(traceId, agent);
  const { data: datasetsData } = useDatasets(agent);
  const {
    mutate: saveReview,
    isPending,
    isSuccess,
    isError,
    error,
    reset: resetMutation,
  } = useSaveReview();

  // Effective agent name: prefer selected agent, fall back to trace name
  const effectiveAgent = agent ?? traceName;

  const defaultDatasetName = useMemo(() => {
    if (!reviewFailureNodeId) {
      const prefix = effectiveAgent || 'default';
      const month = new Date().toISOString().slice(0, 7);
      return `${prefix}-golden-${month}`;
    }
    const flat = flattenTree(tree);
    return flat.find((n) => n.id === reviewFailureNodeId)?.name ?? 'unknown';
  }, [effectiveAgent, reviewFailureNodeId, tree]);

  // Find name for the selected failure node
  const failureNodeName = useMemo(() => {
    if (!reviewFailureNodeId) return null;
    const flat = flattenTree(tree);
    return flat.find((n) => n.id === reviewFailureNodeId)?.name ?? null;
  }, [tree, reviewFailureNodeId]);

  const canSave = reviewVerdict !== null && !isPending;

  const handleSave = useCallback(() => {
    if (!reviewVerdict) return;
    resetMutation();
    saveReview(
      {
        trace_id: traceId,
        agent,
        agent_label: effectiveAgent,
        verdict: reviewVerdict,
        failure_observation_id: reviewFailureNodeId,
        failure_observation_name: failureNodeName ?? undefined,
        tooling_needs: reviewToolingNeeds,
        rationale: reviewRationale,
        expected_output: reviewExpectedOutput,
        trace_input: traceInput ?? undefined,
        add_to_dataset: reviewAddToDataset,
        dataset_name: reviewAddToDataset ? reviewDatasetName || undefined : undefined,
      },
      {
        onSuccess: () => {
          // Keep panel open to show success, reset form after brief display
          setTimeout(() => {
            resetReviewForm();
            resetMutation();
          }, 2000);
        },
      }
    );
  }, [
    traceId,
    agent,
    effectiveAgent,
    traceInput,
    reviewVerdict,
    reviewFailureNodeId,
    failureNodeName,
    reviewToolingNeeds,
    reviewRationale,
    reviewExpectedOutput,
    reviewAddToDataset,
    reviewDatasetName,
    saveReview,
    resetReviewForm,
    resetMutation,
  ]);

  const existingCount = existingReviews?.scores?.length ?? 0;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between bg-primary px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Review Trace</h2>
        <button
          onClick={toggleReviewPanel}
          className="rounded-md p-1 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {/* Existing reviews banner */}
        {existingCount > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
            <p className="text-xs font-medium text-blue-700">
              {existingCount} existing review score{existingCount !== 1 ? 's' : ''} on this trace
            </p>
          </div>
        )}

        {/* Success banner */}
        {isSuccess && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <p className="text-xs font-medium text-green-700">Review saved successfully</p>
          </div>
        )}

        {/* Error banner */}
        {isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs font-medium text-red-700">
              {error instanceof Error ? error.message : 'Failed to save review'}
            </p>
          </div>
        )}

        {/* Verdict */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-text-primary">
            Verdict <span className="text-red-400">*</span>
          </label>
          <VerdictSelector
            value={reviewVerdict}
            onChange={(v: ReviewVerdict) => setReviewVerdict(v)}
          />
        </div>

        {/* Failure step */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-text-primary">
            Failure Step <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <FailureStepSelector
            nodes={tree}
            value={reviewFailureNodeId}
            onChange={setReviewFailureNodeId}
          />
        </div>

        {/* Tooling Needs */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-text-primary">
            Tooling Needs
          </label>
          <textarea
            rows={3}
            maxLength={2000}
            value={reviewToolingNeeds}
            onChange={(e) => setReviewToolingNeeds(e.target.value)}
            placeholder="What would the agent need to arrive at the correct decision?"
            className="w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="mt-0.5 text-right text-[10px] text-text-muted">
            {reviewToolingNeeds.length}/2000
          </p>
        </div>

        {/* Rationale */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-text-primary">Rationale</label>
          <textarea
            rows={3}
            maxLength={2000}
            value={reviewRationale}
            onChange={(e) => setReviewRationale(e.target.value)}
            placeholder="Why did we approve or decline? Feedback loop back to the agent."
            className="w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="mt-0.5 text-right text-[10px] text-text-muted">
            {reviewRationale.length}/2000
          </p>
        </div>

        {/* Expected Output */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-text-primary">
            Expected Output
          </label>
          <textarea
            rows={3}
            maxLength={2000}
            value={reviewExpectedOutput}
            onChange={(e) => setReviewExpectedOutput(e.target.value)}
            placeholder="What should the correct answer be? Ground truth for eval."
            className="w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="mt-0.5 text-right text-[10px] text-text-muted">
            {reviewExpectedOutput.length}/2000
          </p>
        </div>

        {/* Dataset push */}
        <DatasetPushControls
          enabled={reviewAddToDataset}
          datasetName={reviewDatasetName}
          onToggle={setReviewAddToDataset}
          onDatasetNameChange={setReviewDatasetName}
          existingDatasets={datasetsData?.datasets ?? []}
          defaultName={defaultDatasetName}
        />
      </div>

      {/* Sticky footer */}
      <div className="border-t border-border px-4 py-3">
        <button
          onClick={handleSave}
          disabled={!canSave}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
            canSave
              ? 'bg-primary text-white hover:bg-primary-dark'
              : 'cursor-not-allowed bg-gray-100 text-gray-400'
          )}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Review'
          )}
        </button>
      </div>
    </div>
  );
}
