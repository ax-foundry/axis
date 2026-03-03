'use client';

import { AlertCircle, Cpu, FlaskConical, Loader2, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useRunSimulation, useStepFixture } from '@/lib/hooks/useReplayData';
import { useReplayStore } from '@/stores/replay-store';

import { SimulationResults } from './SimulationResults';
import { VariableEditor } from './VariableEditor';

import type { SimulateResponse } from '@/types/replay';

const LOADING_MESSAGES = [
  'Warming up the neurons...',
  'Reticulating splines...',
  'Consulting the oracle...',
  'Rearranging the token soup...',
  'Negotiating with the LLM...',
  'Solving world hunger (brb)...',
  'Building a galaxy far, far away...',
  'Teaching robots to feel...',
  'Aligning the quantum flux...',
  'Counting backwards from infinity...',
  'Asking the magic 8-ball...',
  'Brewing a fresh batch of embeddings...',
  'Untangling the attention heads...',
  'Polishing the transformer layers...',
  'Whispering to the GPU...',
  'Running the vibe check...',
  'Calibrating the hallucination detector...',
  'Summoning the latent space...',
];

function useRotatingMessage(active: boolean, intervalMs = 2500): string {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * LOADING_MESSAGES.length));

  useEffect(() => {
    if (!active) {
      setIndex(Math.floor(Math.random() * LOADING_MESSAGES.length));
      return;
    }
    const timer = setInterval(() => {
      setIndex((prev) => {
        let next: number;
        do {
          next = Math.floor(Math.random() * LOADING_MESSAGES.length);
        } while (next === prev && LOADING_MESSAGES.length > 1);
        return next;
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);

  return LOADING_MESSAGES[index];
}

interface WhatIfPanelProps {
  traceId: string;
  nodeId: string;
  nodeName: string | null;
  agent?: string | null;
}

export function WhatIfPanel({ traceId, nodeId, nodeName, agent }: WhatIfPanelProps) {
  const { whatIf, exitWhatIf, setWhatIfFixtureHash } = useReplayStore();

  // Fetch fixture
  const {
    data: fixture,
    isLoading: fixtureLoading,
    error: fixtureError,
  } = useStepFixture(traceId, nodeId, agent, whatIf.active);

  // Simulation mutation
  const {
    mutate: simulate,
    data: simResult,
    isPending: isSimulating,
    error: simError,
    reset: resetSimulation,
  } = useRunSimulation();

  // Store fixture hash when loaded
  useEffect(() => {
    if (fixture?.fixture_hash) {
      setWhatIfFixtureHash(fixture.fixture_hash);
    }
  }, [fixture?.fixture_hash, setWhatIfFixtureHash]);

  const handleSimulate = () => {
    if (!fixture || !whatIf.fixtureHash) return;

    const variableOverrides: Record<string, string> = {};
    for (const [key, value] of Object.entries(whatIf.overrides)) {
      if (typeof value === 'string') {
        variableOverrides[key] = value;
      } else if (value != null) {
        variableOverrides[key] = String(value);
      }
    }

    simulate({
      traceId,
      nodeId,
      agent,
      request: {
        fixture_hash: whatIf.fixtureHash,
        prompt_messages_override: whatIf.promptMessagesOverride,
        variable_overrides: Object.keys(variableOverrides).length > 0 ? variableOverrides : null,
      },
    });
  };

  const loadingMessage = useRotatingMessage(isSimulating);

  const handleExit = () => {
    resetSimulation();
    exitWhatIf();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border-2 border-primary/25 bg-white shadow-lg shadow-primary/5">
      {/* Header — gradient bar */}
      <div className="flex items-center gap-2.5 bg-gradient-to-r from-primary to-primary-dark px-4 py-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/20">
          <FlaskConical className="h-3.5 w-3.5 text-white" />
        </div>
        <h3 className="text-sm font-bold text-white">What-If Simulator</h3>
        {nodeName && (
          <span className="truncate rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
            {nodeName}
          </span>
        )}
        <button
          onClick={handleExit}
          className="ml-auto rounded-md p-1 text-white/60 transition-colors hover:bg-white/20 hover:text-white"
          title="Exit What-If"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      {fixtureLoading && (
        <div className="flex flex-1 items-center justify-center gap-2 text-text-muted">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm">Loading fixture...</span>
        </div>
      )}

      {fixtureError && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          {fixtureError instanceof Error && fixtureError.message.includes('not GENERATION') ? (
            <>
              <div className="flex items-center gap-2">
                <FlaskConical className="h-6 w-6 text-primary/40" />
                <span className="text-lg text-text-muted">&rarr;</span>
                <span className="flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                  <Cpu className="h-3.5 w-3.5" />
                  GEN
                </span>
              </div>
              <p className="max-w-xs text-center text-sm text-text-secondary">
                What-If works on <strong>LLM generation</strong> steps. Select a step marked{' '}
                <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-px text-[10px] font-bold text-emerald-700">
                  <Cpu className="inline h-2.5 w-2.5" />
                  GEN
                </span>{' '}
                in the tree to simulate different inputs.
              </p>
            </>
          ) : (
            <>
              <AlertCircle className="h-8 w-8 text-red-400" />
              <p className="text-center text-sm text-red-600">
                {fixtureError instanceof Error ? fixtureError.message : 'Failed to load fixture'}
              </p>
            </>
          )}
          <button
            onClick={handleExit}
            className="rounded-lg bg-gray-100 px-4 py-1.5 text-xs font-medium text-text-secondary hover:bg-gray-200"
          >
            Go Back
          </button>
        </div>
      )}

      {fixture && !fixtureLoading && (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
          {/* Left: Variable Editor */}
          <div className="min-h-0 min-w-0 overflow-hidden border-b border-primary/10 bg-gradient-to-b from-primary/[0.02] to-transparent lg:border-b-0 lg:border-r lg:border-r-primary/10">
            <VariableEditor
              fixture={fixture}
              onSimulate={handleSimulate}
              isSimulating={isSimulating}
            />
          </div>

          {/* Right: Results */}
          <div className="min-w-0">
            {isSimulating && (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-text-muted">
                <div className="relative">
                  <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
                  <FlaskConical className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-primary/40" />
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-sm font-semibold text-text-secondary">
                    Running simulation
                  </span>
                  <span
                    key={loadingMessage}
                    className="animate-fade-in max-w-[220px] text-center text-xs italic text-primary/60"
                  >
                    {loadingMessage}
                  </span>
                </div>
              </div>
            )}

            {simError && !isSimulating && (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
                <AlertCircle className="h-8 w-8 text-red-400" />
                <p className="max-w-sm text-center text-sm text-red-600">
                  {simError instanceof Error ? simError.message : 'Simulation failed'}
                </p>
              </div>
            )}

            {simResult && !isSimulating && (
              <SimulationResults result={simResult as SimulateResponse} />
            )}

            {!simResult && !isSimulating && !simError && (
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-transparent to-primary/[0.03] p-8 text-text-muted">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  <Sparkles className="h-6 w-6 text-primary/40" />
                </div>
                <p className="max-w-[200px] text-center text-sm leading-relaxed">
                  Adjust parameters on the left, then click{' '}
                  <strong className="text-primary">Simulate</strong> to see results
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
