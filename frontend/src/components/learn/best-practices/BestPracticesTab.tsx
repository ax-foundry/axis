'use client';

import { AlertTriangle, Shield, Zap, ExternalLink, CheckCircle } from 'lucide-react';

import { CollapsibleSection } from './CollapsibleSection';
import { DosDontsPanel } from './DosDontsPanel';
import { PitfallCard } from './PitfallCard';

const dosList = [
  'Start by reviewing raw outputs before building any tooling',
  'Use binary pass/fail judgments paired with detailed critiques',
  'Curate golden datasets with domain-expert-verified ground truth',
  'Calibrate LLM judges against human annotations regularly',
  'Feed production failures back into your test sets',
  'Version evaluation datasets alongside your models',
];

const dontsList = [
  'Skip raw data review and jump straight to metrics',
  'Use Likert scales — they lack actionable guidance',
  'Assume LLM judges are correct without human validation',
  'Evaluate only at release time instead of continuously',
  'Use generic off-the-shelf evals for domain-specific problems',
  'Let the same model family judge its own outputs unchecked',
];

const pitfalls = [
  {
    title: 'Skipping Raw Data Review',
    mistake: 'Jumping straight to metrics without examining actual agent outputs',
    consequence:
      'You build evaluators that measure the wrong things and miss real failure patterns',
    solution:
      'Spend time reviewing raw examples first — classify failures before you automate anything',
  },
  {
    title: 'Uncalibrated LLM Judges',
    mistake: 'Treating LLM judge outputs as definitive without human validation',
    consequence: 'False confidence in evaluation results; biases go undetected',
    solution: "Calibrate against human annotations monthly — measure agreement with Cohen's Kappa",
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

export function BestPracticesTab() {
  return (
    <div className="space-y-6">
      {/* Introduction */}
      <div className="rounded-xl border border-border bg-white px-5 py-4">
        <h2 className="mb-1 text-sm font-semibold text-text-primary">Best Practices</h2>
        <p className="text-sm text-text-muted">
          Proven guidelines for building reliable evaluation systems — drawn from the{' '}
          <a
            href="https://ax-foundry.github.io/axion/agent_playbook/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            Agent Evaluation Playbook
          </a>{' '}
          and{' '}
          <a
            href="https://ax-foundry.github.io/axion/evaluation_flywheel/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            Evaluation Flywheel
          </a>
          .
        </p>
      </div>

      {/* Quick Reference Do's and Don'ts */}
      <DosDontsPanel dos={dosList} donts={dontsList} />

      {/* Detailed Best Practices */}
      <div className="space-y-4">
        <CollapsibleSection
          id="define-criteria"
          title="Define Clear Criteria"
          summary="Binary pass/fail with critiques beats Likert scales every time"
        >
          <div className="space-y-3 text-sm text-text-secondary">
            <p>
              Before building any evaluator, define what &ldquo;good&rdquo; means in one sentence.
              Then use binary judgments (pass/fail) paired with detailed critiques — not Likert
              scales, which lack actionable guidance and create evaluator disagreement.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-green-100 bg-green-50/50 p-3">
                <h5 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-green-700">
                  <CheckCircle className="h-3 w-3" />
                  Binary + Critique
                </h5>
                <ul className="space-y-1 text-xs">
                  <li>• Pass/Fail: Does the response address the query?</li>
                  <li>• Pass/Fail: Are all claims grounded in sources?</li>
                  <li>• Critique: What specifically was wrong or missing?</li>
                  <li>• Actionable: Directly maps to prompt/data fixes</li>
                </ul>
              </div>
              <div className="rounded-lg border border-red-100 bg-red-50/50 p-3">
                <h5 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-700">
                  <AlertTriangle className="h-3 w-3" />
                  Avoid: Vague Likert Scales
                </h5>
                <ul className="space-y-1 text-xs text-text-muted">
                  <li className="line-through">Rate helpfulness 1-5</li>
                  <li className="line-through">Score quality on a scale of 1-10</li>
                  <li className="line-through">How good is this response?</li>
                  <li className="text-xs italic text-red-500 no-underline">
                    Scores lack actionable meaning
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          id="ground-truth"
          title="Invest in Ground Truth"
          summary="Without ground truth, you're grading on vibes"
        >
          <div className="space-y-3 text-sm text-text-secondary">
            <p>
              Golden datasets with expert-verified expected answers are the foundation of reliable
              evaluation. They make automated metrics deterministic, anchor LLM judges, and enable
              fair A/B testing across model versions.
            </p>
            <div className="space-y-2">
              <h5 className="text-xs font-semibold text-text-primary">Dataset Lifecycle</h5>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {[
                  {
                    phase: 'Formation',
                    desc: 'Curate ~30+ real-world examples validated by domain experts. Cover intent, tone, and complexity variations.',
                  },
                  {
                    phase: 'Maintenance',
                    desc: 'Establish review cycles to keep answers current. Add production failures as new test cases.',
                  },
                  {
                    phase: 'Expansion',
                    desc: 'Grow coverage through edge cases and controlled synthesis until no new failure modes emerge.',
                  },
                ].map((item) => (
                  <div key={item.phase} className="rounded-lg bg-gray-50 p-2.5">
                    <p className="text-xs font-semibold text-text-primary">{item.phase}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-text-muted">
              <a
                href="https://ax-foundry.github.io/axion/why_ground_truth_matters/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                Read more: Why Ground Truth Matters
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          id="calibrate-judges"
          title="Calibrate LLM Judges"
          summary="The teacher must be smarter than the student"
        >
          <div className="space-y-3 text-sm text-text-secondary">
            <p>
              LLM judges have systematic biases and can drift over time. Regular calibration against
              human annotations keeps automated evaluations trustworthy. Use a judge model at least
              as capable as the agent being evaluated.
            </p>
            <div className="rounded-lg border border-purple-100 bg-purple-50 p-3">
              <h5 className="mb-2 text-xs font-semibold text-purple-700">Calibration Process</h5>
              <ol className="space-y-1.5 text-xs">
                {[
                  'Have domain experts annotate 50-100 examples with binary pass/fail + critiques',
                  'Run your LLM judge on the same examples with identical criteria',
                  "Measure agreement (Cohen's Kappa) — investigate all disagreements",
                  'Refine judge prompts: separate extraction (parse facts) from verification (check correctness)',
                  'Repeat monthly or whenever you change the judge model',
                ].map((step, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="font-semibold text-purple-600">{idx + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
            <p className="text-xs text-text-muted">
              <a
                href="https://ax-foundry.github.io/axion/agent_playbook/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                Read more: Agent Evaluation Playbook
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          id="evaluation-flywheel"
          title="Run the Evaluation Flywheel"
          summary="Build → Test → Deploy → Learn → Repeat"
        >
          <div className="space-y-3 text-sm text-text-secondary">
            <p>
              Evaluation is a continuous cycle, not a one-time gate. The flywheel has two loops that
              feed each other — pre-production experiments and post-production monitoring.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-lg bg-gray-50 p-3">
                <h5 className="mb-1.5 text-xs font-semibold text-text-primary">
                  Pre-Production (The Lab)
                </h5>
                <ul className="space-y-1 text-[11px] leading-relaxed text-text-muted">
                  <li>Run challenger vs. baseline experiments</li>
                  <li>Measure against golden datasets</li>
                  <li>Gate on: safety, accuracy, zero regressions</li>
                </ul>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <h5 className="mb-1.5 text-xs font-semibold text-text-primary">
                  Post-Production (The Real World)
                </h5>
                <ul className="space-y-1 text-[11px] leading-relaxed text-text-muted">
                  <li>Monitor business KPIs and user feedback</li>
                  <li>Check prod-test parity (lab vs. real performance)</li>
                  <li>Feed failures back into golden datasets</li>
                </ul>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-amber-50 p-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100">
                <Zap className="h-4 w-4 text-amber-600" />
              </div>
              <p className="text-xs text-amber-700">
                <strong>Key insight:</strong> Every production failure gets added to your golden
                datasets, preventing repeated mistakes and building momentum.
              </p>
            </div>
            <p className="text-xs text-text-muted">
              <a
                href="https://ax-foundry.github.io/axion/evaluation_flywheel/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                Read more: Evaluation Flywheel
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        </CollapsibleSection>
      </div>

      {/* Common Pitfalls */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-error" />
          <h3 className="text-sm font-semibold text-text-primary">Common Pitfalls</h3>
        </div>
        <p className="text-sm text-text-muted">
          Four critical mistakes that undermine evaluation efforts.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {pitfalls.map((pitfall, idx) => (
            <PitfallCard key={idx} {...pitfall} />
          ))}
        </div>
      </div>

      {/* Summary Card */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Shield className="h-[18px] w-[18px] text-primary" />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-text-primary">Key Takeaways</h3>
            <ul className="space-y-1 text-xs text-text-secondary">
              <li>
                • <strong>Analyze first</strong> — review raw outputs before building tooling
              </li>
              <li>
                • <strong>Binary + critique</strong> — ditch Likert scales for actionable judgments
              </li>
              <li>
                • <strong>Ground truth matters</strong> — curate golden datasets with domain experts
              </li>
              <li>
                • <strong>Calibrate monthly</strong> — validate LLM judges against human annotations
              </li>
              <li>
                • <strong>Close the loop</strong> — feed production failures back into test sets
              </li>
            </ul>
          </div>
        </div>
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
