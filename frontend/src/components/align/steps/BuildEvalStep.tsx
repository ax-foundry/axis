'use client';

import {
  ArrowLeft,
  Play,
  Loader2,
  Bot,
  FileText,
  BookOpen,
  BarChart3,
  Table,
  Sparkles,
  Download,
  RefreshCw,
  Wand2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAlignEvaluate, useAlignStatus, useClusterPatterns } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useCalibrationStore } from '@/stores/calibration-store';

import { ComparisonTable } from '../analyze/ComparisonTable';
import { ConfusionMatrix } from '../analyze/ConfusionMatrix';
import { InsightsPanel } from '../analyze/InsightsPanel';
import { LearningInsightsPanel } from '../analyze/LearningInsightsPanel';
import { MetricsOverview } from '../analyze/MetricsOverview';
import { FewShotBuilder } from '../configure/FewShotBuilder';
import { ModelSelector } from '../configure/ModelSelector';
import { PromptEditor } from '../configure/PromptEditor';

import type { ClusteringMethod, LLMProvider } from '@/types';

type ConfigTab = 'model' | 'prompt' | 'examples';
type ResultsTab = 'comparison' | 'metrics' | 'insights';

export function BuildEvalStep() {
  const {
    data,
    humanAnnotations,
    judgeConfig,
    errorPatterns,
    setJudgeConfig,
    resetJudgeConfig,
    addFewShotExample,
    removeFewShotExample,
    updateFewShotExample,
    setCurrentStep,
    isEvaluating,
    evaluationProgress,
    evaluationError,
    evaluationResults,
    alignmentMetrics,
    analyzeFilter,
    setAnalyzeFilter,
    isClusteringPatterns,
    learningArtifacts,
    pipelineMetadata,
  } = useCalibrationStore();

  const { data: statusData } = useAlignStatus();
  const evaluateMutation = useAlignEvaluate();
  const clusterMutation = useClusterPatterns();

  const [activeConfigTab, setActiveConfigTab] = useState<ConfigTab>('prompt');
  const [activeResultsTab, setActiveResultsTab] = useState<ResultsTab>('comparison');
  const [clusteringMethod, setClusteringMethod] = useState<ClusteringMethod>('llm');
  const [expandedPatterns, setExpandedPatterns] = useState<Set<number>>(new Set());

  const togglePatternExpanded = (idx: number) => {
    setExpandedPatterns((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(idx)) {
        newSet.delete(idx);
      } else {
        newSet.add(idx);
      }
      return newSet;
    });
  };

  const configTabs: Array<{
    id: ConfigTab;
    label: string;
    icon: typeof Bot;
  }> = [
    { id: 'model', label: 'Model', icon: Bot },
    { id: 'prompt', label: 'Prompt', icon: FileText },
    { id: 'examples', label: 'Examples', icon: BookOpen },
  ];

  const resultsTabs: Array<{
    id: ResultsTab;
    label: string;
    icon: typeof Table;
  }> = [
    { id: 'comparison', label: 'Comparison', icon: Table },
    { id: 'metrics', label: 'Metrics', icon: BarChart3 },
    { id: 'insights', label: 'Insights', icon: Sparkles },
  ];

  const handleModelChange = (model: string, provider: LLMProvider) => {
    setJudgeConfig({ model, provider });
  };

  const handleRunEvaluation = () => {
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

  const handleUsePatternAsCriteria = (pattern: string) => {
    const currentCriteria = judgeConfig.evaluation_criteria;
    const newCriteria = currentCriteria
      ? `${currentCriteria}\n\n- ${pattern}: Pay special attention to this pattern identified in human annotations.`
      : `- ${pattern}: Pay special attention to this pattern identified in human annotations.`;
    setJudgeConfig({ evaluation_criteria: newCriteria });
  };

  const runClustering = (method: ClusteringMethod) => {
    clusterMutation.mutate({
      annotations: humanAnnotations,
      judgeConfig,
      method,
    });
  };

  const handleRefreshPatterns = () => {
    runClustering(clusteringMethod);
  };

  const handleMethodChange = (method: ClusteringMethod) => {
    setClusteringMethod(method);
    runClustering(method);
  };

  const annotationCount = Object.keys(humanAnnotations).length;
  const notesCount = Object.values(humanAnnotations).filter(
    (ann) => ann.notes && ann.notes.trim()
  ).length;
  const isProviderConfigured = statusData?.providers[judgeConfig.provider] ?? false;
  const hasResults = evaluationResults.length > 0 && alignmentMetrics !== null;

  const MIN_NOTES_FOR_BERTOPIC = 10;
  const needsMoreNotes = notesCount < MIN_NOTES_FOR_BERTOPIC;

  // Auto-switch to LLM if selected method requires more notes than available
  useEffect(() => {
    if (needsMoreNotes && (clusteringMethod === 'bertopic' || clusteringMethod === 'hybrid')) {
      setClusteringMethod('llm');
    }
  }, [needsMoreNotes, clusteringMethod]);

  return (
    <div className="space-y-5">
      {/* Section 1: Two-Column — Pattern Insights + LLM Config */}
      <div className="grid grid-cols-2 gap-5">
        {/* Left: Pattern Insights */}
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-bold text-text-primary">Pattern Insights</h2>
            <span className="text-xs text-text-muted">
              {errorPatterns.length} patterns &middot; {notesCount} notes
            </span>
          </div>
          <div className="p-4">
            {/* Clustering Method Pills */}
            <div className="mb-3.5 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Method
              </span>
              {(['llm', 'bertopic', 'hybrid'] as ClusteringMethod[]).map((method) => {
                const requiresMinNotes = method === 'bertopic' || method === 'hybrid';
                const isDisabled = isClusteringPatterns || (requiresMinNotes && needsMoreNotes);
                return (
                  <button
                    key={method}
                    onClick={() => handleMethodChange(method)}
                    disabled={isDisabled}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                      clusteringMethod === method
                        ? 'border-text-primary bg-text-primary text-white'
                        : 'border-border bg-white text-text-muted hover:border-text-muted hover:text-text-primary',
                      isDisabled && 'cursor-not-allowed opacity-50'
                    )}
                    title={
                      requiresMinNotes && needsMoreNotes
                        ? `Requires ${MIN_NOTES_FOR_BERTOPIC}+ notes (${notesCount} available)`
                        : undefined
                    }
                  >
                    {method === 'llm' ? 'LLM' : method === 'bertopic' ? 'BERTopic' : 'Hybrid'}
                  </button>
                );
              })}
              {notesCount > 0 && (
                <button
                  onClick={handleRefreshPatterns}
                  disabled={isClusteringPatterns}
                  className="ml-auto text-xs font-medium text-text-muted hover:text-text-primary disabled:opacity-50"
                >
                  {isClusteringPatterns ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Analyzing...
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <RefreshCw className="h-3 w-3" />
                      Refresh
                    </span>
                  )}
                </button>
              )}
            </div>
            {needsMoreNotes && (
              <p className="mb-3 text-xs text-text-muted">
                BERTopic/Hybrid require {MIN_NOTES_FOR_BERTOPIC}+ notes ({notesCount} available)
              </p>
            )}
            {clusterMutation.error && (
              <p className="mb-3 text-xs text-red-600">
                {clusterMutation.error instanceof Error
                  ? clusterMutation.error.message
                  : 'Clustering failed'}
              </p>
            )}

            {/* Pattern Cards */}
            {errorPatterns.length > 0 ? (
              <div className="space-y-3">
                {errorPatterns.map((pattern, idx) => {
                  const isExpanded = expandedPatterns.has(idx);
                  return (
                    <div key={idx} className="rounded-lg border border-border p-3.5">
                      <button
                        onClick={() => togglePatternExpanded(idx)}
                        className="flex w-full items-center gap-2 text-left"
                      >
                        <span className="text-[13px] font-bold text-text-primary">
                          {pattern.category}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-text-muted">
                          {pattern.count}
                        </span>
                        <span className="ml-auto text-xs text-text-muted">
                          {isExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </span>
                      </button>

                      {isExpanded && pattern.examples.length > 0 && (
                        <div className="mt-2.5 space-y-1.5">
                          {pattern.examples.map((example, exIdx) => (
                            <div
                              key={exIdx}
                              className="rounded-md border-l-[3px] border-l-border bg-gray-50 px-3 py-2.5 text-xs leading-relaxed text-text-secondary"
                            >
                              &ldquo;{example}&rdquo;
                            </div>
                          ))}
                        </div>
                      )}

                      {!isExpanded && pattern.examples.length > 0 && (
                        <p className="mt-1.5 truncate text-xs text-text-muted">
                          &ldquo;{pattern.examples[0]}&rdquo;
                        </p>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUsePatternAsCriteria(pattern.category);
                        }}
                        className="mt-2.5 flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-dark"
                      >
                        <Wand2 className="h-3 w-3" />
                        Use as criteria &rarr;
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : notesCount > 0 ? (
              <div className="flex items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-gray-50 p-6">
                <div className="text-center">
                  <p className="mb-2 text-sm text-text-muted">
                    {notesCount} annotations with notes ready for analysis
                  </p>
                  <button
                    onClick={handleRefreshPatterns}
                    disabled={isClusteringPatterns}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                  >
                    {isClusteringPatterns ? 'Analyzing...' : 'Discover Patterns'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-gray-50 p-6 text-center">
                <Sparkles className="mx-auto mb-2 h-8 w-8 text-text-muted" />
                <p className="text-sm text-text-muted">
                  Add notes during review to discover patterns that inform your evaluation criteria.
                </p>
              </div>
            )}

            {/* Summary Stats */}
            <div className="mt-3 flex gap-4 border-t border-border pt-3 text-xs text-text-muted">
              <span>
                Annotations:{' '}
                <strong className="font-semibold text-text-primary">{annotationCount}</strong>
              </span>
              <span>
                With Notes:{' '}
                <strong className="font-semibold text-text-primary">{notesCount}</strong>
              </span>
              <span>
                Patterns:{' '}
                <strong className="font-semibold text-text-primary">{errorPatterns.length}</strong>
              </span>
            </div>

            {/* Learning Insights (shown when learnings exist) */}
            {learningArtifacts.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <LearningInsightsPanel learnings={learningArtifacts} metadata={pipelineMetadata} />
              </div>
            )}
          </div>
        </div>

        {/* Right: LLM Judge Configuration */}
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-bold text-text-primary">LLM Judge Configuration</h2>
          </div>

          {/* Config Tab Navigation — tab-style with border-b-2 */}
          <div className="flex border-b border-border">
            {configTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveConfigTab(tab.id)}
                className={cn(
                  '-mb-px px-4 py-2.5 text-sm font-medium transition-colors',
                  activeConfigTab === tab.id
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-text-muted hover:text-text-primary'
                )}
              >
                {tab.label}
                {tab.id === 'examples' && judgeConfig.few_shot_examples.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-semibold">
                    {judgeConfig.few_shot_examples.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Config Tab Content */}
          <div className="p-4">
            {activeConfigTab === 'model' && (
              <ModelSelector
                selectedModel={judgeConfig.model}
                selectedProvider={judgeConfig.provider}
                onModelChange={handleModelChange}
              />
            )}

            {activeConfigTab === 'prompt' && (
              <PromptEditor
                systemPrompt={judgeConfig.system_prompt}
                evaluationCriteria={judgeConfig.evaluation_criteria}
                onSystemPromptChange={(value) => setJudgeConfig({ system_prompt: value })}
                onEvaluationCriteriaChange={(value) =>
                  setJudgeConfig({ evaluation_criteria: value })
                }
                onReset={resetJudgeConfig}
              />
            )}

            {activeConfigTab === 'examples' && (
              <FewShotBuilder
                examples={judgeConfig.few_shot_examples}
                onAddExample={addFewShotExample}
                onRemoveExample={removeFewShotExample}
                onUpdateExample={updateFewShotExample}
              />
            )}
          </div>
        </div>
      </div>

      {/* Section 2: Run Evaluation */}
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-bold text-text-primary">Run Evaluation</h3>
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Ready
          </div>
        </div>
        <div className="flex items-center justify-between p-4">
          <div className="flex gap-3">
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-gray-50 px-3 py-1.5 text-xs text-text-muted">
              Model:{' '}
              <strong className="font-semibold text-text-primary">{judgeConfig.model}</strong>
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-gray-50 px-3 py-1.5 text-xs text-text-muted">
              Records:{' '}
              <strong className="font-semibold text-text-primary">{annotationCount}</strong>
            </div>
            {judgeConfig.few_shot_examples.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-gray-50 px-3 py-1.5 text-xs text-text-muted">
                Few-shot:{' '}
                <strong className="font-semibold text-text-primary">
                  {judgeConfig.few_shot_examples.length} examples
                </strong>
              </div>
            )}
          </div>
          <button
            onClick={handleRunEvaluation}
            disabled={isEvaluating || !isProviderConfigured || annotationCount === 0}
            className="flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-semibold text-white transition-all hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEvaluating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run Evaluation
              </>
            )}
          </button>
        </div>
      </div>

      {/* Evaluation Progress */}
      {isEvaluating && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-text-primary">Running Evaluation...</p>
              <p className="text-xs text-text-muted">
                Evaluating {annotationCount} records with {judgeConfig.model}
              </p>
            </div>
            <span className="text-sm font-medium text-primary">{evaluationProgress}%</span>
          </div>
          <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${evaluationProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Display */}
      {evaluationError && (
        <div className="border-error/20 bg-error/10 rounded-lg border p-4">
          <p className="font-medium text-error">Evaluation Error</p>
          <p className="text-error/80 mt-1 text-sm">{evaluationError}</p>
        </div>
      )}

      {/* Section 3: Results */}
      {hasResults && (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          {/* Results header with export */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-bold text-text-primary">Evaluation Results</h3>
            <button
              onClick={handleExportResults}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-text-muted transition-colors hover:border-text-muted hover:text-text-primary"
            >
              <Download className="h-3 w-3" />
              Export
            </button>
          </div>

          {/* Results Tab Navigation — tab-style with border-b-2 */}
          <div className="flex border-b border-border px-4">
            {resultsTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveResultsTab(tab.id)}
                className={cn(
                  '-mb-px px-4 py-2.5 text-sm font-medium transition-colors',
                  activeResultsTab === tab.id
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-text-muted hover:text-text-primary'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Results Tab Content */}
          <div className="p-4">
            {activeResultsTab === 'metrics' && alignmentMetrics && (
              <div className="space-y-6">
                <MetricsOverview metrics={alignmentMetrics} />
                <div className="border-t border-border pt-6">
                  <ConfusionMatrix metrics={alignmentMetrics} />
                </div>
              </div>
            )}

            {activeResultsTab === 'comparison' && (
              <ComparisonTable
                results={evaluationResults}
                filter={analyzeFilter}
                onFilterChange={setAnalyzeFilter}
              />
            )}

            {activeResultsTab === 'insights' && <InsightsPanel />}
          </div>
        </div>
      )}

      {/* Footer Navigation */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <button
          onClick={() => setCurrentStep('review')}
          disabled={isEvaluating}
          className="flex items-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:border-text-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Review & Label
        </button>

        {hasResults && (
          <button
            onClick={handleRunEvaluation}
            disabled={isEvaluating}
            className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Re-run Evaluation
          </button>
        )}
      </div>
    </div>
  );
}
