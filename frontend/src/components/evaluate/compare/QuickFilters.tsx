'use client';

import { TrendingUp, TrendingDown, Activity, List, GitCompare } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';

import type { CompareQuickFilter } from '@/stores/ui-store';

const filters: Array<{
  id: CompareQuickFilter;
  label: string;
  icon: typeof List;
  description: string;
}> = [
  { id: 'all', label: 'All', icon: List, description: 'Show all test cases' },
  { id: 'top20', label: 'Top 20%', icon: TrendingUp, description: 'Highest performing' },
  { id: 'bottom20', label: 'Bottom 20%', icon: TrendingDown, description: 'Lowest performing' },
  {
    id: 'highVariance',
    label: 'High Variance',
    icon: Activity,
    description: 'Inconsistent scores',
  },
  {
    id: 'showDiff',
    label: 'Show Diff',
    icon: GitCompare,
    description: 'Test cases with significant experiment differences',
  },
];

export function QuickFilters() {
  const { compareQuickFilter, setCompareQuickFilter } = useUIStore();

  return (
    <div className="flex items-center gap-2">
      {filters.map((filter) => {
        const Icon = filter.icon;
        const isActive = filter.id === compareQuickFilter;

        return (
          <button
            key={filter.id}
            onClick={() => setCompareQuickFilter(filter.id)}
            title={filter.description}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all',
              isActive
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-white text-text-secondary hover:border-primary hover:text-primary'
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{filter.label}</span>
          </button>
        );
      })}
    </div>
  );
}
