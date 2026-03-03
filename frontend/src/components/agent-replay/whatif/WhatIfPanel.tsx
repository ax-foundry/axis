'use client';

import { AlertCircle, Cpu, FlaskConical, Loader2, X } from 'lucide-react';
import { useEffect } from 'react';

import { useRunSimulation, useStepFixture } from '@/lib/hooks/useReplayData';
import { useReplayStore } from '@/stores/replay-store';

import { SimulationResults } from './SimulationResults';
import { VariableEditor } from './VariableEditor';

import type { SimulateResponse } from '@/types/replay';

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

  const handleExit = () => {
    resetSimulation();
    exitWhatIf();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-primary/20 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 bg-primary px-4 py-2.5">
        <FlaskConical className="h-4 w-4 text-white" />
        <h3 className="text-xs font-bold text-white">What-If Simulator</h3>
        {nodeName && (
          <span className="truncate rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white/90">
            {nodeName}
          </span>
        )}
        <button
          onClick={handleExit}
          className="ml-auto rounded-md p-1 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
          title="Exit What-If"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      {fixtureLoading && (
        <div className="flex flex-1 items-center justify-center gap-2 text-text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
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
          <div className="min-w-0 border-b border-border lg:border-b-0 lg:border-r">
            <VariableEditor
              fixture={fixture}
              onSimulate={handleSimulate}
              isSimulating={isSimulating}
            />
          </div>

          {/* Right: Results */}
          <div className="min-w-0">
            {isSimulating && (
              <div className="flex h-full items-center justify-center gap-2 text-text-muted">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm">Running simulation...</span>
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
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-text-muted">
                <FlaskConical className="h-8 w-8 text-primary/20" />
                <p className="text-center text-sm">
                  Adjust parameters on the left, then click <strong>Simulate</strong> to see results
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
