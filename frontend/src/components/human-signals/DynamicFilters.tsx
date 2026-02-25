'use client';

import { ChevronDown, Check, X, Filter, RotateCcw } from 'lucide-react';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

import { useHumanSignalsStore } from '@/stores/human-signals-store';

import type { SignalsDisplayConfig } from '@/types';

interface DropdownSelectProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  multi?: boolean;
}

function DropdownSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = 'All',
  multi = false,
}: DropdownSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const displayText = useMemo(() => {
    if (selected.length === 0) return placeholder;
    if (selected.length === 1) {
      const opt = options.find((o) => o.value === selected[0]);
      return opt?.label || selected[0];
    }
    return `${selected.length} selected`;
  }, [selected, options, placeholder]);

  const handleToggle = useCallback(
    (value: string) => {
      if (multi) {
        const next = selected.includes(value)
          ? selected.filter((v) => v !== value)
          : [...selected, value];
        onChange(next);
      } else {
        onChange(selected.includes(value) ? [] : [value]);
        setIsOpen(false);
      }
    },
    [multi, selected, onChange]
  );

  return (
    <div ref={ref} className="relative">
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-muted">
        {label}
      </label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-[34px] w-full items-center justify-between rounded-lg border px-3 text-xs ${
          isOpen ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-gray-300'
        }`}
      >
        <span className={selected.length === 0 ? 'text-text-muted' : 'text-text-primary'}>
          {displayText}
        </span>
        <div className="flex items-center gap-1">
          {selected.length > 0 && (
            <X
              className="h-3 w-3 text-text-muted hover:text-text-primary"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
            />
          )}
          <ChevronDown className="h-3 w-3 text-text-muted" />
        </div>
      </button>
      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-white shadow-lg">
          {options.map((opt) => {
            const isSelected = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => handleToggle(opt.value)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-primary/5 ${
                  isSelected ? 'bg-primary/5' : ''
                }`}
              >
                {multi && (
                  <div
                    className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
                      isSelected ? 'border-primary bg-primary text-white' : 'border-gray-300'
                    }`}
                  >
                    {isSelected && <Check className="h-2.5 w-2.5" />}
                  </div>
                )}
                <span className="text-text-primary">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface DynamicFiltersProps {
  displayConfig: SignalsDisplayConfig;
}

export function DynamicFilters({ displayConfig }: DynamicFiltersProps) {
  const {
    selectedSourceName,
    selectedSourceComponent,
    selectedEnvironment,
    availableSourceNames,
    availableSourceComponents,
    availableEnvironments,
    metricFilters,
    setSelectedSourceName,
    setSelectedSourceComponent,
    setSelectedEnvironment,
    setMetricFilter,
    clearFilters,
  } = useHumanSignalsStore();

  const [isExpanded, setIsExpanded] = useState(false);

  const sourceFilters = displayConfig.filters.filter(
    (f) => f.type === 'source' && f.field !== 'source_name'
  );
  const MAX_FILTER_OPTIONS = 8;
  const metricFilterConfigs = displayConfig.filters.filter(
    (f) => f.type === 'metric' && (f.options?.length ?? 0) <= MAX_FILTER_OPTIONS
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedSourceName) count++;
    if (selectedSourceComponent) count++;
    if (selectedEnvironment) count++;
    Object.values(metricFilters).forEach((v) => {
      if (v.length > 0) count++;
    });
    return count;
  }, [selectedSourceName, selectedSourceComponent, selectedEnvironment, metricFilters]);

  const getSourceOptions = (field: string) => {
    switch (field) {
      case 'source_name':
        return availableSourceNames;
      case 'source_component':
        return availableSourceComponents;
      case 'environment':
        return availableEnvironments;
      default:
        return [];
    }
  };

  const getSourceSelected = (field: string): string[] => {
    switch (field) {
      case 'source_name':
        return selectedSourceName ? [selectedSourceName] : [];
      case 'source_component':
        return selectedSourceComponent ? [selectedSourceComponent] : [];
      case 'environment':
        return selectedEnvironment ? [selectedEnvironment] : [];
      default:
        return [];
    }
  };

  const handleSourceChange = (field: string, values: string[]) => {
    const val = values[0] || '';
    switch (field) {
      case 'source_name':
        setSelectedSourceName(val);
        break;
      case 'source_component':
        setSelectedSourceComponent(val);
        break;
      case 'environment':
        setSelectedEnvironment(val);
        break;
    }
  };

  return (
    <div className="rounded-lg border border-border bg-white">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-2.5"
      >
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-sm font-medium text-text-primary">Filters</span>
          {activeFilterCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearFilters();
              }}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-muted hover:bg-gray-100 hover:text-text-primary"
            >
              <RotateCcw className="h-3 w-3" />
              Clear
            </button>
          )}
          <ChevronDown
            className={`h-4 w-4 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>
      {isExpanded && (
        <div className="border-t border-border px-4 py-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {sourceFilters.map((f) => {
              const opts = getSourceOptions(f.field!);
              if (opts.length === 0) return null;
              return (
                <DropdownSelect
                  key={f.field}
                  label={f.label}
                  options={opts.map((v) => ({ value: v, label: v }))}
                  selected={getSourceSelected(f.field!)}
                  onChange={(vals) => handleSourceChange(f.field!, vals)}
                />
              );
            })}
            {metricFilterConfigs.map((f) => {
              const key = `${f.metric}__${f.signal}`;
              return (
                <DropdownSelect
                  key={key}
                  label={f.label}
                  options={(f.options || []).map((v) => ({ value: v, label: v }))}
                  selected={metricFilters[key] || []}
                  onChange={(vals) => setMetricFilter(key, vals)}
                  multi
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
