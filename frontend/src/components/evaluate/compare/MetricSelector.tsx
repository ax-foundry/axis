'use client';

import { ChevronDown, Check, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';

interface MetricSelectorProps {
  availableMetrics: string[];
}

export function MetricSelector({ availableMetrics }: MetricSelectorProps) {
  const { compareSelectedMetrics, setCompareSelectedMetrics } = useUIStore();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleMetric = (metric: string) => {
    const current = compareSelectedMetrics;
    if (current.includes(metric)) {
      setCompareSelectedMetrics(current.filter((m) => m !== metric));
    } else {
      setCompareSelectedMetrics([...current, metric]);
    }
  };

  const clearAll = () => {
    setCompareSelectedMetrics([]);
  };

  const selectAll = () => {
    setCompareSelectedMetrics([...availableMetrics]);
  };

  const selectedCount = compareSelectedMetrics.length;
  const displayText =
    selectedCount === 0
      ? 'All metrics'
      : selectedCount === availableMetrics.length
        ? 'All metrics'
        : `${selectedCount} metric${selectedCount !== 1 ? 's' : ''}`;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex min-w-[140px] items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium transition-all',
          isOpen ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary'
        )}
      >
        <span className="text-text-secondary">{displayText}</span>
        <ChevronDown
          className={cn('h-4 w-4 text-text-muted transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-white shadow-lg">
          {/* Actions */}
          <div className="border-border/50 flex items-center justify-between border-b bg-gray-50 px-3 py-2">
            <button
              onClick={selectAll}
              className="text-xs font-medium text-primary hover:text-primary-dark"
            >
              Select all
            </button>
            <button
              onClick={clearAll}
              className="text-xs font-medium text-text-muted hover:text-text-secondary"
            >
              Clear
            </button>
          </div>

          {/* Metric list */}
          <div className="max-h-64 overflow-y-auto">
            {availableMetrics.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-text-muted">
                No metrics available
              </div>
            ) : (
              availableMetrics.map((metric) => {
                const isSelected =
                  compareSelectedMetrics.length === 0 || compareSelectedMetrics.includes(metric);
                return (
                  <button
                    key={metric}
                    onClick={() => toggleMetric(metric)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50',
                      isSelected && 'text-primary'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border',
                        isSelected ? 'border-primary bg-primary' : 'border-border'
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <span className="truncate" title={metric}>
                      {metric}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Selected tags */}
      {selectedCount > 0 && selectedCount < availableMetrics.length && (
        <div className="mt-2 flex flex-wrap gap-1">
          {compareSelectedMetrics.slice(0, 3).map((metric) => (
            <span
              key={metric}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
            >
              {metric.length > 10 ? metric.substring(0, 10) + '...' : metric}
              <button
                onClick={() => toggleMetric(metric)}
                className="rounded-full hover:bg-primary/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {selectedCount > 3 && (
            <span className="px-2 py-0.5 text-xs text-text-muted">+{selectedCount - 3} more</span>
          )}
        </div>
      )}
    </div>
  );
}
