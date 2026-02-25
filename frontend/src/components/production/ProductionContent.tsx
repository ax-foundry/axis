'use client';

import { Activity, BarChart3, LayoutDashboard, Loader2, MessageSquareText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { ExecutiveSummaryTab } from '@/components/monitoring/executive-summary';
import { PageHeader } from '@/components/ui/PageHeader';
import { SourceSelector } from '@/components/ui/SourceSelector';
import { useProductionOverview } from '@/lib/hooks/useProductionOverview';
import { useMonitoringStore } from '@/stores';

import { BusinessKPISection } from './BusinessKPISection';
import { CollapsibleSection } from './CollapsibleSection';
import { EmptyDataState } from './EmptyDataState';
import { AgentKPISection } from './kpi';
import { TechnicalKPISection } from './TechnicalKPISection';

import type { MetricCategoryTab } from '@/types';

export function ProductionContent() {
  const {
    signalsKPIs,
    signalsCaseCount,
    alertCount,
    hasMonitoringData,
    hasSignalsData,
    isLoading,
    monitoringData,
  } = useProductionOverview();

  const router = useRouter();
  const setActiveMetricCategoryTab = useMonitoringStore((s) => s.setActiveMetricCategoryTab);

  const handleNavigateToTab = useCallback(
    (tab: string) => {
      setActiveMetricCategoryTab(tab as MetricCategoryTab);
      router.push('/monitoring');
    },
    [setActiveMetricCategoryTab, router]
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={LayoutDashboard}
        title="Production Overview"
        subtitle="Unified view of AI quality monitoring and human signals metrics"
      />
      <SourceSelector scope={['monitoring', 'human_signals', 'kpi']} />

      {/* Content */}
      <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {/* Agent KPIs */}
        <CollapsibleSection icon={BarChart3} title="Agent KPIs">
          <AgentKPISection />
        </CollapsibleSection>

        {/* AI Quality Monitoring */}
        <CollapsibleSection
          icon={Activity}
          title="AI Quality Monitoring"
          headerRight={hasMonitoringData ? <TechnicalKPISection alertCount={alertCount} /> : null}
        >
          {hasMonitoringData ? (
            <>
              {monitoringData.length > 0 && (
                <ExecutiveSummaryTab data={monitoringData} onNavigateToTab={handleNavigateToTab} />
              )}
            </>
          ) : (
            <EmptyDataState
              icon={Activity}
              title="No Monitoring Data"
              description="Upload monitoring data or connect to a database to see AI quality metrics."
              linkTo="/monitoring"
              linkText="Go to Monitor"
            />
          )}
        </CollapsibleSection>

        {/* Human-in-the-Loop */}
        <CollapsibleSection icon={MessageSquareText} title="Human Signals">
          {hasSignalsData ? (
            <BusinessKPISection signalsKPIs={signalsKPIs} totalCases={signalsCaseCount} />
          ) : (
            <EmptyDataState
              icon={MessageSquareText}
              title="No Human Signals Data"
              description="Upload human signals data or connect to a database to see human signals metrics."
              linkTo="/human-signals"
              linkText="Go to Human Signals"
            />
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
}
