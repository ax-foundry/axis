'use client';

import { Search, Upload } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { VisualizeTabs } from '@/components/evaluate/visualize/VisualizeTabs';
import { EmptyState } from '@/components/shared/EmptyState';
import { useDataStore, useUIStore } from '@/stores';

import type { VisualizeSubTab } from '@/stores/ui-store';

// Valid tabs - must match VisualizeSubTab type in ui-store.ts
const VALID_TABS = [
  'overview',
  'distribution',
  'tradeoffs',
  'tree',
  'response',
  'conversation',
  'metadata',
] as const;

export default function DeepDivePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data, isLoading } = useDataStore();
  const { visualizeSubTab, setVisualizeSubTab } = useUIStore();
  const hasData = data.length > 0;

  // URL → Store (on mount only)
  useEffect(() => {
    const urlTab = searchParams.get('tab');
    if (urlTab && VALID_TABS.includes(urlTab as VisualizeSubTab) && urlTab !== visualizeSubTab) {
      setVisualizeSubTab(urlTab as VisualizeSubTab);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- Only run on mount

  // Store → URL (when tab changes after mount)
  useEffect(() => {
    const urlTab = searchParams.get('tab');
    // Only update URL if the current tab differs from URL
    if (visualizeSubTab && visualizeSubTab !== urlTab) {
      router.replace(`/evaluate/deep-dive?tab=${visualizeSubTab}`, { scroll: false });
    }
  }, [visualizeSubTab, router, searchParams]);

  if (!hasData) {
    if (isLoading) {
      return (
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      );
    }

    return (
      <EmptyState
        icon={Upload}
        title="No data loaded"
        description="Upload evaluation data to explore detailed analysis"
        action={{ label: 'Go to Upload', href: '/evaluate/upload' }}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
          <Search className="h-5 w-5 text-blue-500" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Deep Dive</h2>
          <p className="text-sm text-text-muted">
            Detailed analysis and interactive visualizations
          </p>
        </div>
      </div>

      <VisualizeTabs />
    </div>
  );
}
