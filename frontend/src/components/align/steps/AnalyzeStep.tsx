'use client';

import {
  ArrowLeft,
  RefreshCw,
  BarChart3,
  Table,
  Sparkles,
  Download,
  Loader2,
  Play,
} from 'lucide-react';

import { useAlignEvaluate } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useCalibrationStore } from '@/stores/calibration-store';

import { ComparisonTable } from '../analyze/ComparisonTable';
import { ConfusionMatrix } from '../analyze/ConfusionMatrix';
import { InsightsPanel } from '../analyze/InsightsPanel';
import { MetricsOverview } from '../analyze/MetricsOverview';

type AnalyzeSubTab = 'metrics' | 'comparison' | 'insights';

export function AnalyzeStep() {
  const {
    data,
    humanAnnotations,
    judgeConfig,
    evaluationResults,
    alignmentMetrics,
    analyzeFilter,
    analyzeSubTab,
    isEvaluating,
    evaluationProgress,
    setAnalyzeFilter,
    setAnalyzeSubTab,
    setCurrentStep,
    clearEvaluationResults,
  } = useCalibrationStore();

  const evaluateMutation = useAlignEvaluate();

  const handleRerunEvaluation = () => {
    // Convert AnnotationWithNotes to simple scores for API
    const annotationsForApi: Record<string, number> = {};
    for (const [id, ann] of Object.entries(humanAnnotations)) {
      annotationsForApi[id] = ann.score;
    }

    evaluateMutation.mutate({
      records: data,
      humanAnnotations: annotationsForApi,
      judgeConfig,
    });
  };

  const tabs: Array<{
    id: AnalyzeSubTab;
    label: string;
    icon: typeof BarChart3;
  }> = [
    { id: 'comparison', label: 'Comparison', icon: Table },
    { id: 'metrics', label: 'Metrics', icon: BarChart3 },
    { id: 'insights', label: 'Insights', icon: Sparkles },
  ];

  const handleExportResults = () => {
    const exportData = evaluationResults.map((r) => ({
      record_id: r.record_id,
      query: r.query,
      actual_output: r.actual_output,
      human_score: r.human_score,
      llm_score: r.llm_score,
      is_aligned: r.is_aligned,
      llm_reasoning: r.llm_reasoning,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `align-results-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!alignmentMetrics) {
    return (
      <div className="py-12 text-center text-text-muted">
        No evaluation results yet. Run an evaluation first.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="mb-2 text-xl font-semibold text-text-primary">Alignment Analysis</h2>
          <p className="text-text-muted">
            Review how well the LLM judge aligns with your human annotations.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportResults}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Export Results
          </button>
        </div>
      </div>

      {/* Sub-Tab Navigation */}
      <div className="flex gap-2 border-b border-border pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setAnalyzeSubTab(tab.id)}
              className={cn(
                'flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-medium transition-colors',
                analyzeSubTab === tab.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-muted hover:bg-gray-100 hover:text-text-primary'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="rounded-lg border border-border bg-white p-6">
        {analyzeSubTab === 'metrics' && (
          <div className="space-y-8">
            <MetricsOverview metrics={alignmentMetrics} />
            <div className="border-t border-border pt-6">
              <ConfusionMatrix metrics={alignmentMetrics} />
            </div>
          </div>
        )}

        {analyzeSubTab === 'comparison' && (
          <ComparisonTable
            results={evaluationResults}
            filter={analyzeFilter}
            onFilterChange={setAnalyzeFilter}
          />
        )}

        {analyzeSubTab === 'insights' && <InsightsPanel />}
      </div>

      {/* Re-run Progress */}
      {isEvaluating && (
        <div className="rounded-lg border border-primary/30 bg-gradient-to-r from-primary/10 to-primary-soft/10 p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-text-primary">Re-running Evaluation...</p>
              <p className="text-sm text-text-muted">
                Evaluating {Object.keys(humanAnnotations).length} records with {judgeConfig.model}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-text-muted">Progress</span>
              <span className="font-medium text-primary">{evaluationProgress}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light transition-all duration-300"
                style={{ width: `${evaluationProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-border pt-6">
        <button
          onClick={() => setCurrentStep('build')}
          disabled={isEvaluating}
          className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 font-medium text-text-secondary transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Build
        </button>

        <div className="flex gap-3">
          <button
            onClick={() => {
              clearEvaluationResults();
              setCurrentStep('build');
            }}
            disabled={isEvaluating}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 font-medium text-text-secondary transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Modify Settings
          </button>
          <button
            onClick={handleRerunEvaluation}
            disabled={isEvaluating}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-white transition-all hover:bg-primary-dark hover:shadow-lg hover:shadow-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEvaluating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Re-run Evaluation
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
