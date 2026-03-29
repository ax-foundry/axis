'use client';

import { Loader2, X } from 'lucide-react';
import { useCallback, useEffect } from 'react';

import { useKpiCaseProfile } from '@/lib/hooks/useKpiData';
import { formatKpiValue } from '@/lib/kpi-format';
import { cn } from '@/lib/utils';

import type { KpiCaseKpiValue, KpiUnit } from '@/types';

interface KPICaseProfileModalProps {
  datasetId: string;
  onClose: () => void;
}

function MetaItem({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="text-xs">
      <span className="text-text-muted">{label}: </span>
      <span className="font-medium text-text-secondary">{value}</span>
    </div>
  );
}

function KpiValueCard({ kpi }: { kpi: KpiCaseKpiValue }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2 dark:bg-gray-900">
      <span className="text-xs text-text-secondary">{kpi.display_name}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold text-text-primary">
          {formatKpiValue(kpi.numeric_value, kpi.unit as KpiUnit)}
        </span>
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-text-muted dark:bg-gray-800">
          {kpi.unit}
        </span>
      </div>
    </div>
  );
}

export function KPICaseProfileModal({ datasetId, onClose }: KPICaseProfileModalProps) {
  const { data, isLoading } = useKpiCaseProfile(datasetId, true);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Group KPIs by category
  const grouped = (data?.kpis ?? []).reduce(
    (acc, kpi) => {
      const cat = kpi.kpi_category ?? 'Other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(kpi);
      return acc;
    },
    {} as Record<string, KpiCaseKpiValue[]>
  );

  const categoryOrder = Object.keys(grouped).sort();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[5vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Case Profile</h2>
            <p className="mt-0.5 font-mono text-xs text-text-muted">{datasetId}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary dark:hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="ml-2 text-sm text-text-muted">Loading case profile...</span>
          </div>
        ) : !data || data.kpis.length === 0 ? (
          <div className="py-16 text-center text-sm text-text-muted">
            No KPI data found for this case
          </div>
        ) : (
          <div className="space-y-4 p-5">
            {/* Meta row */}
            <div className="flex flex-wrap gap-4 rounded-lg bg-gray-50 px-4 py-2.5 dark:bg-gray-900">
              <MetaItem
                label="Date"
                value={
                  data.created_at
                    ? new Date(data.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : null
                }
              />
              <MetaItem label="Segment" value={data.segment} />
              <MetaItem label="Component" value={data.source_component} />
              <MetaItem label="Environment" value={data.environment} />
            </div>

            {/* KPI values by category */}
            {categoryOrder.map((cat) => (
              <div key={cat}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {cat.replace(/_/g, ' ')}
                </h3>
                <div className={cn('grid gap-2', grouped[cat].length > 1 ? 'grid-cols-2' : '')}>
                  {grouped[cat].map((kpi) => (
                    <KpiValueCard key={kpi.kpi_name} kpi={kpi} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
