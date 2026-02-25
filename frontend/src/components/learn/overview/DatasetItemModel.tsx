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

export function DatasetItemModel() {
  return (
    <div className="card">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100">
          <Database className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h3 className="mb-1 text-lg font-semibold text-text-primary">DatasetItem Structure</h3>
          <p className="text-text-muted">Understanding the data structure that powers evaluation</p>
        </div>
      </div>

      {/* Visual Schema Representation */}
      <div className="mb-6 rounded-xl border border-border bg-gray-50 p-4">
        <div className="font-mono text-sm">
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
                  <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {datasetFields.map((field) => (
          <div
            key={field.name}
            className={`rounded-lg border p-3 ${
              field.required ? 'border-primary/20 bg-primary-pale/30' : 'border-border bg-gray-50'
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              {field.name === 'query' && <MessageSquare className="h-4 w-4 text-blue-500" />}
              {field.name === 'actual_output' && <FileText className="h-4 w-4 text-green-500" />}
              {field.name === 'expected_output' && (
                <FileCheck className="h-4 w-4 text-purple-500" />
              )}
              {field.name === 'id' && <Database className="h-4 w-4 text-gray-500" />}
              {field.name === 'conversation' && (
                <MessageSquare className="h-4 w-4 text-orange-500" />
              )}
              {field.name === 'retrieved_content' && <FileText className="h-4 w-4 text-cyan-500" />}
              {field.name === 'metadata' && <BarChart3 className="h-4 w-4 text-indigo-500" />}
              <code className="font-semibold text-text-primary">{field.name}</code>
              <span className="text-xs text-text-muted">({field.type})</span>
            </div>
            <p className="text-sm text-text-muted">{field.description}</p>
            {field.example && (
              <code className="mt-1 block text-xs text-primary-dark">{field.example}</code>
            )}
          </div>
        ))}
      </div>

      {/* Usage Note */}
      <div className="mt-6 rounded-lg border border-accent-gold/20 bg-accent-gold/10 p-4">
        <p className="text-sm text-text-secondary">
          <strong>Tip:</strong> At minimum, you need{' '}
          <code className="rounded bg-white px-1">id</code>,{' '}
          <code className="rounded bg-white px-1">query</code>, and{' '}
          <code className="rounded bg-white px-1">actual_output</code> fields. Add optional fields
          based on your evaluation type (e.g.,{' '}
          <code className="rounded bg-white px-1">expected_output</code> for comparison-based
          evaluation).
        </p>
      </div>
    </div>
  );
}
