'use client';

import { ChevronDown, ChevronUp, Check, X, Lightbulb, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

import type { EvaluationMethod } from '@/types';

interface MethodCardProps {
  method: EvaluationMethod;
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
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

export function MethodCard({
  method,
  icon: Icon,
  iconColor = 'text-primary',
  iconBgColor = 'bg-primary-pale',
}: MethodCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="card transition-shadow duration-200 hover:shadow-md">
      {/* Header */}
      <div
        className="flex cursor-pointer items-start gap-4"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div
          className={`h-12 w-12 ${iconBgColor} flex flex-shrink-0 items-center justify-center rounded-xl`}
        >
          <Icon className={`h-6 w-6 ${iconColor}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-text-primary">{method.name}</h3>
              <p className="mt-1 text-sm text-text-muted">{method.description}</p>
            </div>
            <button className="rounded p-1 hover:bg-gray-100">
              {isExpanded ? (
                <ChevronUp className="h-5 w-5 text-text-muted" />
              ) : (
                <ChevronDown className="h-5 w-5 text-text-muted" />
              )}
            </button>
          </div>

          {/* Badges */}
          <div className="mt-3 flex items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${complexityColors[method.complexity]}`}
            >
              {method.complexity.charAt(0).toUpperCase() + method.complexity.slice(1)} Complexity
            </span>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${scalabilityColors[method.scalability]}`}
            >
              {method.scalability.charAt(0).toUpperCase() + method.scalability.slice(1)} Scalability
            </span>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="animate-fade-in-up mt-6 space-y-4 border-t border-border pt-6">
          {/* Pros and Cons */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Pros */}
            <div className="rounded-xl border border-green-100 bg-green-50 p-4">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-green-700">
                <Check className="h-4 w-4" />
                Advantages
              </h4>
              <ul className="space-y-2">
                {method.pros.map((pro, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-green-800">
                    <span className="mt-1 text-green-500">+</span>
                    {pro}
                  </li>
                ))}
              </ul>
            </div>

            {/* Cons */}
            <div className="rounded-xl border border-red-100 bg-red-50 p-4">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-700">
                <X className="h-4 w-4" />
                Limitations
              </h4>
              <ul className="space-y-2">
                {method.cons.map((con, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-red-800">
                    <span className="mt-1 text-red-500">-</span>
                    {con}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Use Cases */}
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-700">
              <Lightbulb className="h-4 w-4" />
              Best Use Cases
            </h4>
            <ul className="space-y-2">
              {method.useCases.map((useCase, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-amber-800">
                  <span className="mt-1 text-amber-500">•</span>
                  {useCase}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
