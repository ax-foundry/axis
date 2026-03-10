'use client';

import { ExternalLink } from 'lucide-react';

import { MethodCard } from './MethodCard';
import { MethodComparisonTable } from './MethodComparisonTable';

import type { EvaluationMethod } from '@/types';

const evaluationMethods: EvaluationMethod[] = [
  {
    id: 'llm-judge',
    name: 'LLM-as-Judge',
    description:
      'Use a capable LLM to evaluate agent responses with binary pass/fail judgments paired with detailed critiques. The judge should always be at least as capable as the model being evaluated.',
    pros: [
      'Scalable to thousands of evaluations',
      'Binary + critique format yields actionable feedback',
      'Can evaluate nuance across multiple dimensions',
      'No reference answers required for many metrics',
      'Separating extraction from verification improves accuracy',
    ],
    cons: [
      'Must be calibrated against human judgment',
      'Susceptible to biases (position, verbosity, self-preference)',
      'Vague prompts with Likert scales produce unreliable scores',
      'Judge model must meet or exceed the agent being evaluated',
    ],
    useCases: [
      'Continuous monitoring of production agents',
      'A/B testing between model versions',
      'Evaluating faithfulness, relevance, and completeness',
      'Scaling evaluation without growing annotation teams',
    ],
    complexity: 'medium',
    scalability: 'high',
  },
  {
    id: 'human',
    name: 'Human Evaluation',
    description:
      'Domain experts review AI outputs to establish ground truth. The irreplaceable gold standard for calibrating automated judges and catching failures machines miss.',
    pros: [
      'Highest quality judgments on domain-specific content',
      'Catches subtle errors LLMs overlook',
      'Essential for building golden datasets',
      'Provides qualitative feedback for prompt refinement',
      'Required for safety-critical applications',
    ],
    cons: [
      'Expensive and time-consuming to scale',
      'Inter-annotator disagreement requires resolution processes',
      'Annotator fatigue degrades quality over long sessions',
      'Cannot keep pace with production evaluation volume',
    ],
    useCases: [
      'Calibrating and validating LLM judges',
      'Curating golden datasets with verified ground truth',
      'High-stakes domains (medical, legal, financial)',
      'Classifying failure modes and root causes',
    ],
    complexity: 'low',
    scalability: 'low',
  },
  {
    id: 'automated',
    name: 'Automated Metrics',
    description:
      'Deterministic metrics computed against ground truth — retrieval accuracy (HitRate@K, MRR), exact match, embedding similarity, and structured output validation.',
    pros: [
      'Deterministic and perfectly reproducible',
      'Near-zero cost per evaluation',
      'Ideal for CI/CD quality gates and regression testing',
      'Ground truth anchoring eliminates judge variability',
    ],
    cons: [
      'Requires curated reference answers (ground truth)',
      'Cannot evaluate open-ended quality or creativity',
      'Surface-level comparison may miss semantic equivalence',
      'Metrics without actionable meaning are noise',
    ],
    useCases: [
      'Regression testing in CI/CD pipelines',
      'Retrieval correctness verification (RAG systems)',
      'Fact-checking against known answers',
      'Release gate criteria before production deployment',
    ],
    complexity: 'low',
    scalability: 'high',
  },
  {
    id: 'hybrid',
    name: 'Hybrid / Flywheel',
    description:
      'The evaluation flywheel: automated metrics gate CI/CD, LLM judges evaluate at scale in production, human review calibrates judges and catches edge cases. Production failures feed back into golden datasets.',
    pros: [
      'Balances cost, speed, and quality across the lifecycle',
      'Production data continuously strengthens test sets',
      "Each method compensates for the others' blind spots",
      'Scales from prototype to enterprise',
    ],
    cons: [
      'Higher initial setup and coordination effort',
      'Requires clear ownership of each evaluation layer',
      'Scoring may differ across methods without alignment',
      'Needs discipline to maintain the feedback loop',
    ],
    useCases: [
      'Enterprise-scale agent evaluation programs',
      'Teams running the Build → Test → Deploy → Learn cycle',
      'Bridging pre-production experiments with production monitoring',
      'Organizations evolving from manual to continuous evaluation',
    ],
    complexity: 'high',
    scalability: 'high',
  },
];

const DOC_LINKS = [
  {
    label: 'Evaluation Flywheel',
    href: 'https://ax-foundry.github.io/axion/evaluation_flywheel/',
  },
  {
    label: 'Agent Evaluation Playbook',
    href: 'https://ax-foundry.github.io/axion/agent_playbook/',
  },
  {
    label: 'Why Ground Truth Matters',
    href: 'https://ax-foundry.github.io/axion/why_ground_truth_matters/',
  },
];

export function MethodsTab() {
  return (
    <div className="space-y-6">
      {/* Introduction */}
      <div className="rounded-xl border border-border bg-white px-5 py-4">
        <h2 className="mb-1 text-sm font-semibold text-text-primary">Evaluation Methods</h2>
        <p className="text-sm text-text-muted">
          There are several approaches to evaluating AI agents, each suited to different stages of
          the evaluation lifecycle. The right strategy typically combines multiple methods.
        </p>
      </div>

      {/* Method Cards */}
      <div className="space-y-4">
        {evaluationMethods.map((method) => (
          <MethodCard key={method.id} method={method} />
        ))}
      </div>

      {/* Comparison Table */}
      <MethodComparisonTable />

      {/* Recommendation */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
        <h3 className="mb-2 text-sm font-semibold text-primary">Recommended Approach</h3>
        <p className="text-sm text-text-secondary">
          Start with the <strong>Analyze-Measure-Improve</strong> cycle: review raw outputs to map
          failure patterns, build targeted evaluators, then address root causes. Use{' '}
          <strong>binary judgments + critiques</strong> over Likert scales — they are more
          actionable and align better with expert decisions. Calibrate LLM judges against{' '}
          <strong>human ground truth</strong> monthly, and feed production failures back into your
          golden datasets to keep the <strong>evaluation flywheel</strong> spinning.
        </p>
      </div>

      {/* Documentation Links */}
      <div className="rounded-xl border border-border bg-white px-5 py-4">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Further Reading</h3>
        <div className="flex flex-wrap gap-2">
          {DOC_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-gray-50 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
            >
              {link.label}
              <ExternalLink className="h-3 w-3" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
