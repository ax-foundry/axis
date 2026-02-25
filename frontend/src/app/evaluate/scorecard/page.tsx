'use client';

import { Award, Upload } from 'lucide-react';

import { ScorecardTab } from '@/components/evaluate/visualize/scorecard';
import { EmptyState } from '@/components/shared/EmptyState';
import { useDataStore } from '@/stores';

export default function ScorecardPage() {
  const { data, isLoading } = useDataStore();
  const hasData = data.length > 0;

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
        description="Upload evaluation data to view the scorecard"
        action={{ label: 'Go to Upload', href: '/evaluate/upload' }}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Award className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Scorecard</h2>
          <p className="text-sm text-text-muted">Executive summary with hierarchical metrics</p>
        </div>
      </div>

      <ScorecardTab />
    </div>
  );
}
