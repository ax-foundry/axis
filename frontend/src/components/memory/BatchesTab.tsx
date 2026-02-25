'use client';

import { Layers } from 'lucide-react';
import { useMemo } from 'react';

import { useFilteredMemoryData } from '@/lib/hooks/useFilteredMemoryData';
import { getField } from '@/lib/hooks/useMemoryConfig';

import type { MemoryBatchInfo } from '@/types/memory';

export function BatchesTab() {
  const data = useFilteredMemoryData();

  const batches = useMemo<MemoryBatchInfo[]>(() => {
    const groups: Record<string, typeof data> = {};
    for (const rule of data) {
      const bid = getField(rule, 'batch') || 'unknown';
      if (!groups[bid]) groups[bid] = [];
      groups[bid].push(rule);
    }

    return Object.entries(groups).map(([bid, rules]) => {
      const statuses: Record<string, number> = {};
      for (const r of rules) {
        const s = getField(r, 'status') || 'unknown';
        statuses[s] = (statuses[s] || 0) + 1;
      }
      const cats = Array.from(
        new Set(rules.map((r) => getField(r, 'category')).filter(Boolean))
      ).sort();
      const dates = rules.map((r) => getField(r, 'created_at')).filter(Boolean);
      const earliest = dates.length > 0 ? dates.sort()[0] : '';

      return {
        batch_id: bid,
        rules_count: rules.length,
        created_at: earliest,
        statuses,
        risk_categories: cats,
      };
    });
  }, [data]);

  if (batches.length === 0) {
    return <div className="py-8 text-center text-sm text-text-muted">No batches found.</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">Pipeline batch history and ingestion progress.</p>

      <div className="max-h-[600px] space-y-4 overflow-y-auto">
        {batches.map((batch) => {
          const total = batch.rules_count;
          const ingested = batch.statuses['ingested'] ?? 0;
          const pending = batch.statuses['pending'] ?? 0;
          const failed = batch.statuses['failed'] ?? 0;
          const pctIngested = total > 0 ? (ingested / total) * 100 : 0;
          const pctPending = total > 0 ? (pending / total) * 100 : 0;
          const pctFailed = total > 0 ? (failed / total) * 100 : 0;

          return (
            <div key={batch.batch_id} className="rounded-lg border border-border bg-white p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Layers className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-mono text-sm font-medium text-text-primary">
                      {batch.batch_id.slice(0, 8)}...
                    </div>
                    <div className="text-xs text-text-muted">
                      {batch.created_at
                        ? new Date(batch.created_at).toLocaleString()
                        : 'Unknown date'}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-text-primary">{batch.rules_count}</div>
                  <div className="text-xs text-text-muted">rules</div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-xs text-text-muted">
                  <span>Ingestion Progress</span>
                  <span>{Math.round(pctIngested)}%</span>
                </div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-gray-200">
                  {pctIngested > 0 && (
                    <div
                      className="bg-green-500 transition-all"
                      style={{ width: `${pctIngested}%` }}
                    />
                  )}
                  {pctPending > 0 && (
                    <div
                      className="bg-gray-400 transition-all"
                      style={{ width: `${pctPending}%` }}
                    />
                  )}
                  {pctFailed > 0 && (
                    <div className="bg-red-500 transition-all" style={{ width: `${pctFailed}%` }} />
                  )}
                </div>

                {/* Status counts */}
                <div className="mt-2 flex gap-4 text-xs">
                  {Object.entries(batch.statuses).map(([status, count]) => {
                    const colors: Record<string, string> = {
                      ingested: 'text-green-600',
                      pending: 'text-gray-500',
                      failed: 'text-red-500',
                    };
                    return (
                      <span key={status} className={colors[status] || 'text-text-muted'}>
                        <span className="font-semibold">{count}</span> {status}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Risk categories */}
              {batch.risk_categories.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {batch.risk_categories.map((cat) => (
                    <span
                      key={cat}
                      className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
