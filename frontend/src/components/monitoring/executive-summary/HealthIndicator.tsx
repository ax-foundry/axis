'use client';

import { cn } from '@/lib/utils';

interface HealthIndicatorProps {
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  showLabel?: boolean;
  className?: string;
}

const STATUS_CONFIG = {
  healthy: { color: 'bg-success', label: 'Healthy' },
  warning: { color: 'bg-warning', label: 'Warning' },
  critical: { color: 'bg-error', label: 'Critical' },
  unknown: { color: 'bg-gray-400', label: 'Unknown' },
} as const;

export function HealthIndicator({ status, showLabel = true, className }: HealthIndicatorProps) {
  const config = STATUS_CONFIG[status];
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <span className={cn('inline-block h-2.5 w-2.5 rounded-full', config.color)} />
      {showLabel && <span className="text-xs text-text-muted">{config.label}</span>}
    </div>
  );
}
