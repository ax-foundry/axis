'use client';

import { useUIStore } from '@/stores/ui-store';

import type { WalkthroughType } from '@/types';

interface TabConfig {
  id: WalkthroughType;
  label: string;
  shortLabel: string;
  description: string;
}

const tabs: TabConfig[] = [
  {
    id: 'single-turn',
    label: 'Single Turn',
    shortLabel: 'Single',
    description: 'Basic query-response evaluation',
  },
  {
    id: 'expected-output',
    label: 'With Expected Output',
    shortLabel: 'Expected',
    description: 'Compare against reference',
  },
  {
    id: 'multi-turn',
    label: 'Multi-Turn',
    shortLabel: 'Multi',
    description: 'Conversation context',
  },
  {
    id: 'rag',
    label: 'RAG Evaluation',
    shortLabel: 'RAG',
    description: 'Retrieval-augmented',
  },
  {
    id: 'workflow',
    label: 'Full Workflow',
    shortLabel: 'Workflow',
    description: 'End-to-end evaluation process',
  },
];

export function WalkthroughTabs() {
  const { learnWalkthroughType, setLearnWalkthroughType } = useUIStore();

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const isActive = learnWalkthroughType === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => setLearnWalkthroughType(tab.id)}
            className={`
              flex flex-col items-start rounded-xl border px-4 py-3 transition-all duration-200
              ${
                isActive
                  ? 'border-primary/30 bg-primary/10 shadow-sm'
                  : 'border-border bg-white hover:border-primary/20 hover:bg-gray-50'
              }
            `}
          >
            <span className={`font-medium ${isActive ? 'text-primary' : 'text-text-primary'}`}>
              {tab.label}
            </span>
            <span className="text-xs text-text-muted">{tab.description}</span>
          </button>
        );
      })}
    </div>
  );
}
