'use client';

import { ChevronDown, Filter, X, Check } from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';

import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';

import type { ComparisonRow } from '@/types';

interface MetadataFiltersProps {
  rows: ComparisonRow[];
}

interface FilterDropdownProps {
  label: string;
  options: string[];
  selected: string[];
  onSelect: (values: string[]) => void;
}

function FilterDropdown({ label, options, selected, onSelect }: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onSelect(selected.filter((s) => s !== option));
    } else {
      onSelect([...selected, option]);
    }
  };

  const displayText =
    selected.length === 0
      ? label
      : selected.length === 1
        ? selected[0].length > 15
          ? selected[0].substring(0, 15) + '...'
          : selected[0]
        : `${selected.length} selected`;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm transition-all',
          selected.length > 0
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-border text-text-secondary hover:border-primary'
        )}
      >
        <span className="max-w-[120px] truncate">{displayText}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 flex-shrink-0 transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-white shadow-lg">
          <div className="border-border/50 flex items-center justify-between border-b bg-gray-50 px-3 py-2">
            <span className="text-xs font-medium uppercase text-text-muted">{label}</span>
            {selected.length > 0 && (
              <button
                onClick={() => onSelect([])}
                className="text-xs text-text-muted hover:text-error"
              >
                Clear
              </button>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto">
            {options.map((option) => {
              const isSelected = selected.includes(option);
              return (
                <button
                  key={option}
                  onClick={() => toggleOption(option)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50',
                    isSelected && 'bg-primary/5 text-primary'
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
                  <span className="truncate" title={option}>
                    {option}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function MetadataFilters({ rows }: MetadataFiltersProps) {
  const { compareMetadataFilters, setCompareMetadataFilter, clearCompareMetadataFilters } =
    useUIStore();

  // Extract unique metadata keys and their values from rows
  const metadataOptions = useMemo(() => {
    const keyValues = new Map<string, Set<string>>();

    rows.forEach((row) => {
      if (!row.metadata) return;

      Object.entries(row.metadata).forEach(([key, value]) => {
        if (!keyValues.has(key)) {
          keyValues.set(key, new Set());
        }
        // Convert value to string for filtering
        const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        keyValues.get(key)!.add(strValue);
      });
    });

    // Convert to array and filter out keys with too many unique values (likely not useful for filtering)
    return Array.from(keyValues.entries())
      .filter(([, values]) => values.size <= 50 && values.size > 1)
      .map(([key, values]) => ({
        key,
        values: Array.from(values).sort(),
      }))
      .slice(0, 5); // Limit to 5 metadata filters for UI cleanliness
  }, [rows]);

  const hasActiveFilters = Object.values(compareMetadataFilters).some((v) => v.length > 0);

  if (metadataOptions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5 text-text-muted">
        <Filter className="h-4 w-4" />
        <span className="text-sm font-medium">Filters:</span>
      </div>

      {metadataOptions.map(({ key, values }) => (
        <FilterDropdown
          key={key}
          label={key}
          options={values}
          selected={compareMetadataFilters[key] || []}
          onSelect={(selected) => setCompareMetadataFilter(key, selected)}
        />
      ))}

      {hasActiveFilters && (
        <button
          onClick={clearCompareMetadataFilters}
          className="hover:bg-error/10 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-error transition-colors"
        >
          <X className="h-3 w-3" />
          Clear all
        </button>
      )}
    </div>
  );
}
