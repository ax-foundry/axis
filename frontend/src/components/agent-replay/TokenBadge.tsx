'use client';

import { cn } from '@/lib/utils';

import type { TokenUsage } from '@/types/replay';

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface TokenBadgeProps {
  usage: TokenUsage;
  compact?: boolean;
  className?: string;
}

export function TokenBadge({ usage, compact = false, className }: TokenBadgeProps) {
  if (usage.total === 0) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700',
        className
      )}
    >
      {compact ? (
        <>{formatTokenCount(usage.total)} tokens</>
      ) : (
        <>
          in: {formatTokenCount(usage.input)} | out: {formatTokenCount(usage.output)}
        </>
      )}
    </span>
  );
}
