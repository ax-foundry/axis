'use client';

import { useMemo } from 'react';

import { usePlayback } from '@/lib/hooks/usePlayback';
import { useUIStore } from '@/stores/ui-store';

import { ExampleDataDisplay } from './ExampleDataDisplay';
import { FlowDiagram } from './FlowDiagram';
import { PlaybackControls } from './PlaybackControls';
import { getScenario } from './scenarios';
import { StepDetails } from './StepDetails';

export function WalkthroughViewer() {
  const { learnWalkthroughType, learnCurrentStep } = useUIStore();

  const scenario = useMemo(() => getScenario(learnWalkthroughType), [learnWalkthroughType]);

  const { play, pause, stop, stepForward, stepBackward, goToStep } = usePlayback(
    scenario.steps.length
  );

  const currentStep = scenario.steps[learnCurrentStep] || scenario.steps[0];

  // Determine which nodes and edges should be active based on current step
  const activeNodeIds = currentStep.highlightElements;
  const activeEdgeIds = useMemo(() => {
    // Activate edges that connect to highlighted nodes
    return scenario.flowEdges
      .filter((edge) => activeNodeIds.includes(edge.source) || activeNodeIds.includes(edge.target))
      .map((edge) => edge.id);
  }, [scenario.flowEdges, activeNodeIds]);

  // Determine which field to highlight in the example data
  const highlightField = useMemo(() => {
    if (currentStep.highlightElements.includes('input')) {
      return 'query';
    }
    if (currentStep.highlightElements.includes('process') && scenario.type === 'rag') {
      return 'retrievedContent';
    }
    if (
      currentStep.highlightElements.includes('judge') ||
      currentStep.highlightElements.includes('output')
    ) {
      return 'actualOutput';
    }
    return undefined;
  }, [currentStep, scenario.type]);

  return (
    <div className="space-y-6">
      {/* Scenario Header */}
      <div className="card bg-gradient-to-br from-gray-50 to-white">
        <h2 className="mb-2 text-xl font-semibold text-text-primary">{scenario.title}</h2>
        <p className="text-text-muted">{scenario.description}</p>
      </div>

      {/* Flow Diagram */}
      <FlowDiagram
        nodes={scenario.flowNodes}
        edges={scenario.flowEdges}
        activeNodeIds={activeNodeIds}
        activeEdgeIds={activeEdgeIds}
      />

      {/* Playback Controls */}
      <PlaybackControls
        totalSteps={scenario.steps.length}
        onPlay={play}
        onPause={pause}
        onStop={stop}
        onStepForward={stepForward}
        onStepBackward={stepBackward}
        onGoToStep={goToStep}
      />

      {/* Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Step Details */}
        <StepDetails
          step={currentStep}
          stepNumber={learnCurrentStep + 1}
          totalSteps={scenario.steps.length}
        />

        {/* Example Data */}
        <ExampleDataDisplay exampleData={scenario.exampleData} highlightField={highlightField} />
      </div>
    </div>
  );
}
