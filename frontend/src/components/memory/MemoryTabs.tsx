'use client';

import { BarChart3, CheckCircle, Layers, Network, OctagonX } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useMemoryStore } from '@/stores/memory-store';

import type { MemoryTab } from '@/types/memory';

const tabs: Array<{ id: MemoryTab; label: string; icon: typeof BarChart3 }> = [
  { id: 'rules', label: 'Rules', icon: BarChart3 },
  { id: 'quality', label: 'Decision Quality', icon: CheckCircle },
  { id: 'hard-stops', label: 'Hard Stops', icon: OctagonX },
  { id: 'knowledge-graph', label: 'Knowledge Graph', icon: Network },
  { id: 'batches', label: 'Batches', icon: Layers },
];

export function MemoryTabs() {
  const { activeTab, setActiveTab } = useMemoryStore();

  return (
    <div className="border-border/50 flex gap-1 border-b pb-0">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'border-b-2 border-primary bg-primary/5 text-primary'
                : 'text-text-muted hover:bg-gray-50 hover:text-text-primary'
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
