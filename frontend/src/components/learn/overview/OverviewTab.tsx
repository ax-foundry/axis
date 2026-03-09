'use client';

import { ArrowRight, CheckCircle, AlertTriangle, Lightbulb, Target, Workflow } from 'lucide-react';

import { useUIStore } from '@/stores/ui-store';

import { ConceptCard } from './ConceptCard';
import { DatasetItemModel } from './DatasetItemModel';

export function OverviewTab() {
  const { setLearnMainTab } = useUIStore();

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="rounded-xl border border-border bg-white px-5 py-4">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Welcome to AI Evaluation</h2>
            <p className="mt-0.5 text-sm text-text-muted">
              Learn how to systematically assess and improve your AI systems — from understanding
              data structures to implementing best practices.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Tips Row */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="border-success/20 rounded-xl border bg-white px-4 py-3">
          <div className="flex items-start gap-3">
            <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
            <div>
              <p className="text-xs font-semibold text-text-primary">Do</p>
              <p className="mt-0.5 text-xs text-text-muted">
                Use diverse test cases that cover edge cases and real-world scenarios
              </p>
            </div>
          </div>
        </div>
        <div className="border-error/20 rounded-xl border bg-white px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-error" />
            <div>
              <p className="text-xs font-semibold text-text-primary">Don&apos;t</p>
              <p className="mt-0.5 text-xs text-text-muted">
                Rely solely on automated metrics without human review
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-accent-gold/20 bg-white px-4 py-3">
          <div className="flex items-start gap-3">
            <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-gold" />
            <div>
              <p className="text-xs font-semibold text-text-primary">Tip</p>
              <p className="mt-0.5 text-xs text-text-muted">
                Calibrate LLM judges monthly against fresh human annotations
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* What is Evaluation */}
      <ConceptCard
        icon={Target}
        title="What is AI Evaluation?"
        description="Understanding the purpose and importance of systematic AI assessment"
      >
        <div className="space-y-3 text-sm text-text-secondary">
          <p>
            AI evaluation is the systematic process of assessing an AI system&apos;s performance,
            safety, and alignment with intended goals. It helps teams understand how well their
            models perform across various dimensions.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-semibold text-text-primary">Accuracy</p>
              <p className="mt-0.5 text-xs text-text-muted">
                Does the model produce correct outputs?
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-semibold text-text-primary">Consistency</p>
              <p className="mt-0.5 text-xs text-text-muted">
                Are outputs reliable across similar inputs?
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-semibold text-text-primary">Safety</p>
              <p className="mt-0.5 text-xs text-text-muted">
                Does the model avoid harmful outputs?
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-semibold text-text-primary">Alignment</p>
              <p className="mt-0.5 text-xs text-text-muted">Does the model behave as intended?</p>
            </div>
          </div>
        </div>
      </ConceptCard>

      {/* Data Structure */}
      <DatasetItemModel />

      {/* Evaluation Flow */}
      <ConceptCard
        icon={Workflow}
        iconColor="text-blue-600"
        iconBgColor="bg-blue-50"
        title="The Evaluation Pipeline"
        description="Understanding how data flows through the evaluation process"
      >
        <div className="space-y-3">
          {/* Flow Diagram */}
          <div className="flex items-center justify-between overflow-x-auto rounded-lg bg-gray-50 p-4">
            <div className="flex min-w-max items-center gap-2 md:gap-4">
              <div className="flex flex-col items-center">
                <div className="mb-1.5 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 ring-1 ring-blue-200">
                  <span className="font-mono text-[10px] font-semibold text-blue-600">Input</span>
                </div>
                <span className="text-[10px] text-text-muted">Test Data</span>
              </div>
              <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
              <div className="flex flex-col items-center">
                <div className="mb-1.5 flex h-12 w-12 items-center justify-center rounded-lg bg-green-50 ring-1 ring-green-200">
                  <span className="font-mono text-[10px] font-semibold text-green-600">AI</span>
                </div>
                <span className="text-[10px] text-text-muted">Model</span>
              </div>
              <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
              <div className="flex flex-col items-center">
                <div className="mb-1.5 flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50 ring-1 ring-amber-200">
                  <span className="font-mono text-[10px] font-semibold text-amber-600">Judge</span>
                </div>
                <span className="text-[10px] text-text-muted">Evaluator</span>
              </div>
              <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
              <div className="flex flex-col items-center">
                <div className="mb-1.5 flex h-12 w-12 items-center justify-center rounded-lg bg-purple-50 ring-1 ring-purple-200">
                  <span className="font-mono text-[10px] font-semibold text-purple-600">Score</span>
                </div>
                <span className="text-[10px] text-text-muted">Results</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-semibold text-text-primary">1. Prepare Test Data</p>
              <p className="mt-0.5 text-xs text-text-muted">
                Structure your queries and expected outputs into a dataset
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-semibold text-text-primary">2. Generate Responses</p>
              <p className="mt-0.5 text-xs text-text-muted">
                Run your AI model against the test queries
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-semibold text-text-primary">3. Evaluate Quality</p>
              <p className="mt-0.5 text-xs text-text-muted">
                Use judges (LLM, human, or automated) to score responses
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-semibold text-text-primary">4. Analyze Results</p>
              <p className="mt-0.5 text-xs text-text-muted">
                Review metrics, identify patterns, and iterate on improvements
              </p>
            </div>
          </div>
        </div>
      </ConceptCard>

      {/* Next Steps */}
      <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-5 py-3.5">
        <div>
          <p className="text-sm font-medium text-text-primary">Ready to dive deeper?</p>
          <p className="text-xs text-text-muted">
            Try the Interactive Walkthrough to see evaluation in action.
          </p>
        </div>
        <button
          onClick={() => setLearnMainTab('walkthrough')}
          className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          Start Walkthrough
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
