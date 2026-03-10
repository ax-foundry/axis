'use client';

import { WalkthroughTabs } from './WalkthroughTabs';
import { WalkthroughViewer } from './WalkthroughViewer';

export function InteractiveWalkthroughTab() {
  return (
    <div className="space-y-6">
      {/* Scenario selector + viewer */}
      <WalkthroughTabs />
      <WalkthroughViewer />
    </div>
  );
}
