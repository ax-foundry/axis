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
    TOOL: 'bg-blue-100 text-blue-700',
    SPAN: 'bg-gray-100 text-gray-600',
    EVENT: 'bg-amber-100 text-amber-700',
  };
  const abbr: Record<string, string> = {
    GENERATION: 'GEN',
    TOOL: 'TOOL',
    SPAN: 'SPAN',
    EVENT: 'EVT',
  };
  return (
    <span
      className={cn(
        'mr-1.5 inline-block rounded px-1 py-0.5 text-[9px] font-bold leading-none',
        colors[upper] || 'bg-gray-100 text-gray-500'
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
}

export function FailureStepSelector({ nodes, value, onChange }: FailureStepSelectorProps) {
  const spans = flattenTree(nodes).filter((n) => n.type?.toUpperCase() === 'SPAN');

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
    >
      <option value="">None selected</option>
      {spans.map((node) => (
        <option key={node.id} value={node.id}>
          {node.name}
        </option>
      ))}
    </select>
  );
}

export { typeBadge, flattenTree };
