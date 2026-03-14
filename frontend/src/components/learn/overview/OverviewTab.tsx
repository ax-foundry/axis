'use client';

import { ArrowRight, PlayCircle, Layers, Shield } from 'lucide-react';

import { useUIStore } from '@/stores/ui-store';

import type { LearnMainTab } from '@/types';

interface GuideCardConfig {
  id: LearnMainTab;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}

const guideCards: GuideCardConfig[] = [
  {
    id: 'walkthrough',
    title: 'Interactive Walkthrough',
    description:
      'Step through evaluation scenarios — see how data flows from test input to scored output.',
    icon: PlayCircle,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    id: 'methods',
    title: 'Evaluation Methods',
    description:
      'LLM-as-Judge, human evaluation, automated metrics, and the hybrid flywheel approach.',
    icon: Layers,
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  {
    id: 'best-practices',
    title: 'Best Practices',
    description: 'Ground truth, binary criteria, judge calibration, and the evaluation flywheel.',
    icon: Shield,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
];

export function OverviewTab() {
  const { setLearnMainTab } = useUIStore();

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="rounded-xl border border-border bg-surface px-5 py-4">
        <h2 className="mb-1 text-sm font-semibold text-text-primary">Getting Started</h2>
        <p className="text-xs text-text-muted">
          AI evaluation is the systematic process of assessing agent quality, safety, and alignment.
          These guides cover the core concepts — from choosing the right evaluation method to
          building a continuous feedback loop.
        </p>
      </div>

      {/* Navigation cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {guideCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              onClick={() => setLearnMainTab(card.id)}
              className="group flex flex-col rounded-xl border border-border bg-surface p-4 text-left transition-all hover:border-primary/30 hover:shadow-md"
            >
              <div
                className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${card.bg}`}
              >
                <Icon className={`h-[18px] w-[18px] ${card.color}`} />
              </div>
              <h3 className="text-sm font-semibold text-text-primary">{card.title}</h3>
              <p className="mt-1 flex-1 text-xs text-text-muted">{card.description}</p>
              <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Explore
                <ArrowRight className="h-3 w-3" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
