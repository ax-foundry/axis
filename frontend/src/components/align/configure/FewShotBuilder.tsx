'use client';

import { BookOpen, Plus, Sparkles, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { useAlignSuggestExamples } from '@/lib/hooks';
import { useCalibrationStore } from '@/stores/calibration-store';

import { FewShotExampleCard } from './FewShotExampleCard';
import { BinaryScoreSelector } from '../annotation/BinaryScoreSelector';

import type { FewShotExample, ExampleSelectionStrategy } from '@/types';

interface FewShotBuilderProps {
  examples: FewShotExample[];
  onAddExample: (example: FewShotExample) => void;
  onRemoveExample: (index: number) => void;
  onUpdateExample: (index: number, example: FewShotExample) => void;
}

export function FewShotBuilder({ examples, onAddExample, onRemoveExample }: FewShotBuilderProps) {
  const { data, humanAnnotations } = useCalibrationStore();
  const suggestMutation = useAlignSuggestExamples();

  const [isAdding, setIsAdding] = useState(false);
  const [newExample, setNewExample] = useState<Partial<FewShotExample>>({
    query: '',
    actual_output: '',
    score: 1,
    reasoning: '',
  });

  const strategies: Array<{
    id: ExampleSelectionStrategy;
    label: string;
    description: string;
  }> = [
    { id: 'diverse', label: 'Diverse', description: 'Maximum variety' },
    { id: 'representative', label: 'Balanced', description: 'Equal accept/reject' },
    { id: 'edge_cases', label: 'Edge Cases', description: 'Difficult cases' },
  ];

  const handleSuggestExamples = async (strategy: ExampleSelectionStrategy) => {
    // Convert AnnotationWithNotes to simple scores for API
    const annotationsForApi: Record<string, number> = {};
    for (const [id, ann] of Object.entries(humanAnnotations)) {
      annotationsForApi[id] = ann.score;
    }

    suggestMutation.mutate(
      {
        records: data,
        humanAnnotations: annotationsForApi,
        strategy,
        count: 4,
      },
      {
        onSuccess: (response) => {
          if (response.success && response.examples) {
            response.examples.forEach((example) => {
              onAddExample(example);
            });
          }
        },
      }
    );
  };

  const handleAddManualExample = () => {
    if (
      newExample.query &&
      newExample.actual_output &&
      newExample.reasoning &&
      newExample.score !== undefined
    ) {
      onAddExample({
        query: newExample.query,
        actual_output: newExample.actual_output,
        expected_output: newExample.expected_output,
        score: newExample.score as 0 | 1,
        reasoning: newExample.reasoning,
      });
      setNewExample({
        query: '',
        actual_output: '',
        score: 1,
        reasoning: '',
      });
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h3 className="font-medium text-text-primary">Few-Shot Examples ({examples.length})</h3>
        </div>
      </div>

      {/* Auto-suggest Section */}
      {Object.keys(humanAnnotations).length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary-pale/30 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-text-primary">
              Auto-suggest from annotations
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {strategies.map((strategy) => (
              <button
                key={strategy.id}
                onClick={() => handleSuggestExamples(strategy.id)}
                disabled={suggestMutation.isPending}
                className="flex items-center gap-2 rounded-lg border border-primary/30 bg-white px-3 py-2 text-sm font-medium text-primary transition-all hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {suggestMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span>{strategy.label}</span>
                <span className="text-xs opacity-70">({strategy.description})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual Add Form */}
      {isAdding ? (
        <div className="rounded-lg border border-border bg-white p-4">
          <h4 className="mb-4 font-medium text-text-primary">Add New Example</h4>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Query</label>
              <textarea
                value={newExample.query}
                onChange={(e) => setNewExample({ ...newExample, query: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-border p-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Enter the user query..."
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Response</label>
              <textarea
                value={newExample.actual_output}
                onChange={(e) => setNewExample({ ...newExample, actual_output: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-border p-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Enter the AI response..."
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-text-secondary">Score</label>
              <BinaryScoreSelector
                value={newExample.score as 0 | 1 | undefined}
                onChange={(score) => setNewExample({ ...newExample, score })}
                size="sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                Reasoning
              </label>
              <textarea
                value={newExample.reasoning}
                onChange={(e) => setNewExample({ ...newExample, reasoning: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-border p-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Explain why this is accepted or rejected..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsAdding(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-text-muted hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAddManualExample}
                disabled={!newExample.query || !newExample.actual_output || !newExample.reasoning}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add Example
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-4 text-text-muted transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Plus className="h-5 w-5" />
          Add Manual Example
        </button>
      )}

      {/* Examples List */}
      {examples.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {examples.map((example, index) => (
            <FewShotExampleCard
              key={index}
              example={example}
              index={index}
              onDelete={onRemoveExample}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-gray-50 py-8 text-center">
          <BookOpen className="mx-auto mb-2 h-8 w-8 text-text-muted" />
          <p className="text-text-muted">No few-shot examples added yet</p>
          <p className="mt-1 text-sm text-text-muted">Add examples to improve judge consistency</p>
        </div>
      )}
    </div>
  );
}
