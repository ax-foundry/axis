'use client';

import { BookOpen, PlayCircle, Layers, Shield } from 'lucide-react';

import { useUIStore } from '@/stores/ui-store';

import { BestPracticesTab } from './best-practices';
import { MethodsTab } from './methods';
import { OverviewTab } from './overview';
import { InteractiveWalkthroughTab } from './walkthrough';

import type { LearnMainTab } from '@/types';

interface TabConfig {
  id: LearnMainTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const tabs: TabConfig[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: BookOpen,
    description: 'Introduction and key concepts',
  },
  {
    id: 'walkthrough',
    label: 'Interactive Walkthrough',
    icon: PlayCircle,
    description: 'Step-by-step evaluation flow',
  },
  {
    id: 'methods',
    label: 'Methods',
    icon: Layers,
    description: 'Evaluation approaches',
  },
  {
    id: 'best-practices',
    label: 'Best Practices',
    icon: Shield,
    description: 'Tips and common pitfalls',
  },
];

export function LearnTabs() {
  const { learnMainTab, setLearnMainTab } = useUIStore();

  const renderTabContent = () => {
    switch (learnMainTab) {
      case 'overview':
        return <OverviewTab />;
      case 'walkthrough':
        return <InteractiveWalkthroughTab />;
      case 'methods':
        return <MethodsTab />;
      case 'best-practices':
        return <BestPracticesTab />;
      default:
        return <OverviewTab />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 rounded-lg bg-gray-100/80 p-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = learnMainTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setLearnMainTab(tab.id)}
              className={`
                flex items-center gap-2 rounded-lg px-4 py-2.5 font-medium transition-all duration-200
                ${
                  isActive
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-text-secondary hover:bg-gray-50 hover:text-text-primary'
                }
              `}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="animate-fade-in-up">{renderTabContent()}</div>
    </div>
  );
}
