'use client';

import { Target, Workflow, ArrowRight, CheckCircle, AlertTriangle, Lightbulb } from 'lucide-react';

import { ConceptCard } from './ConceptCard';
import { DatasetItemModel } from './DatasetItemModel';

export function OverviewTab() {
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="card border-primary/10 bg-gradient-to-br from-primary/5 to-primary-pale/30">
        <div className="flex flex-col items-start gap-6 md:flex-row md:items-center">
          <div className="flex-1">
            <h2 className="mb-3 text-2xl font-bold text-text-primary">Welcome to AI Evaluation</h2>
            <p className="leading-relaxed text-text-secondary">
              Learn how to systematically assess and improve your AI systems. This guide covers the
              fundamentals of evaluation, from understanding data structures to implementing best
              practices.
            </p>
          </div>
          <div className="flex-shrink-0">
            <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-light shadow-lg shadow-primary/20">
              <Target className="h-12 w-12 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Tips Row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card border-success/20 bg-success/5">
          <div className="flex items-start gap-3">
            <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-success" />
            <div>
              <p className="font-medium text-text-primary">Do</p>
              <p className="text-sm text-text-muted">
                Use diverse test cases that cover edge cases and real-world scenarios
              </p>
            </div>
          </div>
        </div>
        <div className="card border-error/20 bg-error/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-error" />
            <div>
              <p className="font-medium text-text-primary">Don&apos;t</p>
              <p className="text-sm text-text-muted">
                Rely solely on automated metrics without human review
              </p>
            </div>
          </div>
        </div>
        <div className="card border-accent-gold/20 bg-accent-gold/5">
          <div className="flex items-start gap-3">
            <Lightbulb className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent-gold" />
            <div>
              <p className="font-medium text-text-primary">Tip</p>
              <p className="text-sm text-text-muted">
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
        <div className="space-y-4 text-text-secondary">
          <p>
            AI evaluation is the systematic process of assessing an AI system&apos;s performance,
            safety, and alignment with intended goals. It helps teams understand how well their
            models perform across various dimensions.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="mb-1 font-medium text-text-primary">Accuracy</p>
              <p className="text-sm text-text-muted">Does the model produce correct outputs?</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="mb-1 font-medium text-text-primary">Consistency</p>
              <p className="text-sm text-text-muted">Are outputs reliable across similar inputs?</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="mb-1 font-medium text-text-primary">Safety</p>
              <p className="text-sm text-text-muted">Does the model avoid harmful outputs?</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="mb-1 font-medium text-text-primary">Alignment</p>
              <p className="text-sm text-text-muted">Does the model behave as intended?</p>
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
        iconBgColor="bg-blue-100"
        title="The Evaluation Pipeline"
        description="Understanding how data flows through the evaluation process"
      >
        <div className="space-y-4">
          {/* Flow Diagram */}
          <div className="flex items-center justify-between overflow-x-auto rounded-xl bg-gray-50 p-4">
            <div className="flex min-w-max items-center gap-2 md:gap-4">
              {/* Input */}
              <div className="flex flex-col items-center">
                <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-xl bg-blue-100">
                  <span className="font-mono text-xs text-blue-600">Input</span>
                </div>
                <span className="text-xs text-text-muted">Test Data</span>
              </div>

              <ArrowRight className="h-6 w-6 flex-shrink-0 text-gray-300" />

              {/* Process */}
              <div className="flex flex-col items-center">
                <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-xl bg-green-100">
                  <span className="font-mono text-xs text-green-600">AI</span>
                </div>
                <span className="text-xs text-text-muted">Model</span>
              </div>

              <ArrowRight className="h-6 w-6 flex-shrink-0 text-gray-300" />

              {/* Judge */}
              <div className="flex flex-col items-center">
                <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-xl bg-amber-100">
                  <span className="font-mono text-xs text-amber-600">Judge</span>
                </div>
                <span className="text-xs text-text-muted">Evaluator</span>
              </div>

              <ArrowRight className="h-6 w-6 flex-shrink-0 text-gray-300" />

              {/* Output */}
              <div className="flex flex-col items-center">
                <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-xl bg-purple-100">
                  <span className="font-mono text-xs text-purple-600">Score</span>
                </div>
                <span className="text-xs text-text-muted">Results</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="mb-1 font-medium text-text-primary">1. Prepare Test Data</p>
              <p className="text-sm text-text-muted">
                Structure your queries and expected outputs into a dataset
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="mb-1 font-medium text-text-primary">2. Generate Responses</p>
              <p className="text-sm text-text-muted">Run your AI model against the test queries</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="mb-1 font-medium text-text-primary">3. Evaluate Quality</p>
              <p className="text-sm text-text-muted">
                Use judges (LLM, human, or automated) to score responses
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="mb-1 font-medium text-text-primary">4. Analyze Results</p>
              <p className="text-sm text-text-muted">
                Review metrics, identify patterns, and iterate on improvements
              </p>
            </div>
          </div>
        </div>
      </ConceptCard>

      {/* Next Steps */}
      <div className="card bg-gradient-to-r from-primary to-primary-light text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="mb-1 text-xl font-semibold">Ready to dive deeper?</h3>
            <p className="text-white/80">
              Try the Interactive Walkthrough to see evaluation in action.
            </p>
          </div>
          <button
            onClick={() => {
              // This will be connected to the tab navigation
              const store = window.document.querySelector('[data-walkthrough-btn]');
              store?.dispatchEvent(new Event('click'));
            }}
            className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-medium text-primary transition-colors hover:bg-white/90"
          >
            Start Walkthrough
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
