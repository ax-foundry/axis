'use client';

import { cn } from '@/lib/utils';

import type { ObservationNodeData } from '@/types/replay';

interface FlatNode {
  id: string;
  name: string;
  type: string | null;
  depth: number;
}

function flattenTree(nodes: ObservationNodeData[], depth = 0): FlatNode[] {
  const result: FlatNode[] = [];
  for (const node of nodes) {
    result.push({
      id: node.id,
      name: node.name || node.id,
      type: node.type,
      depth,
    });
    if (node.children?.length) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

function typeBadge(type: string | null) {
  if (!type) return null;
  const upper = type.toUpperCase();
  const colors: Record<string, string> = {
    GENERATION: 'bg-purple-100 text-purple-700',
    LLM: 'bg-purple-100 text-purple-700',
    TOOL: 'bg-blue-100 text-blue-700',
    SPAN: 'bg-gray-100 dark:bg-gray-800 text-gray-600',
    AGENT: 'bg-violet-100 text-violet-700',
    CHAIN: 'bg-cyan-100 text-cyan-700',
    EVENT: 'bg-amber-100 text-amber-700',
  };
  const abbr: Record<string, string> = {
    GENERATION: 'GEN',
    LLM: 'LLM',
    TOOL: 'TOOL',
    SPAN: 'SPAN',
    AGENT: 'AGENT',
    CHAIN: 'CHAIN',
    EVENT: 'EVT',
  };
  return (
    <span
      className={cn(
        'mr-1.5 inline-block rounded px-1 py-0.5 text-[9px] font-bold leading-none',
        colors[upper] || 'bg-gray-100 text-gray-500 dark:bg-gray-800'
      )}
    >
      {abbr[upper] || upper.slice(0, 4)}
    </span>
  );
}

interface FailureStepSelectorProps {
  nodes: ObservationNodeData[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Allowed observation types (uppercase). Empty = default set. From YAML review_step_types. */
  allowedTypes?: string[];
}

/** Default types when no config override is provided. */
const DEFAULT_STEP_TYPES = new Set(['SPAN', 'AGENT', 'CHAIN']);

export function FailureStepSelector({
  nodes,
  value,
  onChange,
  allowedTypes,
}: FailureStepSelectorProps) {
  const typeFilter =
    allowedTypes && allowedTypes.length > 0 ? new Set(allowedTypes) : DEFAULT_STEP_TYPES;
  const steps = flattenTree(nodes).filter((n) => n.type && typeFilter.has(n.type.toUpperCase()));

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-lg border border-primary/15 bg-surface px-3 py-2 text-sm text-text-primary shadow-sm focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15"
    >
      <option value="">None selected</option>
      {steps.map((node) => (
        <option key={node.id} value={node.id}>
          {'  '.repeat(node.depth)}
          {node.name}
        </option>
      ))}
    </select>
  );
}

export { typeBadge, flattenTree };
