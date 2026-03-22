'use client';

import { Calendar, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export interface TimeRangePreset {
  value: string;
  label: string;
}

export interface TimeRangeSelectorProps {
  presets: TimeRangePreset[];
  selectedPreset: string;
  startDate: string;
  endDate: string;
  onPresetChange: (preset: string) => void;
  onCustomChange: (start: string, end: string) => void;
  summaryLabel?: string;
  size?: 'sm' | 'md';
}

export function TimeRangeSelector({
  presets,
  selectedPreset,
  startDate,
  endDate,
  onPresetChange,
  onCustomChange,
  summaryLabel,
  size = 'sm',
}: TimeRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(selectedPreset === 'custom');
  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync local custom inputs when external dates change
  useEffect(() => {
    setCustomStart(startDate);
    setCustomEnd(endDate);
  }, [startDate, endDate]);

  // Sync showCustom when preset changes externally
  useEffect(() => {
    setShowCustom(selectedPreset === 'custom');
  }, [selectedPreset]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const presetLabel = presets.find((o) => o.value === selectedPreset)?.label;
  const formatShort = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const currentLabel =
    selectedPreset === 'custom' && startDate && endDate
      ? `${formatShort(startDate)} – ${formatShort(endDate)}`
      : presetLabel || 'Select range';

  const isSmall = size === 'sm';
  const canApply = customStart && customEnd && customStart <= customEnd;

  return (
    <div className="flex items-center gap-2">
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'flex items-center gap-2 rounded-lg border border-border bg-surface font-medium text-text-primary transition-colors hover:bg-gray-50 dark:hover:bg-gray-800',
            isSmall ? 'h-[34px] px-3 text-xs' : 'px-3 py-2 text-sm'
          )}
        >
          <Calendar className={cn('text-text-muted', isSmall ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
          <span>{currentLabel}</span>
          <ChevronDown
            className={cn(
              'text-text-muted transition-transform',
              isSmall ? 'h-3.5 w-3.5' : 'h-4 w-4',
              isOpen && 'rotate-180'
            )}
          />
        </button>
        {isOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border border-border bg-surface shadow-lg">
            <div className="py-1">
              {presets.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    if (option.value === 'custom') {
                      setShowCustom(true);
                    } else {
                      setShowCustom(false);
                      onPresetChange(option.value);
                      setIsOpen(false);
                    }
                  }}
                  className={cn(
                    'flex w-full items-center px-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800',
                    isSmall ? 'py-1.5 text-xs' : 'py-2 text-sm',
                    selectedPreset === option.value && !showCustom
                      ? 'bg-primary/5 font-medium text-primary'
                      : 'text-text-primary'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {showCustom && (
              <div className="border-t border-border p-3">
                <div className="mb-3 space-y-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-muted">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-muted">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (canApply) {
                      onCustomChange(customStart, customEnd);
                      setIsOpen(false);
                    }
                  }}
                  disabled={!canApply}
                  className={cn(
                    'w-full rounded-lg px-3 py-1.5 text-sm font-medium text-white',
                    canApply
                      ? 'bg-primary hover:bg-primary-dark'
                      : 'cursor-not-allowed bg-primary/40'
                  )}
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {summaryLabel && (
        <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs text-text-muted dark:bg-gray-800 dark:bg-gray-800">
          <Calendar className="h-3 w-3" />
          {summaryLabel}
        </span>
      )}
    </div>
  );
}
