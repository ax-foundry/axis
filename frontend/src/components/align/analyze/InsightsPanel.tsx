'use client';

import {
  Sparkles,
  Loader2,
  Lightbulb,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import { useState } from 'react';

import { useAlignAnalyzeMisalignment, useAlignOptimizePrompt } from '@/lib/hooks';
import { useCalibrationStore } from '@/stores/calibration-store';

import { LearningInsightsPanel } from './LearningInsightsPanel';

export function InsightsPanel() {
  const {
    evaluationResults,
    judgeConfig,
    misalignmentAnalysis,
    optimizedPrompt,
    isAnalyzing,
    applyOptimizedPrompt,
    setCurrentStep,
    learningArtifacts,
    pipelineMetadata,
  } = useCalibrationStore();

  const analyzeMutation = useAlignAnalyzeMisalignment();
  const optimizeMutation = useAlignOptimizePrompt();

  const [showOptimizedPrompt, setShowOptimizedPrompt] = useState(false);

  const handleAnalyze = () => {
    analyzeMutation.mutate({
      results: evaluationResults,
      judgeConfig,
    });
  };

  const handleOptimize = () => {
    optimizeMutation.mutate({
      results: evaluationResults,
      currentConfig: judgeConfig,
    });
  };

  const handleApplyAndRerun = () => {
    applyOptimizedPrompt();
    setCurrentStep('build');
  };

  const misalignedCount = evaluationResults.filter((r) => !r.is_aligned).length;

  return (
    <div className="space-y-6">
      {/* Learning Insights (from EvidencePipeline) */}
      {learningArtifacts.length > 0 && (
        <div className="rounded-lg border border-border bg-white p-6">
          <LearningInsightsPanel learnings={learningArtifacts} metadata={pipelineMetadata} />
        </div>
      )}

      {/* Analysis Section */}
      <div className="rounded-lg border border-border bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h4 className="font-medium text-text-primary">Misalignment Analysis</h4>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || misalignedCount === 0}
            className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Analyze Patterns
              </>
            )}
          </button>
        </div>

        {misalignedCount === 0 ? (
          <div className="bg-success/10 flex items-center gap-3 rounded-lg p-4">
            <CheckCircle className="h-6 w-6 text-success" />
            <div>
              <div className="font-medium text-success">Perfect Alignment</div>
              <div className="text-sm text-text-muted">
                All LLM judgments match human annotations.
              </div>
            </div>
          </div>
        ) : misalignmentAnalysis ? (
          <div className="space-y-4">
            {/* Summary */}
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="mb-2 text-sm font-medium text-text-primary">Summary</div>
              <p className="text-sm text-text-secondary">{misalignmentAnalysis.summary}</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border border-border p-3 text-center">
                <div className="text-2xl font-bold text-text-primary">
                  {misalignmentAnalysis.total_misaligned}
                </div>
                <div className="text-xs text-text-muted">Total Misaligned</div>
              </div>
              <div className="border-warning/30 bg-warning/5 rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold text-warning">
                  {misalignmentAnalysis.false_positives}
                </div>
                <div className="text-xs text-text-muted">Too Lenient</div>
              </div>
              <div className="border-error/30 bg-error/5 rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold text-error">
                  {misalignmentAnalysis.false_negatives}
                </div>
                <div className="text-xs text-text-muted">Too Strict</div>
              </div>
            </div>

            {/* Recommendations */}
            {misalignmentAnalysis.recommendations.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-primary">
                  <Lightbulb className="h-4 w-4 text-accent-gold" />
                  Recommendations
                </div>
                <ul className="space-y-2">
                  {misalignmentAnalysis.recommendations.map((rec, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-lg bg-accent-gold/5 p-3 text-sm text-text-secondary"
                    >
                      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent-gold/20 text-xs font-medium text-accent-gold">
                        {i + 1}
                      </span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center">
            <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-text-muted" />
            <p className="text-text-muted">
              {misalignedCount} misaligned cases found. Click &quot;Analyze Patterns&quot; to get
              insights.
            </p>
          </div>
        )}
      </div>

      {/* Optimization Section */}
      <div className="rounded-lg border border-border bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent-gold" />
            <h4 className="font-medium text-text-primary">Prompt Optimization</h4>
          </div>
          <button
            onClick={handleOptimize}
            disabled={isAnalyzing || misalignedCount === 0}
            className="flex items-center gap-2 rounded-lg bg-accent-gold/10 px-3 py-1.5 text-sm font-medium text-accent-gold transition-colors hover:bg-accent-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Optimizing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Optimized Prompt
              </>
            )}
          </button>
        </div>

        {optimizedPrompt ? (
          <div className="space-y-4">
            {/* Suggestions */}
            <div>
              <div className="mb-2 text-sm font-medium text-text-primary">
                Improvement Suggestions
              </div>
              <div className="space-y-2">
                {optimizedPrompt.suggestions.map((suggestion, i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <div className="mb-1 text-sm font-medium text-primary">{suggestion.aspect}</div>
                    <p className="text-sm text-text-secondary">{suggestion.suggestion}</p>
                    <p className="mt-1 text-xs italic text-text-muted">{suggestion.rationale}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Expected Improvement */}
            <div className="bg-success/10 rounded-lg p-3">
              <div className="text-sm font-medium text-success">Expected Improvement</div>
              <p className="mt-1 text-sm text-text-secondary">
                {optimizedPrompt.expected_improvement}
              </p>
            </div>

            {/* View/Apply Optimized Prompt */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowOptimizedPrompt(!showOptimizedPrompt)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-gray-50"
              >
                {showOptimizedPrompt ? 'Hide' : 'View'} Optimized Criteria
              </button>
              <button
                onClick={handleApplyAndRerun}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
              >
                Apply & Re-run
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {showOptimizedPrompt && (
              <div className="rounded-lg border border-border bg-gray-50 p-4">
                <div className="mb-2 text-sm font-medium text-text-primary">
                  Optimized Evaluation Criteria
                </div>
                <pre className="whitespace-pre-wrap text-sm text-text-secondary">
                  {optimizedPrompt.evaluation_criteria}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center">
            <Sparkles className="mx-auto mb-2 h-8 w-8 text-text-muted" />
            <p className="text-text-muted">
              Generate an AI-optimized prompt based on misalignment patterns.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
