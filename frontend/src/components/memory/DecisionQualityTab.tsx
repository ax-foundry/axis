'use client';

import { AlertTriangle, CheckCircle, Minus } from 'lucide-react';
import { useMemo } from 'react';

import { useFilteredMemoryData } from '@/lib/hooks/useFilteredMemoryData';
import { getField, useMemoryConfig } from '@/lib/hooks/useMemoryConfig';
import { useMemoryStore } from '@/stores/memory-store';

import type { MemoryRuleRecord } from '@/types/memory';

function QualityColumn({
  title,
  icon,
  rules,
  accentColor,
  actionColorMap,
}: {
  title: string;
  icon: React.ReactNode;
  rules: MemoryRuleRecord[];
  accentColor: string;
  actionColorMap: Record<string, string>;
}) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <span
          className="ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
        >
          {rules.length}
        </span>
      </div>
      <div className="max-h-[500px] space-y-2 overflow-y-auto">
        {rules.map((rule) => {
          const action = getField(rule, 'action');
          return (
            <div key={rule.id} className="rounded-lg border border-border bg-gray-50/50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-text-primary">
                    {getField(rule, 'name')}
                  </div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    {getField(rule, 'group_by')} / {getField(rule, 'product')}
                  </div>
                </div>
                <span
                  className="inline-block flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{
                    backgroundColor: `${actionColorMap[action] || '#7F8C8D'}20`,
                    color: actionColorMap[action] || '#7F8C8D',
                  }}
                >
                  {action.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-text-secondary">
                {getField(rule, 'description')}
              </p>
            </div>
          );
        })}
        {rules.length === 0 && (
          <div className="py-4 text-center text-sm text-text-muted">No rules in this category</div>
        )}
      </div>
    </div>
  );
}

export function DecisionQualityTab() {
  const data = useFilteredMemoryData();
  const summary = useMemoryStore((s) => s.summary);
  const { data: config } = useMemoryConfig();

  const qv = useMemo(
    () =>
      config?.quality_values ?? {
        aligned: 'aligned',
        divergent: 'divergent',
        partial: 'partial',
      },
    [config?.quality_values]
  );
  const softThresholdValue = config?.soft_threshold_value ?? 'soft';

  const actionColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const entry of summary?.rules_by_action ?? []) {
      map[entry.action] = entry.color;
    }
    return map;
  }, [summary]);

  const { aligned, divergent, partial } = useMemo(() => {
    const a: MemoryRuleRecord[] = [];
    const d: MemoryRuleRecord[] = [];
    const p: MemoryRuleRecord[] = [];
    for (const rule of data) {
      const q = getField(rule, 'quality');
      if (q === qv.aligned) a.push(rule);
      else if (q === qv.divergent) d.push(rule);
      else if (q === qv.partial) p.push(rule);
    }
    return { aligned: a, divergent: d, partial: p };
  }, [data, qv]);

  const softThresholds = useMemo(
    () => data.filter((r) => getField(r, 'threshold_type') === softThresholdValue),
    [data, softThresholdValue]
  );

  return (
    <div className="space-y-6">
      {/* Two-column split: aligned vs divergent */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <QualityColumn
          title="Aligned"
          icon={<CheckCircle className="h-4 w-4 text-green-600" />}
          rules={aligned}
          accentColor="#27AE60"
          actionColorMap={actionColorMap}
        />
        <QualityColumn
          title="Divergent"
          icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
          rules={divergent}
          accentColor="#F39C12"
          actionColorMap={actionColorMap}
        />
      </div>

      {/* Partial */}
      {partial.length > 0 && (
        <div className="rounded-lg border border-border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Minus className="h-4 w-4 text-text-muted" />
            <h3 className="text-sm font-semibold text-text-primary">Partial</h3>
            <span className="ml-2 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-text-muted">
              {partial.length}
            </span>
          </div>
          <div className="grid max-h-[500px] grid-cols-2 gap-2 overflow-y-auto">
            {partial.map((rule) => (
              <div key={rule.id} className="rounded-lg border border-border bg-gray-50/50 p-3">
                <div className="truncate text-sm font-medium text-text-primary">
                  {getField(rule, 'name')}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
                  {getField(rule, 'description')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Soft Thresholds */}
      {softThresholds.length > 0 && (
        <div className="rounded-lg border border-border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">
            Soft Thresholds ({softThresholds.length})
          </h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50/80">
                <tr>
                  <th className="px-3 py-2 font-semibold">Rule</th>
                  <th className="px-3 py-2 font-semibold">Risk Factor</th>
                  <th className="px-3 py-2 font-semibold">Threshold</th>
                  <th className="px-3 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {softThresholds.map((rule) => {
                  const action = getField(rule, 'action');
                  return (
                    <tr key={rule.id} className="border-b">
                      <td className="px-3 py-2 font-medium">{getField(rule, 'name')}</td>
                      <td className="px-3 py-2 text-text-secondary">
                        {getField(rule, 'group_by')}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">
                        {getField(rule, 'threshold_value') || '-'}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{
                            backgroundColor: `${actionColorMap[action] || '#7F8C8D'}20`,
                            color: actionColorMap[action] || '#7F8C8D',
                          }}
                        >
                          {action.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
