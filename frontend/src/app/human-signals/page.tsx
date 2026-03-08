'use client';

import { Database, Loader2, MessageSquareText, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { FileUpload } from '@/components/file-upload';
import {
  DynamicKPIStrip,
  DynamicFilters,
  DynamicChartSection,
  DynamicCaseTable,
  SignalsCaseDetailModal,
} from '@/components/human-signals';
import { PageHeader } from '@/components/ui/PageHeader';
import { SourceSelector } from '@/components/ui/SourceSelector';
import { TimeRangeSelector } from '@/components/ui/TimeRangeSelector';
import { getStoreStatus } from '@/lib/api';
import {
  useHumanSignalsAutoImport,
  useHumanSignalsDBConfig,
} from '@/lib/hooks/useHumanSignalsUpload';
import { computeKPIs, filterSignalsCases } from '@/lib/human-signals-utils';
import { useHumanSignalsStore } from '@/stores';

import type { HumanSignalsTimeRangePreset } from '@/stores/human-signals-store';

const SIGNALS_TIME_PRESETS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '6m', label: 'Last 6 months' },
  { value: '1y', label: 'Last year' },
  { value: 'custom', label: 'Custom range' },
];

// ============================
// Shared Sub-Components
// ============================

function HumanSignalsHeader() {
  return (
    <PageHeader
      icon={MessageSquareText}
      title="Human Signals"
      subtitle="Human-in-the-loop insights and operational metrics"
    />
  );
}

function AutoConnectLoading() {
  return (
    <div className="min-h-screen">
      <HumanSignalsHeader />
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="card p-8">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              </div>
              <h2 className="mb-2 text-xl font-semibold text-text-primary">
                Connecting to Database...
              </h2>
              <p className="max-w-md text-sm text-text-muted">
                Auto-importing human signals data from configured database
              </p>
              <div className="mt-4 flex items-center gap-2 text-sm text-primary">
                <Database className="h-4 w-4" />
                <span>Auto-connect enabled</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  isAutoConnecting,
  autoConnectError,
  onRetryAutoConnect,
}: {
  isAutoConnecting: boolean;
  autoConnectError: string | null;
  onRetryAutoConnect?: () => void;
}) {
  if (isAutoConnecting) return <AutoConnectLoading />;

  return (
    <div className="min-h-screen">
      <HumanSignalsHeader />
      <div className="mx-auto max-w-7xl px-6 py-8">
        {autoConnectError && (
          <div className="mx-auto mb-6 max-w-2xl">
            <div className="border-warning/30 bg-warning/10 flex items-center gap-3 rounded-lg border px-4 py-3">
              <Database className="h-5 w-5 flex-shrink-0 text-warning" />
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">
                  Database auto-connect failed
                </p>
                <p className="text-xs text-text-muted">{autoConnectError}</p>
              </div>
              {onRetryAutoConnect && (
                <button
                  onClick={onRetryAutoConnect}
                  className="bg-warning/20 hover:bg-warning/30 rounded-lg px-3 py-1.5 text-xs font-medium text-warning"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}
        <div className="mx-auto max-w-2xl">
          <div className="card p-8">
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <h2 className="mb-2 text-xl font-semibold text-text-primary">
                Import Human Signals Data
              </h2>
              <p className="max-w-md text-sm text-text-muted">
                Upload a human signals CSV file with multi-metric feedback data to analyze
                human-in-the-loop interactions, interventions, and learnings.
              </p>
            </div>
            <FileUpload targetStore="human_signals" />
            <div className="mt-6 rounded-lg border border-border bg-gray-50 p-4">
              <p className="mb-2 text-xs font-medium text-text-muted">Expected format columns:</p>
              <div className="flex flex-wrap gap-2">
                {['metric_name', 'dataset_id', 'signals', 'conversation', 'timestamp'].map(
                  (col) => (
                    <span
                      key={col}
                      className="rounded bg-white px-2 py-1 font-mono text-xs text-text-secondary shadow-sm"
                    >
                      {col}
                    </span>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================
// Dashboard
// ============================

function Dashboard() {
  const {
    cases,
    displayConfig,
    metricSchema,
    selectedSourceName,
    selectedSourceComponent,
    selectedEnvironment,
    metricFilters,
    timeRange,
    selectedCaseId,
    caseDetailModalOpen,
    setTimeRange,
    setTimeRangePreset,
    openCaseDetail,
    closeCaseDetail,
  } = useHumanSignalsStore();

  const filteredCases = useMemo(
    () =>
      filterSignalsCases(cases, {
        sourceName: selectedSourceName || undefined,
        sourceComponent: selectedSourceComponent || undefined,
        environment: selectedEnvironment || undefined,
        metricFilters,
        startDate: timeRange.startDate,
        endDate: timeRange.endDate,
      }),
    [
      cases,
      selectedSourceName,
      selectedSourceComponent,
      selectedEnvironment,
      metricFilters,
      timeRange,
    ]
  );

  const kpis = useMemo(
    () => (displayConfig ? computeKPIs(filteredCases, displayConfig.kpi_strip) : []),
    [filteredCases, displayConfig]
  );

  const selectedCase = useMemo(
    () => (selectedCaseId ? filteredCases.find((c) => c.Case_ID === selectedCaseId) : null),
    [filteredCases, selectedCaseId]
  );

  if (!displayConfig || !metricSchema) return null;

  return (
    <>
      {/* Time range */}
      <div className="mb-5 flex items-center justify-end">
        <TimeRangeSelector
          presets={SIGNALS_TIME_PRESETS}
          selectedPreset={timeRange.preset}
          startDate={timeRange.startDate}
          endDate={timeRange.endDate}
          onPresetChange={(p) => setTimeRangePreset(p as HumanSignalsTimeRangePreset)}
          onCustomChange={(start, end) =>
            setTimeRange({ preset: 'custom', startDate: start, endDate: end })
          }
          size="md"
        />
      </div>

      {/* KPI Strip */}
      <div className="mb-5">
        <DynamicKPIStrip kpis={kpis} />
      </div>

      {/* Filters */}
      <div className="mb-5">
        <DynamicFilters displayConfig={displayConfig} />
      </div>

      {/* Charts */}
      <div className="mb-5">
        <DynamicChartSection cases={filteredCases} displayConfig={displayConfig} />
      </div>

      {/* Cases Table */}
      <DynamicCaseTable
        cases={filteredCases}
        columns={displayConfig.table_columns}
        displayConfig={displayConfig}
        onViewCase={openCaseDetail}
      />

      {/* Case Detail Modal */}
      {caseDetailModalOpen && selectedCase && (
        <SignalsCaseDetailModal
          caseRecord={selectedCase}
          metricSchema={metricSchema}
          displayConfig={displayConfig}
          onClose={closeCaseDetail}
        />
      )}
    </>
  );
}

// ============================
// Main Page Component
// ============================

export default function HumanSignalsPage() {
  const hasData = useHumanSignalsStore((s) => s.cases.length > 0);
  const datasetReady = useHumanSignalsStore((s) => s.datasetReady);
  const storeIsLoading = useHumanSignalsStore((s) => s.isLoading);
  const setSyncStatus = useHumanSignalsStore((s) => s.setSyncStatus);

  // Auto-connect hooks
  const { data: dbConfig, isLoading: isLoadingConfig } = useHumanSignalsDBConfig();
  const autoImportMutation = useHumanSignalsAutoImport();

  const [hasAttemptedAutoConnect, setHasAttemptedAutoConnect] = useState(false);
  const [autoConnectError, setAutoConnectError] = useState<string | null>(null);
  const [storeStatusChecked, setStoreStatusChecked] = useState(false);

  // Check DuckDB store status on mount
  useEffect(() => {
    let cancelled = false;
    getStoreStatus()
      .then((status) => {
        if (cancelled) return;
        const ds = status.datasets?.human_signals_raw;
        if (ds) {
          setSyncStatus(ds);
        }
        setStoreStatusChecked(true);
      })
      .catch(() => {
        if (!cancelled) setStoreStatusChecked(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      storeStatusChecked &&
      !datasetReady &&
      dbConfig &&
      (dbConfig.auto_connect || dbConfig.auto_load) &&
      !hasAttemptedAutoConnect &&
      !hasData &&
      !autoImportMutation.isPending &&
      !storeIsLoading
    ) {
      setHasAttemptedAutoConnect(true);
      setAutoConnectError(null);
      autoImportMutation.mutate(undefined, {
        onError: (error) => {
          setAutoConnectError(
            error instanceof Error ? error.message : 'Failed to connect to database'
          );
        },
      });
    }
  }, [
    storeStatusChecked,
    datasetReady,
    dbConfig,
    hasAttemptedAutoConnect,
    hasData,
    autoImportMutation,
    storeIsLoading,
  ]);

  const handleRetryAutoConnect = () => {
    setAutoConnectError(null);
    autoImportMutation.mutate(undefined, {
      onError: (error) => {
        setAutoConnectError(
          error instanceof Error ? error.message : 'Failed to connect to database'
        );
      },
    });
  };

  const isAutoConnecting =
    !hasData &&
    (!storeStatusChecked ||
      autoImportMutation.isPending ||
      isLoadingConfig ||
      (storeIsLoading &&
        (dbConfig === undefined || dbConfig?.auto_connect || dbConfig?.auto_load)));

  // When DuckDB has data but cases aren't loaded yet, show loading
  // Guard: only while something is actually loading — prevents infinite spinner on import failure
  if (!hasData && datasetReady && (storeIsLoading || isLoadingConfig || !storeStatusChecked)) {
    return <AutoConnectLoading />;
  }

  if (!hasData) {
    return (
      <EmptyState
        isAutoConnecting={isAutoConnecting}
        autoConnectError={autoConnectError}
        onRetryAutoConnect={handleRetryAutoConnect}
      />
    );
  }

  return (
    <div className="min-h-screen">
      <HumanSignalsHeader />
      <SourceSelector scope={['human_signals']} />
      <div className="mx-auto max-w-7xl px-6 py-6">
        <Dashboard />
      </div>
    </div>
  );
}
