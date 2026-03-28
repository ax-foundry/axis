'use client';

import { BarChart3, Database, Loader2, Settings, TrendingUp } from 'lucide-react';
import Link from 'next/link';

import { AgentKPISection } from '@/components/production/kpi';
import { PageHeader } from '@/components/ui/PageHeader';
import { SourceSelector } from '@/components/ui/SourceSelector';
import { useKpiStore } from '@/stores';

function SyncingState({ message }: { message: string }) {
  return (
    <div className="min-h-screen">
      <KpiPageHeader />
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="card p-8">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              </div>
              <h2 className="mb-2 text-xl font-semibold text-text-primary">{message}</h2>
              <p className="max-w-md text-sm text-text-muted">
                KPI data is being loaded from your configured data sources
              </p>
              <div className="mt-4 flex items-center gap-2 text-sm text-primary">
                <Database className="h-4 w-4" />
                <span>Syncing from database</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="min-h-screen">
      <KpiPageHeader />
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="card p-8">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <h2 className="mb-2 text-xl font-semibold text-text-primary">
                No KPI Data Available
              </h2>
              <p className="max-w-md text-sm text-text-muted">
                KPI data syncs automatically from configured data sources. Ensure your backend KPI
                database is configured and the sync engine is running.
              </p>
              <Link
                href="/settings"
                className="mt-4 flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark"
              >
                <Settings className="h-4 w-4" />
                <span>Check Settings</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiPageHeader() {
  return (
    <PageHeader
      icon={TrendingUp}
      title="Agent KPIs"
      subtitle="Track agent performance metrics and trends"
    />
  );
}

export default function KpiPage() {
  const datasetReady = useKpiStore((s) => s.datasetReady);
  const syncStatus = useKpiStore((s) => s.syncStatus);
  const storeStatusChecked = useKpiStore((s) => s.storeStatusChecked);

  // Still checking DuckDB status
  if (!storeStatusChecked) {
    const message =
      syncStatus?.state === 'syncing' ? 'Syncing KPI data...' : 'Checking KPI data status...';
    return <SyncingState message={message} />;
  }

  // Checked but no data available
  if (!datasetReady) {
    return <EmptyState />;
  }

  // Dashboard
  return (
    <div className="min-h-screen">
      <KpiPageHeader />
      <SourceSelector scope={['kpi']} />
      <div className="mx-auto max-w-7xl px-6 py-6">
        <AgentKPISection hideInternalLoadingStates />
      </div>
    </div>
  );
}
