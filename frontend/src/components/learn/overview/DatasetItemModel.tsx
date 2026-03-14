'use client';

import { Database, MessageSquare, FileText, BarChart3, FileCheck } from 'lucide-react';

interface FieldInfo {
  name: string;
  type: string;
  required: boolean;
  description: string;
  example?: string;
}

const datasetFields: FieldInfo[] = [
  {
    name: 'id',
    type: 'string',
    required: true,
    description: 'Unique identifier for the test case',
    example: '"test_001"',
  },
  {
    name: 'query',
    type: 'string',
    required: true,
    description: 'The input query or prompt given to the AI',
    example: '"What is the capital of France?"',
  },
  {
    name: 'actual_output',
    type: 'string',
    required: true,
    description: 'The AI-generated response to evaluate',
    example: '"The capital of France is Paris."',
  },
  {
    name: 'expected_output',
    type: 'string',
    required: false,
    description: 'Reference answer for comparison (ground truth)',
    example: '"Paris is the capital city of France."',
  },
  {
    name: 'conversation',
    type: 'array',
    required: false,
    description: 'Multi-turn conversation history',
    example: '[{role: "user", content: "..."}, ...]',
  },
  {
    name: 'retrieved_content',
    type: 'string',
    required: false,
    description: 'Context retrieved for RAG evaluation',
    example: '"Paris is a city in France..."',
  },
  {
    name: 'metadata',
    type: 'object',
    required: false,
    description: 'Additional metadata for filtering/grouping',
    example: '{category: "geography", difficulty: "easy"}',
  },
];

const FIELD_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  id: { icon: Database, color: 'text-gray-500' },
  query: { icon: MessageSquare, color: 'text-blue-500' },
  actual_output: { icon: FileText, color: 'text-green-500' },
  expected_output: { icon: FileCheck, color: 'text-purple-500' },
  conversation: { icon: MessageSquare, color: 'text-orange-500' },
  retrieved_content: { icon: FileText, color: 'text-cyan-500' },
  metadata: { icon: BarChart3, color: 'text-indigo-500' },
};

export function DatasetItemModel() {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50">
          <Database className="h-[18px] w-[18px] text-blue-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text-primary">DatasetItem Structure</h3>
          <p className="text-xs text-text-muted">
            Understanding the data structure that powers evaluation
          </p>
        </div>
      </div>

      {/* Visual Schema Representation */}
      <div className="mb-4 rounded-lg border border-border bg-gray-50 dark:bg-gray-900 p-4">
        <div className="font-mono text-xs">
          <div className="mb-2 text-text-muted">{`// Evaluation Data Structure`}</div>
          <div className="text-purple-600">interface</div>{' '}
          <span className="text-blue-600">DatasetItem</span> {'{'}
          <div className="ml-4 mt-2 space-y-1">
            {datasetFields.map((field) => (
              <div key={field.name} className="flex items-center gap-2">
                <span className="text-text-primary">{field.name}</span>
                <span className="text-text-muted">:</span>
                <span className="text-green-600">{field.type}</span>
                {!field.required && <span className="text-text-muted">?</span>}
                <span className="text-text-muted">;</span>
                {field.required && (
                  <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                    required
                  </span>
                )}
              </div>
            ))}
          </div>
          {'}'}
        </div>
      </div>

      {/* Field Details */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {datasetFields.map((field) => {
          const fi = FIELD_ICONS[field.name];
          const FieldIcon = fi?.icon ?? Database;
          const iconColor = fi?.color ?? 'text-gray-500';

          return (
            <div
              key={field.name}
              className={`rounded-lg border p-3 ${
                field.required ? 'border-primary/20 bg-primary/5' : 'border-border bg-gray-50 dark:bg-gray-900'
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <FieldIcon className={`h-3.5 w-3.5 ${iconColor}`} />
                <code className="text-xs font-semibold text-text-primary">{field.name}</code>
                <span className="text-[10px] text-text-muted">({field.type})</span>
              </div>
              <p className="text-xs text-text-muted">{field.description}</p>
              {field.example && (
                <code className="mt-1 block text-[10px] text-primary-dark">{field.example}</code>
              )}
            </div>
          );
        })}
      </div>

      {/* Usage Note */}
      <div className="mt-4 rounded-lg border border-accent-gold/20 bg-accent-gold/5 px-4 py-3">
        <p className="text-xs text-text-secondary">
          <strong>Tip:</strong> At minimum, you need{' '}
          <code className="rounded bg-surface px-1">id</code>,{' '}
          <code className="rounded bg-surface px-1">query</code>, and{' '}
          <code className="rounded bg-surface px-1">actual_output</code> fields. Add optional fields
          based on your evaluation type (e.g.,{' '}
          <code className="rounded bg-surface px-1">expected_output</code> for comparison-based
          evaluation).
        </p>
      </div>
    </div>
  );
}
