'use client';

import { getField, getListField } from '@/lib/hooks/useMemoryConfig';
import { useMemoryStore } from '@/stores/memory-store';

import type { MemoryRuleRecord } from '@/types/memory';

interface DecisionPathDiagramProps {
  rule: MemoryRuleRecord;
}

export function DecisionPathDiagram({ rule }: DecisionPathDiagramProps) {
  const summary = useMemoryStore((s) => s.summary);
  const action = getField(rule, 'action');
  const actionColor = summary?.rules_by_action.find((a) => a.action === action)?.color || '#7F8C8D';
  const mitigants = getListField(rule, 'mitigants');
  const thresholdValue = getField(rule, 'threshold_value');
  const thresholdType = getField(rule, 'threshold_type');

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      {/* Risk Factor */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">
        {getField(rule, 'group_by')}
      </div>

      <svg className="h-4 w-6 flex-shrink-0 text-text-muted" viewBox="0 0 24 16" fill="none">
        <path d="M0 8h18m0 0l-5-5m5 5l-5 5" stroke="currentColor" strokeWidth="2" />
      </svg>

      {/* Rule */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-text-primary">
        {getField(rule, 'name')}
        {thresholdValue && (
          <span className="ml-2 text-xs text-text-muted">
            [{thresholdType}: {thresholdValue}]
          </span>
        )}
      </div>

      <svg className="h-4 w-6 flex-shrink-0 text-text-muted" viewBox="0 0 24 16" fill="none">
        <path d="M0 8h18m0 0l-5-5m5 5l-5 5" stroke="currentColor" strokeWidth="2" />
      </svg>

      {/* Action / Outcome */}
      <div
        className="rounded-lg border px-3 py-2 text-sm font-semibold"
        style={{
          borderColor: actionColor,
          backgroundColor: `${actionColor}15`,
          color: actionColor,
        }}
      >
        {action.replace(/_/g, ' ')}
      </div>

      {/* Mitigants */}
      {mitigants.length > 0 && (
        <>
          <svg className="h-4 w-6 flex-shrink-0 text-text-muted" viewBox="0 0 24 16" fill="none">
            <path d="M0 8h18m0 0l-5-5m5 5l-5 5" stroke="currentColor" strokeWidth="2" />
          </svg>
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            {mitigants.join(', ')}
          </div>
        </>
      )}
    </div>
  );
}
