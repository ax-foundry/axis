'use client';

import { ArrowLeft, Play, Loader2, Bot, FileText, BookOpen } from 'lucide-react';
import { useState } from 'react';

import { useAlignEvaluate, useAlignStatus } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useCalibrationStore } from '@/stores/calibration-store';

import { FewShotBuilder } from '../configure/FewShotBuilder';
import { ModelSelector } from '../configure/ModelSelector';
import { PromptEditor } from '../configure/PromptEditor';

import type { LLMProvider } from '@/types';

type ConfigTab = 'model' | 'prompt' | 'examples' | 'settings';

export function ConfigureStep() {
  const {
    data,
    humanAnnotations,
    judgeConfig,
    setJudgeConfig,
    resetJudgeConfig,
    addFewShotExample,
    removeFewShotExample,
    updateFewShotExample,
    setCurrentStep,
    isEvaluating,
    evaluationProgress,
    evaluationError,
  } = useCalibrationStore();

  const { data: statusData } = useAlignStatus();
  const evaluateMutation = useAlignEvaluate();

  const [activeTab, setActiveTab] = useState<ConfigTab>('model');

  const tabs: Array<{
    id: ConfigTab;
    label: string;
    icon: typeof Bot;
  }> = [
    { id: 'model', label: 'Model', icon: Bot },
    { id: 'prompt', label: 'Prompt', icon: FileText },
    { id: 'examples', label: 'Examples', icon: BookOpen },
  ];

  const handleModelChange = (model: string, provider: LLMProvider) => {
    setJudgeConfig({ model, provider });
  };

  const handleRunEvaluation = () => {
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

  const annotationCount = Object.keys(humanAnnotations).length;
  const isProviderConfigured = statusData?.providers[judgeConfig.provider] ?? false;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-xl font-semibold text-text-primary">Configure LLM Judge</h2>
        <p className="text-text-muted">
          Set up the LLM that will evaluate responses. Configure the model, prompt, and few-shot
          examples.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-border pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-muted hover:bg-gray-100 hover:text-text-primary'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {tab.id === 'examples' && judgeConfig.few_shot_examples.length > 0 && (
                <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-xs">
                  {judgeConfig.few_shot_examples.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="rounded-lg border border-border bg-white p-6">
        {activeTab === 'model' && (
          <ModelSelector
            selectedModel={judgeConfig.model}
            selectedProvider={judgeConfig.provider}
            onModelChange={handleModelChange}
          />
        )}

        {activeTab === 'prompt' && (
          <PromptEditor
            systemPrompt={judgeConfig.system_prompt}
            evaluationCriteria={judgeConfig.evaluation_criteria}
            onSystemPromptChange={(value) => setJudgeConfig({ system_prompt: value })}
            onEvaluationCriteriaChange={(value) => setJudgeConfig({ evaluation_criteria: value })}
            onReset={resetJudgeConfig}
          />
        )}

        {activeTab === 'examples' && (
          <FewShotBuilder
            examples={judgeConfig.few_shot_examples}
            onAddExample={addFewShotExample}
            onRemoveExample={removeFewShotExample}
            onUpdateExample={updateFewShotExample}
          />
        )}
      </div>

      {/* Evaluation Summary */}
      <div className="rounded-lg border border-border bg-gray-50 p-4">
        <h4 className="mb-3 font-medium text-text-primary">Evaluation Summary</h4>
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <div className="text-text-muted">Records</div>
            <div className="font-medium text-text-primary">{annotationCount}</div>
          </div>
          <div>
            <div className="text-text-muted">Model</div>
            <div className="font-medium text-text-primary">{judgeConfig.model}</div>
          </div>
          <div>
            <div className="text-text-muted">Provider</div>
            <div className="font-medium text-text-primary">
              {judgeConfig.provider === 'openai' ? 'OpenAI' : 'Anthropic'}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Examples</div>
            <div className="font-medium text-text-primary">
              {judgeConfig.few_shot_examples.length}
            </div>
          </div>
        </div>
      </div>

      {/* Evaluation Progress */}
      {isEvaluating && (
        <div className="rounded-lg border border-primary/30 bg-gradient-to-r from-primary/10 to-primary-soft/10 p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-text-primary">Running Evaluation...</p>
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

      {/* Error Display */}
      {evaluationError && (
        <div className="border-error/20 bg-error/10 rounded-lg border p-4">
          <p className="font-medium text-error">Evaluation Error</p>
          <p className="text-error/80 mt-1 text-sm">{evaluationError}</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-border pt-6">
        <button
          onClick={() => setCurrentStep('review')}
          className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 font-medium text-text-secondary transition-colors hover:bg-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Annotate
        </button>

        <button
          onClick={handleRunEvaluation}
          disabled={isEvaluating || !isProviderConfigured || annotationCount === 0}
          className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 font-medium text-white transition-all hover:bg-primary-dark hover:shadow-lg hover:shadow-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isEvaluating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running Evaluation...
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
  );
}
