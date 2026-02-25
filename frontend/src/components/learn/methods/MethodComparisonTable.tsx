'use client';

import { Check, X, Minus } from 'lucide-react';

interface ComparisonRow {
  attribute: string;
  description: string;
  values: Record<string, 'yes' | 'no' | 'partial'>;
}

const comparisonData: ComparisonRow[] = [
  {
    attribute: 'Scalable to large datasets',
    description: 'Can handle thousands of evaluations efficiently',
    values: {
      'llm-judge': 'yes',
      human: 'no',
      automated: 'yes',
      hybrid: 'partial',
    },
  },
  {
    attribute: 'Captures nuance',
    description: 'Can evaluate subtle quality differences',
    values: {
      'llm-judge': 'yes',
      human: 'yes',
      automated: 'no',
      hybrid: 'yes',
    },
  },
  {
    attribute: 'Consistent results',
    description: 'Same input produces same output',
    values: {
      'llm-judge': 'partial',
      human: 'no',
      automated: 'yes',
      hybrid: 'partial',
    },
  },
  {
    attribute: 'Low cost per evaluation',
    description: 'Affordable for large-scale use',
    values: {
      'llm-judge': 'partial',
      human: 'no',
      automated: 'yes',
      hybrid: 'partial',
    },
  },
  {
    attribute: 'No reference needed',
    description: 'Can evaluate without expected output',
    values: {
      'llm-judge': 'yes',
      human: 'yes',
      automated: 'no',
      hybrid: 'yes',
    },
  },
  {
    attribute: 'Explainable scores',
    description: 'Provides reasoning for scores',
    values: {
      'llm-judge': 'yes',
      human: 'yes',
      automated: 'no',
      hybrid: 'yes',
    },
  },
];

const methodHeaders = [
  { id: 'llm-judge', label: 'LLM Judge' },
  { id: 'human', label: 'Human' },
  { id: 'automated', label: 'Automated' },
  { id: 'hybrid', label: 'Hybrid' },
];

function ValueIcon({ value }: { value: 'yes' | 'no' | 'partial' }) {
  switch (value) {
    case 'yes':
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
          <Check className="h-4 w-4 text-green-600" />
        </div>
      );
    case 'no':
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100">
          <X className="h-4 w-4 text-red-600" />
        </div>
      );
    case 'partial':
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-yellow-100">
          <Minus className="h-4 w-4 text-yellow-600" />
        </div>
      );
  }
}

export function MethodComparisonTable() {
  return (
    <div className="card overflow-hidden">
      <h3 className="mb-4 text-lg font-semibold text-text-primary">Method Comparison</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">Attribute</th>
              {methodHeaders.map((header) => (
                <th
                  key={header.id}
                  className="px-4 py-3 text-center text-sm font-medium text-text-primary"
                >
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparisonData.map((row, idx) => (
              <tr key={row.attribute} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-text-primary">{row.attribute}</p>
                  <p className="text-xs text-text-muted">{row.description}</p>
                </td>
                {methodHeaders.map((header) => (
                  <td key={header.id} className="px-4 py-3 text-center">
                    <div className="flex justify-center">
                      <ValueIcon value={row.values[header.id]} />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-6 border-t border-border pt-4 text-sm text-text-muted">
        <div className="flex items-center gap-2">
          <ValueIcon value="yes" />
          <span>Supported</span>
        </div>
        <div className="flex items-center gap-2">
          <ValueIcon value="partial" />
          <span>Partial</span>
        </div>
        <div className="flex items-center gap-2">
          <ValueIcon value="no" />
          <span>Not supported</span>
        </div>
      </div>
    </div>
  );
}
