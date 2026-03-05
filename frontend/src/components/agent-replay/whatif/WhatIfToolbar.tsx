'use client';

import { FlaskConical } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useReplayStore } from '@/stores/replay-store';

interface WhatIfToolbarProps {
  nodeId: string;
  nodeType: string | null;
}

export function WhatIfToolbar({ nodeId, nodeType }: WhatIfToolbarProps) {
  const { whatIf, enterWhatIf } = useReplayStore();

  // Only show for GENERATION nodes
  if (!nodeType || nodeType.toUpperCase() !== 'GENERATION') return null;

  const isActive = whatIf.active && whatIf.nodeId === nodeId;

  return (
    <button
      onClick={() => enterWhatIf(nodeId)}
      className={cn(
        'flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold shadow-sm transition-all',
        isActive
          ? 'bg-amber-500 text-white shadow-amber-300/40'
          : 'animate-pulse-subtle bg-amber-400 text-white shadow-amber-300/30 hover:bg-amber-500 hover:shadow-md hover:shadow-amber-300/50'
      )}
      title="Open What-If Simulator"
    >
      <FlaskConical className="h-3.5 w-3.5" />
      What-If
    </button>
  );
}
