'use client';

import { Activity, AlertCircle, BarChart3, FileText } from 'lucide-react';

import { cn } from '@/lib/utils';
import { type MetricCategoryTab } from '@/types';

interface TabConfig {
  id: MetricCategoryTab;
  label: string;
  icon: React.ElementType;
  description: string;
}

const TABS: TabConfig[] = [
  {
    id: 'score',
    label: 'Score Metrics',
    icon: Activity,
    description: 'Numeric 0-1 scores with trends and distributions',
  },
  {
    id: 'classification',
    label: 'Classification',
    icon: BarChart3,
    description: 'Categorical labels with value counts',
  },
  {
    id: 'analysis',
    label: 'Analysis Insights',
    icon: FileText,
    description: 'Structured evaluation signals and reasoning',
  },
  {
    id: 'alerts',
    label: 'Alerts',
    icon: AlertCircle,
    description: 'Active alerts and threshold violations',
  },
];

interface MetricCategoryTabsProps {
  activeTab: MetricCategoryTab;
  onTabChange: (tab: MetricCategoryTab) => void;
  alertCount?: number;
  hasClassificationMetrics?: boolean;
  hasAnalysisMetrics?: boolean;
}

export function MetricCategoryTabs({
  activeTab,
  onTabChange,
  alertCount = 0,
  hasClassificationMetrics = false,
  hasAnalysisMetrics = false,
}: MetricCategoryTabsProps) {
  // Filter tabs based on available data
  const availableTabs = TABS.filter((tab) => {
    if (tab.id === 'classification' && !hasClassificationMetrics) return false;
    if (tab.id === 'analysis' && !hasAnalysisMetrics) return false;
    return true;
  });

  return (
    <div className="border-b border-border bg-white">
      <div className="flex items-center gap-1 px-2">
        {availableTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const showBadge = tab.id === 'alerts' && alertCount > 0;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'relative flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-muted hover:border-gray-200 hover:text-text-primary'
              )}
              title={tab.description}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              {showBadge && (
                <span
                  className={cn(
                    'flex h-4 min-w-[16px] items-center justify-center rounded px-1 text-[10px] font-bold',
                    isActive ? 'bg-primary text-white' : 'bg-error text-white'
                  )}
                >
                  {alertCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
