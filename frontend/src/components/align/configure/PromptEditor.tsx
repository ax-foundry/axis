'use client';

import { FileText, RotateCcw, Info } from 'lucide-react';

import { DEFAULT_SYSTEM_PROMPT, DEFAULT_EVALUATION_CRITERIA } from '@/stores/calibration-store';

interface PromptEditorProps {
  systemPrompt: string;
  evaluationCriteria: string;
  onSystemPromptChange: (value: string) => void;
  onEvaluationCriteriaChange: (value: string) => void;
  onReset: () => void;
}

export function PromptEditor({
  systemPrompt,
  evaluationCriteria,
  onSystemPromptChange,
  onEvaluationCriteriaChange,
  onReset,
}: PromptEditorProps) {
  const isDefault =
    systemPrompt === DEFAULT_SYSTEM_PROMPT && evaluationCriteria === DEFAULT_EVALUATION_CRITERIA;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h3 className="font-medium text-text-primary">Prompt Configuration</h3>
        </div>
        {!isDefault && (
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to Default
          </button>
        )}
      </div>

      {/* Info Banner */}
      <div className="rounded-lg border border-primary/20 bg-primary-pale/30 p-4">
        <div className="flex gap-3">
          <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
          <div className="text-sm text-text-secondary">
            <p>
              The system prompt defines how the LLM judge evaluates responses. Use{' '}
              <code className="rounded bg-white px-1 py-0.5 font-mono text-xs">
                {'{evaluation_criteria}'}
              </code>{' '}
              as a placeholder for your evaluation criteria.
            </p>
          </div>
        </div>
      </div>

      {/* System Prompt */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-secondary">System Prompt</label>
        <textarea
          value={systemPrompt}
          onChange={(e) => onSystemPromptChange(e.target.value)}
          rows={12}
          className="w-full rounded-lg border border-border bg-white p-4 font-mono text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Enter the system prompt for the judge..."
        />
      </div>

      {/* Evaluation Criteria */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-secondary">Evaluation Criteria</label>
        <p className="text-xs text-text-muted">
          Define the specific criteria the judge should use to evaluate responses
        </p>
        <textarea
          value={evaluationCriteria}
          onChange={(e) => onEvaluationCriteriaChange(e.target.value)}
          rows={8}
          className="w-full rounded-lg border border-border bg-white p-4 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Define evaluation criteria..."
        />
      </div>

      {/* Temperature */}
      <div className="rounded-lg border border-border bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-text-primary">Temperature</label>
            <p className="text-xs text-text-muted">
              Set to 0 for consistent, deterministic evaluations
            </p>
          </div>
          <div className="text-sm font-medium text-primary">0</div>
        </div>
      </div>
    </div>
  );
}
