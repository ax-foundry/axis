'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

import type { EvaluationMethod } from '@/types';

interface MethodCardProps {
  method: EvaluationMethod;
}

const complexityColors = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
};

const scalabilityColors = {
  low: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-green-100 text-green-700',
};

export function MethodCard({ method }: MethodCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-white p-5 transition-shadow duration-200 hover:shadow-md">
      {/* Header */}
      <div
        className="flex cursor-pointer items-start justify-between gap-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{method.name}</h3>
          <p className="mt-1 text-xs text-text-muted">{method.description}</p>
          {/* Badges */}
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-medium ${complexityColors[method.complexity]}`}
            >
              {method.complexity.charAt(0).toUpperCase() + method.complexity.slice(1)} Complexity
            </span>
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-medium ${scalabilityColors[method.scalability]}`}
            >
              {method.scalability.charAt(0).toUpperCase() + method.scalability.slice(1)} Scalability
            </span>
          </div>
        </div>
        <button className="rounded p-1 hover:bg-gray-100">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-text-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-text-muted" />
          )}
        </button>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="animate-fade-in-up mt-4 border-t border-border pt-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {/* Pros */}
            <div className="rounded-lg border border-green-100 bg-green-50/50 p-3">
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-green-700">
                Advantages
              </h4>
              <ul className="space-y-1">
                {method.pros.map((pro, idx) => (
                  <li key={idx} className="flex items-start gap-1.5 text-xs text-green-800">
                    <span className="mt-0.5 text-[10px] text-green-500">+</span>
                    {pro}
                  </li>
                ))}
              </ul>
            </div>

            {/* Cons */}
            <div className="rounded-lg border border-red-100 bg-red-50/50 p-3">
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                Limitations
              </h4>
              <ul className="space-y-1">
                {method.cons.map((con, idx) => (
                  <li key={idx} className="flex items-start gap-1.5 text-xs text-red-800">
                    <span className="mt-0.5 text-[10px] text-red-500">&minus;</span>
                    {con}
                  </li>
                ))}
              </ul>
            </div>

            {/* Use Cases */}
            <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3">
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Best Use Cases
              </h4>
              <ul className="space-y-1">
                {method.useCases.map((useCase, idx) => (
                  <li key={idx} className="flex items-start gap-1.5 text-xs text-amber-800">
                    <span className="mt-0.5 text-[10px] text-amber-500">&bull;</span>
                    {useCase}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
