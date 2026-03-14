'use client';

import { BookOpen, PlayCircle, Layers, Shield, ListChecks, BarChart3 } from 'lucide-react';

import { useUIStore } from '@/stores/ui-store';

import { BestPracticesTab } from './best-practices';
import { KPIDefinitionsSection } from './KPIDefinitionsSection';
import { MethodsTab } from './methods';
import { MetricDefinitionsSection } from './MetricDefinitionsSection';
import { OverviewTab } from './overview';
import { InteractiveWalkthroughTab } from './walkthrough';

import type { LearnMainTab, LearnTopTab } from '@/types';

interface TopTabConfig {
  id: LearnTopTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const topTabs: TopTabConfig[] = [
  { id: 'metric-definitions', label: 'Metric Definitions', icon: ListChecks },
  { id: 'kpi-definitions', label: 'KPI Definitions', icon: BarChart3 },
  { id: 'guides', label: 'Guides', icon: BookOpen },
];

interface GuideTabConfig {
  id: LearnMainTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const guideTabs: GuideTabConfig[] = [
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
  const { learnTopTab, setLearnTopTab, learnMainTab, setLearnMainTab } = useUIStore();

  const renderGuideContent = () => {
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
      {/* Top-level tab navigation (underline style) */}
      <div className="flex gap-6 border-b border-border">
        {topTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = learnTopTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setLearnTopTab(tab.id)}
              className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {learnTopTab === 'metric-definitions' ? (
        <div className="animate-fade-in-up">
          <MetricDefinitionsSection />
        </div>
      ) : learnTopTab === 'kpi-definitions' ? (
        <div className="animate-fade-in-up">
          <KPIDefinitionsSection />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Inner guide tab navigation (pill style) */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-gray-50 p-1 dark:bg-gray-900">
            {guideTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = learnMainTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setLearnMainTab(tab.id)}
                  className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-surface text-text-primary shadow-sm'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Guide content */}
          <div className="animate-fade-in-up">{renderGuideContent()}</div>
        </div>
      )}
    </div>
  );
}
