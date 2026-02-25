'use client';

import {
  Target,
  Database,
  Scale,
  RefreshCw,
  FileText,
  AlertTriangle,
  Shield,
  Zap,
} from 'lucide-react';

import { CollapsibleSection } from './CollapsibleSection';
import { DosDontsPanel } from './DosDontsPanel';
import { PitfallCard } from './PitfallCard';

const dosList = [
  'Use diverse test cases that cover edge cases and real-world scenarios',
  'Document your evaluation criteria clearly and consistently',
  'Calibrate LLM judges against human judgment regularly',
  'Track evaluation metrics over time to identify trends',
  'Include both positive and negative examples in your test set',
  'Version your evaluation datasets alongside your models',
];

const dontsList = [
  'Rely solely on automated metrics without human review',
  'Use the same data for training and evaluation',
  'Ignore edge cases in favor of common scenarios',
  'Assume LLM judges are always correct without verification',
  'Evaluate only at release time instead of continuously',
  'Discard evaluation results without analysis',
];

const pitfalls = [
  {
    title: 'Overfitting to Benchmarks',
    mistake: 'Optimizing your model specifically for evaluation benchmarks',
    consequence: 'Model performs well on benchmarks but poorly on real-world tasks',
    solution: 'Use held-out test sets and periodically refresh your evaluation data',
  },
  {
    title: 'Position Bias in LLM Judges',
    mistake: 'Not accounting for the tendency of LLMs to prefer responses in certain positions',
    consequence: 'Systematic bias in comparison evaluations (e.g., always preferring response A)',
    solution: 'Randomize response order and average scores across multiple orderings',
  },
  {
    title: 'Verbosity Bias',
    mistake: 'Not controlling for response length in evaluations',
    consequence: 'LLM judges may favor longer responses regardless of quality',
    solution: 'Normalize for length or explicitly instruct judges to ignore length',
  },
  {
    title: 'Self-Preference Bias',
    mistake: 'Using the same model family for both generation and evaluation',
    consequence: 'The judge may prefer outputs from models similar to itself',
    solution: 'Use judges from different model families or calibrate against human evaluation',
  },
];

export function BestPracticesTab() {
  return (
    <div className="space-y-6">
      {/* Introduction */}
      <div className="card bg-gradient-to-br from-gray-50 to-white">
        <h2 className="mb-2 text-xl font-semibold text-text-primary">Best Practices</h2>
        <p className="text-text-muted">
          Follow these guidelines to build effective, reliable evaluation systems. Learn from common
          mistakes and establish a strong evaluation foundation.
        </p>
      </div>

      {/* Quick Reference Do's and Don'ts */}
      <DosDontsPanel dos={dosList} donts={dontsList} />

      {/* Detailed Best Practices */}
      <div className="space-y-4">
        <CollapsibleSection
          id="define-criteria"
          icon={Target}
          iconColor="text-blue-600"
          iconBgColor="bg-blue-100"
          title="Define Clear Criteria"
          summary="Establish specific, measurable evaluation criteria before you begin"
        >
          <div className="space-y-4 text-text-secondary">
            <p>
              Clear evaluation criteria are the foundation of any good evaluation system. Without
              them, scores become subjective and inconsistent.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg bg-gray-50 p-4">
                <h5 className="mb-2 font-medium text-text-primary">Good Criteria</h5>
                <ul className="space-y-1 text-sm">
                  <li>• Response addresses all parts of the query</li>
                  <li>• No factual errors or hallucinations</li>
                  <li>• Tone matches the requested style</li>
                  <li>• Response is under 200 words</li>
                </ul>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <h5 className="mb-2 font-medium text-text-primary">Vague Criteria</h5>
                <ul className="space-y-1 text-sm text-text-muted">
                  <li className="line-through">• Response is good</li>
                  <li className="line-through">• Answer is helpful</li>
                  <li className="line-through">• Content is high quality</li>
                  <li className="line-through">• Response is appropriate</li>
                </ul>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          id="representative-data"
          icon={Database}
          iconColor="text-green-600"
          iconBgColor="bg-green-100"
          title="Use Representative Data"
          summary="Test on diverse, real-world examples including edge cases"
        >
          <div className="space-y-4 text-text-secondary">
            <p>
              Your evaluation is only as good as your test data. Ensure your dataset covers the full
              range of scenarios your AI will encounter.
            </p>
            <div className="space-y-2">
              <h5 className="font-medium text-text-primary">Data Coverage Checklist</h5>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {[
                  'Common use cases (80% of real traffic)',
                  'Edge cases and unusual inputs',
                  'Adversarial examples',
                  'Different user personas/demographics',
                  'Various input lengths and formats',
                  'Multi-language if applicable',
                  'Domain-specific terminology',
                  'Ambiguous or unclear queries',
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded bg-gray-50 p-2 text-sm">
                    <div className="h-4 w-4 rounded border border-gray-300" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          id="calibrate-judges"
          icon={Scale}
          iconColor="text-purple-600"
          iconBgColor="bg-purple-100"
          title="Calibrate Judges Regularly"
          summary="Validate LLM judges against human judgment to maintain accuracy"
        >
          <div className="space-y-4 text-text-secondary">
            <p>
              LLM judges can drift or have systematic biases. Regular calibration ensures your
              automated evaluations stay aligned with human expectations.
            </p>
            <div className="rounded-lg border border-purple-100 bg-purple-50 p-4">
              <h5 className="mb-3 font-medium text-purple-700">Calibration Process</h5>
              <ol className="space-y-2 text-sm">
                <li className="flex gap-2">
                  <span className="font-semibold text-purple-600">1.</span>
                  Have humans annotate a sample of 50-100 examples
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-purple-600">2.</span>
                  Run your LLM judge on the same examples
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-purple-600">3.</span>
                  Calculate agreement metrics (Cohen&apos;s Kappa, correlation)
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-purple-600">4.</span>
                  Investigate disagreements and adjust prompts if needed
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-purple-600">5.</span>
                  Repeat monthly or after significant model changes
                </li>
              </ol>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          id="iterate-continuously"
          icon={RefreshCw}
          iconColor="text-amber-600"
          iconBgColor="bg-amber-100"
          title="Iterate Continuously"
          summary="Evaluation is an ongoing process, not a one-time event"
        >
          <div className="space-y-4 text-text-secondary">
            <p>
              Your AI system, user needs, and understanding of quality all evolve. Your evaluation
              system should evolve with them.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-amber-50 p-4 text-center">
                <Zap className="mx-auto mb-2 h-8 w-8 text-amber-600" />
                <p className="font-medium text-amber-700">Weekly</p>
                <p className="text-sm text-amber-600">Review metrics trends</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-4 text-center">
                <Scale className="mx-auto mb-2 h-8 w-8 text-amber-600" />
                <p className="font-medium text-amber-700">Monthly</p>
                <p className="text-sm text-amber-600">Calibrate judges</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-4 text-center">
                <Database className="mx-auto mb-2 h-8 w-8 text-amber-600" />
                <p className="font-medium text-amber-700">Quarterly</p>
                <p className="text-sm text-amber-600">Refresh test data</p>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          id="document-everything"
          icon={FileText}
          iconColor="text-cyan-600"
          iconBgColor="bg-cyan-100"
          title="Document Everything"
          summary="Keep records of methodology, results, and changes for reproducibility"
        >
          <div className="space-y-4 text-text-secondary">
            <p>
              Good documentation enables reproducibility, helps new team members onboard, and
              provides an audit trail for decisions.
            </p>
            <div className="space-y-2">
              <h5 className="font-medium text-text-primary">What to Document</h5>
              <ul className="space-y-2">
                {[
                  { title: 'Evaluation criteria', desc: 'What you measure and why' },
                  { title: 'Dataset composition', desc: 'Source, size, and selection criteria' },
                  { title: 'Judge configuration', desc: 'Prompts, models, and parameters' },
                  { title: 'Results and analysis', desc: 'Scores, trends, and interpretations' },
                  { title: 'Decision rationale', desc: 'Why changes were made' },
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-cyan-100">
                      <span className="text-xs font-bold text-cyan-600">{idx + 1}</span>
                    </div>
                    <div>
                      <p className="font-medium text-text-primary">{item.title}</p>
                      <p className="text-sm text-text-muted">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      {/* Common Pitfalls */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-error" />
          <h3 className="text-lg font-semibold text-text-primary">Common Pitfalls</h3>
        </div>
        <p className="text-text-muted">
          Avoid these common mistakes that can undermine your evaluation efforts.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {pitfalls.map((pitfall, idx) => (
            <PitfallCard key={idx} {...pitfall} />
          ))}
        </div>
      </div>

      {/* Summary Card */}
      <div className="card bg-gradient-to-r from-primary to-primary-light text-white">
        <div className="flex items-start gap-4">
          <Shield className="h-8 w-8 flex-shrink-0" />
          <div>
            <h3 className="mb-2 text-lg font-semibold">Key Takeaways</h3>
            <ul className="space-y-1 text-sm text-white/90">
              <li>• Start with clear, measurable criteria</li>
              <li>• Use diverse, representative test data</li>
              <li>• Calibrate automated judges against humans</li>
              <li>• Treat evaluation as an ongoing process</li>
              <li>• Document everything for reproducibility</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
