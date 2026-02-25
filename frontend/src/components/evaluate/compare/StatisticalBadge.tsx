'use client';

import { Info } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

interface StatisticalBadgeProps {
  pValue: number;
  effectSize: 'negligible' | 'small' | 'medium' | 'large';
  stars: string;
  className?: string;
}

export function StatisticalBadge({ pValue, effectSize, stars, className }: StatisticalBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!stars) {
    return null;
  }

  const getEffectSizeColor = () => {
    switch (effectSize) {
      case 'large':
        return 'text-green-600';
      case 'medium':
        return 'text-amber-600';
      case 'small':
        return 'text-blue-600';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className={cn('relative inline-flex', className)}>
      <button
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={cn('cursor-help text-xs font-bold', getEffectSizeColor())}
      >
        {stars}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2">
          <div className="whitespace-nowrap rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg">
            <div className="mb-1 flex items-center gap-1">
              <Info className="h-3 w-3" />
              <span className="font-medium">Statistical Significance</span>
            </div>
            <div className="space-y-1 text-gray-300">
              <div>
                <span className="text-gray-400">p-value:</span> {pValue.toFixed(4)}
              </div>
              <div>
                <span className="text-gray-400">Effect size:</span>{' '}
                <span className="capitalize">{effectSize}</span>
              </div>
              <div className="mt-1 border-t border-gray-700 pt-1">
                <span className="text-gray-400">Legend:</span>
                <div className="mt-0.5 flex gap-2">
                  <span>* p&lt;0.05</span>
                  <span>** p&lt;0.01</span>
                  <span>*** p&lt;0.001</span>
                </div>
              </div>
            </div>
            {/* Arrow */}
            <div className="absolute left-1/2 top-full -mt-px -translate-x-1/2">
              <div className="border-4 border-transparent border-t-gray-900" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface SignificanceLegendProps {
  className?: string;
}

export function SignificanceLegend({ className }: SignificanceLegendProps) {
  return (
    <div className={cn('flex items-center gap-4 text-xs text-text-muted', className)}>
      <div className="flex items-center gap-1">
        <Info className="h-3 w-3" />
        <span>Significance:</span>
      </div>
      <div className="flex items-center gap-3">
        <span>
          <span className="font-bold text-blue-600">*</span> p&lt;0.05
        </span>
        <span>
          <span className="font-bold text-amber-600">**</span> p&lt;0.01
        </span>
        <span>
          <span className="font-bold text-green-600">***</span> p&lt;0.001
        </span>
      </div>
    </div>
  );
}

interface EffectSizeBadgeProps {
  effectSize: 'negligible' | 'small' | 'medium' | 'large';
  cohenD?: number;
  className?: string;
}

export function EffectSizeBadge({ effectSize, cohenD, className }: EffectSizeBadgeProps) {
  const getConfig = () => {
    switch (effectSize) {
      case 'large':
        return { bg: 'bg-green-100', text: 'text-green-700', label: 'Large' };
      case 'medium':
        return { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Medium' };
      case 'small':
        return { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Small' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Negligible' };
    }
  };

  const config = getConfig();

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium',
        config.bg,
        config.text,
        className
      )}
      title={cohenD !== undefined ? `Cohen's d: ${cohenD.toFixed(3)}` : undefined}
    >
      {config.label}
      {cohenD !== undefined && <span className="opacity-70">({cohenD.toFixed(2)})</span>}
    </span>
  );
}
