'use client';

import { WalkthroughTabs } from './WalkthroughTabs';
import { WalkthroughViewer } from './WalkthroughViewer';

export function InteractiveWalkthroughTab() {
  return (
    <div className="space-y-6">
      {/* Scenario Selection */}
      <div className="rounded-xl border border-border bg-white p-5">
        <h3 className="mb-2 text-sm font-semibold text-text-primary">
          Choose an Evaluation Scenario
        </h3>
        <p className="mb-4 text-sm text-text-muted">
          Select a scenario to see how data flows through the evaluation pipeline. Each scenario
          highlights different aspects of the evaluation process.
        </p>
        <WalkthroughTabs />
      </div>

      {/* Walkthrough Viewer */}
      <WalkthroughViewer />
    </div>
  );
}
