'use client';

import {
  BarChart3,
  PieChart,
  GitBranch,
  Workflow,
  FileText,
  MessageSquare,
  Tag,
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useCallback } from 'react';

import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';

import { ConversationAnalysisTab } from './ConversationAnalysisTab';
import { MetadataBreakdownTab } from './MetadataBreakdownTab';
import { MetricTradeoffsTab } from './MetricTradeoffsTab';
import { OverviewTab } from './OverviewTab';
import { ResponseAnalysisTab } from './ResponseAnalysisTab';
import { ScoreDistributionTab } from './ScoreDistributionTab';
import { TreeTab } from './TreeTab';

import type { VisualizeSubTab } from '@/stores/ui-store';

const subTabs: Array<{
  id: VisualizeSubTab;
  label: string;
  icon: typeof BarChart3;
  description: string;
}> = [
  { id: 'overview', label: 'Overview', icon: BarChart3, description: 'KPIs and summary charts' },
  { id: 'distribution', label: 'Distribution', icon: PieChart, description: 'Score distributions' },
  { id: 'tradeoffs', label: 'Tradeoffs', icon: Workflow, description: 'Metric correlations' },
  { id: 'tree', label: 'Tree', icon: GitBranch, description: 'Hierarchical view' },
  { id: 'response', label: 'Response', icon: FileText, description: 'Response length analysis' },
  {
    id: 'conversation',
    label: 'Conversation',
    icon: MessageSquare,
    description: 'Turn count analysis',
  },
  { id: 'metadata', label: 'Metadata', icon: Tag, description: 'Breakdown by metadata' },
];

export function VisualizeTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const { visualizeSubTab, setVisualizeSubTab } = useUIStore();

  // Handle tab click with URL sync
  const handleTabClick = useCallback(
    (tabId: VisualizeSubTab) => {
      if (tabId !== visualizeSubTab) {
        setVisualizeSubTab(tabId);
        // Only update URL if we're on the deep-dive page
        if (pathname.includes('/evaluate/deep-dive')) {
          router.replace(`/evaluate/deep-dive?tab=${tabId}`, { scroll: false });
        }
      }
    },
    [visualizeSubTab, setVisualizeSubTab, router, pathname]
  );

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 rounded-xl bg-gray-100/80 p-1">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === visualizeSubTab;

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                'flex flex-1 items-center gap-2 rounded-lg px-4 py-2.5 transition-all duration-200',
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-muted hover:bg-white/50 hover:text-text-primary'
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-[500px]">
        {visualizeSubTab === 'overview' && <OverviewTab />}
        {visualizeSubTab === 'distribution' && <ScoreDistributionTab />}
        {visualizeSubTab === 'tradeoffs' && <MetricTradeoffsTab />}
        {visualizeSubTab === 'tree' && <TreeTab />}
        {visualizeSubTab === 'response' && <ResponseAnalysisTab />}
        {visualizeSubTab === 'conversation' && <ConversationAnalysisTab />}
        {visualizeSubTab === 'metadata' && <MetadataBreakdownTab />}
      </div>
    </div>
  );
}
