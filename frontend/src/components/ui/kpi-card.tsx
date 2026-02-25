'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Thresholds } from '@/types';

interface KPICardProps {
  label: string;
  value: number | string;
  format?: 'number' | 'percentage' | 'raw';
  trend?: number;
  showThresholdColor?: boolean;
  className?: string;
}

export function KPICard({
  label,
  value,
  format = 'number',
  trend,
  showThresholdColor = false,
  className,
}: KPICardProps) {
  const formatValue = () => {
    if (typeof value === 'string') return value;
    if (format === 'percentage') return `${(value * 100).toFixed(1)}%`;
    if (format === 'number') return value.toFixed(3);
    return value;
  };

  const getThresholdColor = () => {
    if (!showThresholdColor || typeof value !== 'number') return '';
    if (value >= Thresholds.GREEN_THRESHOLD) return 'text-success';
    if (value <= Thresholds.RED_THRESHOLD) return 'text-error';
    return 'text-warning';
  };

  const getTrendIcon = () => {
    if (trend === undefined) return null;
    if (trend > 0) return <TrendingUp className="h-4 w-4 text-success" />;
    if (trend < 0) return <TrendingDown className="h-4 w-4 text-error" />;
    return <Minus className="h-4 w-4 text-text-muted" />;
  };

  return (
    <div className={cn('card', className)}>
      <p className="mb-1 text-sm text-text-muted">{label}</p>
      <div className="flex items-center gap-2">
        <p className={cn('text-2xl font-bold', getThresholdColor())}>{formatValue()}</p>
        {getTrendIcon()}
      </div>
      {trend !== undefined && (
        <p
          className={cn(
            'mt-1 text-xs',
            trend > 0 ? 'text-success' : trend < 0 ? 'text-error' : 'text-text-muted'
          )}
        >
          {trend > 0 ? '+' : ''}
          {(trend * 100).toFixed(1)}% from previous
        </p>
      )}
    </div>
  );
}
