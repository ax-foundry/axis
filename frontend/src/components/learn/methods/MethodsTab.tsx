'use client';

import { Bot, Users, Gauge, Combine } from 'lucide-react';

import { MethodCard } from './MethodCard';
import { MethodComparisonTable } from './MethodComparisonTable';

import type { EvaluationMethod } from '@/types';

const evaluationMethods: EvaluationMethod[] = [
  {
    id: 'llm-judge',
    name: 'LLM-as-Judge',
    description:
      'Use a large language model to evaluate responses. The judge LLM analyzes outputs and provides scores with explanations.',
    pros: [
      'Scalable to thousands of evaluations',
      'Can capture nuance and context',
      'Provides detailed explanations for scores',
      'No reference answers required',
      'Can evaluate multiple dimensions simultaneously',
    ],
    cons: [
      'Requires calibration against human judgment',
      'May have biases (position, verbosity, self-preference)',
      'API costs can add up at scale',
      'Consistency can vary between runs',
    ],
    useCases: [
      'Large-scale evaluation of chatbot responses',
      'Continuous monitoring of production AI systems',
      'Comparing multiple model versions',
      'Evaluating subjective qualities like helpfulness',
    ],
    complexity: 'medium',
    scalability: 'high',
  },
  {
    id: 'human',
    name: 'Human Evaluation',
    description:
      'Expert human annotators review and score AI outputs. The gold standard for evaluation quality.',
    pros: [
      'Highest quality judgments',
      'Can catch subtle issues LLMs miss',
      'Provides qualitative feedback',
      'Essential for safety-critical applications',
      'Ground truth for calibration',
    ],
    cons: [
      'Expensive and time-consuming',
      'Difficult to scale',
      'Inter-annotator disagreement',
      'Potential for annotator fatigue and bias',
    ],
    useCases: [
      'Calibrating LLM judges',
      'High-stakes evaluations (medical, legal)',
      'Creating evaluation benchmarks',
      'Quality audits of production systems',
    ],
    complexity: 'low',
    scalability: 'low',
  },
  {
    id: 'automated',
    name: 'Automated Metrics',
    description:
      'Use algorithmic metrics like BLEU, ROUGE, exact match, or embedding similarity to evaluate outputs programmatically.',
    pros: [
      'Extremely fast and consistent',
      'Very low cost per evaluation',
      'Deterministic results',
      'Easy to integrate into CI/CD pipelines',
    ],
    cons: [
      'Limited to surface-level comparisons',
      'Requires reference answers',
      'Cannot evaluate creativity or helpfulness',
      'May not correlate with human preferences',
    ],
    useCases: [
      'Quick regression testing',
      'Automated CI/CD quality gates',
      'Evaluating factual accuracy with known answers',
      'High-volume, low-complexity evaluations',
    ],
    complexity: 'low',
    scalability: 'high',
  },
  {
    id: 'hybrid',
    name: 'Hybrid Approach',
    description:
      'Combine multiple evaluation methods: use automated metrics for filtering, LLM judges for bulk evaluation, and human review for edge cases.',
    pros: [
      'Balances cost and quality',
      'Leverages strengths of each method',
      'Can handle diverse evaluation needs',
      'Reduces blind spots of individual methods',
    ],
    cons: [
      'More complex to set up and maintain',
      'Requires coordination between methods',
      'May have inconsistent scoring across methods',
      'Higher initial investment',
    ],
    useCases: [
      'Enterprise-scale AI evaluation programs',
      'Teams with mixed evaluation needs',
      'Building comprehensive evaluation pipelines',
      'Organizations scaling from manual to automated evaluation',
    ],
    complexity: 'high',
    scalability: 'high',
  },
];

const methodIcons = {
  'llm-judge': { icon: Bot, color: 'text-blue-600', bg: 'bg-blue-100' },
  human: { icon: Users, color: 'text-purple-600', bg: 'bg-purple-100' },
  automated: { icon: Gauge, color: 'text-green-600', bg: 'bg-green-100' },
  hybrid: { icon: Combine, color: 'text-amber-600', bg: 'bg-amber-100' },
};

export function MethodsTab() {
  return (
    <div className="space-y-6">
      {/* Introduction */}
      <div className="card bg-gradient-to-br from-gray-50 to-white">
        <h2 className="mb-2 text-xl font-semibold text-text-primary">Evaluation Methods</h2>
        <p className="text-text-muted">
          There are several approaches to evaluating AI systems, each with different tradeoffs.
          Understanding when to use each method is key to building an effective evaluation strategy.
        </p>
      </div>

      {/* Method Cards */}
      <div className="space-y-4">
        {evaluationMethods.map((method) => {
          const iconConfig = methodIcons[method.id as keyof typeof methodIcons];
          return (
            <MethodCard
              key={method.id}
              method={method}
              icon={iconConfig.icon}
              iconColor={iconConfig.color}
              iconBgColor={iconConfig.bg}
            />
          );
        })}
      </div>

      {/* Comparison Table */}
      <MethodComparisonTable />

      {/* Recommendation */}
      <div className="card border-primary/20 bg-primary/5">
        <h3 className="mb-2 text-lg font-semibold text-primary">Our Recommendation</h3>
        <p className="text-text-secondary">
          For most teams, we recommend starting with <strong>LLM-as-Judge</strong> for its balance
          of scalability and quality. Calibrate your LLM judge against{' '}
          <strong>human evaluation</strong> periodically (monthly) to ensure accuracy. Use{' '}
          <strong>automated metrics</strong> for regression testing in CI/CD pipelines. As your
          evaluation needs grow, evolve toward a <strong>hybrid approach</strong>.
        </p>
      </div>
    </div>
  );
}
