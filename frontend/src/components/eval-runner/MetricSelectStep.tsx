'use client';

import {
  Search,
  ChevronRight,
  ChevronLeft,
  Check,
  AlertCircle,
  Loader2,
  LayoutGrid,
  List,
  Sparkles,
  Cpu,
  X,
  CheckCircle2,
  BarChart3,
} from 'lucide-react';
import { useEffect, useState, useMemo, useCallback } from 'react';

import { evalRunnerGetMetrics } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useEvalRunnerStore } from '@/stores';

import type { EvalRunnerMetricInfo } from '@/types';

// Muted, professional tag palette — complements the AXIS blue primary
const TAG_CONFIG: Record<string, { bg: string; text: string; border: string }> = {
  knowledge: { bg: 'bg-primary/5', text: 'text-primary', border: 'border-primary/15' },
  rag: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100' },
  agent: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100' },
  multi_turn: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100' },
  single_turn: { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-100' },
  data: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-100' },
  retrieval: { bg: 'bg-pink-50', text: 'text-pink-600', border: 'border-pink-100' },
  performance: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-100' },
  quality: { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100' },
  style: { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100' },
  tool: { bg: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-100' },
};

type ViewMode = 'grid' | 'list';

export function MetricSelectStep() {
  const {
    availableMetrics,
    selectedMetrics,
    columnMapping,
    metricsLoading,
    setAvailableMetrics,
    setMetricsLoading,
    toggleMetric,
    setSelectedMetrics,
    setCurrentStep,
  } = useEvalRunnerStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showOnlyCompatible, setShowOnlyCompatible] = useState(false);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    setLoadError(null);
    try {
      const response = await evalRunnerGetMetrics();
      if (response.success) {
        setAvailableMetrics(response.metrics);
      } else {
        setLoadError('Failed to load metrics');
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load metrics');
    } finally {
      setMetricsLoading(false);
    }
  }, [setMetricsLoading, setAvailableMetrics]);

  useEffect(() => {
    if (availableMetrics.length === 0) {
      loadMetrics();
    }
  }, [availableMetrics.length, loadMetrics]);

  const availableFields = useMemo(() => {
    const fields: string[] = [];
    if (columnMapping.query) fields.push('query');
    if (columnMapping.actual_output) fields.push('actual_output');
    if (columnMapping.expected_output) fields.push('expected_output');
    if (columnMapping.retrieved_content) fields.push('retrieved_content');
    if (columnMapping.conversation) fields.push('conversation');
    if (columnMapping.latency) fields.push('latency');
    if (columnMapping.tools_called) fields.push('tools_called');
    if (columnMapping.expected_tools) fields.push('expected_tools');
    if (columnMapping.acceptance_criteria) fields.push('acceptance_criteria');
    return fields;
  }, [columnMapping]);

  const hasRequiredFields = useCallback(
    (metric: EvalRunnerMetricInfo): boolean => {
      return metric.required_fields.every((field) => availableFields.includes(field));
    },
    [availableFields]
  );

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    availableMetrics.forEach((m) => m.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [availableMetrics]);

  const filteredMetrics = useMemo(() => {
    return availableMetrics.filter((metric) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          metric.name.toLowerCase().includes(query) ||
          metric.description.toLowerCase().includes(query) ||
          metric.key.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      if (activeTagFilter && !metric.tags.includes(activeTagFilter)) {
        return false;
      }

      if (showOnlyCompatible && !hasRequiredFields(metric)) {
        return false;
      }

      return true;
    });
  }, [availableMetrics, searchQuery, activeTagFilter, showOnlyCompatible, hasRequiredFields]);

  const compatibleMetrics = useMemo(() => {
    return availableMetrics.filter(hasRequiredFields);
  }, [availableMetrics, hasRequiredFields]);

  const handleClearAll = () => {
    setSelectedMetrics([]);
  };

  const handleContinue = () => {
    if (selectedMetrics.length > 0) {
      setCurrentStep('run');
    }
  };

  // Loading state
  if (metricsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm font-medium text-text-primary">Loading metrics...</p>
        <p className="mt-1 text-xs text-text-muted">Fetching available evaluation metrics</p>
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div className="p-6">
        <div className="border-error/20 bg-error/5 flex items-center gap-3 rounded-lg border p-4">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-error" />
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">Failed to load metrics</p>
            <p className="mt-0.5 text-xs text-text-muted">{loadError}</p>
          </div>
          <button
            onClick={loadMetrics}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-gray-50"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const selectedLlmCount = selectedMetrics.filter(
    (k) => availableMetrics.find((m) => m.key === k)?.is_llm_based
  ).length;
  const selectedHeuristicCount = selectedMetrics.length - selectedLlmCount;

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Select Metrics</h2>
            <p className="text-sm text-text-muted">
              <span className="font-medium text-primary">{compatibleMetrics.length}</span>
              <span className="mx-1 text-text-muted">/</span>
              <span>{availableMetrics.length}</span> compatible with your dataset
            </p>
          </div>
        </div>
        {/* View Toggle */}
        <div className="flex rounded-lg border border-border p-0.5">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'rounded-md p-1.5 transition-colors',
              viewMode === 'grid'
                ? 'bg-primary/10 text-primary'
                : 'text-text-muted hover:text-text-secondary'
            )}
            title="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'rounded-md p-1.5 transition-colors',
              viewMode === 'list'
                ? 'bg-primary/10 text-primary'
                : 'text-text-muted hover:text-text-secondary'
            )}
            title="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Toolbar: Search + Actions */}
      <div className="rounded-lg border border-border bg-gray-50/50 p-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search metrics by name, description, or key..."
              className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-8 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {selectedMetrics.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-gray-50 hover:text-text-secondary"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>

        {/* Tag Filters */}
        <div className="border-border/60 mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
          <span className="mr-1 text-xs font-medium uppercase tracking-wider text-text-muted">
            Filter
          </span>
          <button
            onClick={() => {
              setActiveTagFilter(null);
              setShowOnlyCompatible(false);
            }}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
              activeTagFilter === null && !showOnlyCompatible
                ? 'bg-primary text-white'
                : 'bg-white text-text-secondary hover:bg-gray-100'
            )}
          >
            All
          </button>
          <button
            onClick={() => {
              setShowOnlyCompatible(!showOnlyCompatible);
              setActiveTagFilter(null);
            }}
            className={cn(
              'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
              showOnlyCompatible
                ? 'bg-success text-white'
                : 'hover:bg-success/5 bg-white text-success'
            )}
          >
            <Check className="h-3 w-3" />
            Compatible
          </button>
          <div className="mx-0.5 h-4 w-px bg-border" />
          {allTags.map((tag) => {
            const config = TAG_CONFIG[tag] || {
              bg: 'bg-gray-50',
              text: 'text-gray-600',
              border: 'border-gray-200',
            };
            return (
              <button
                key={tag}
                onClick={() => {
                  setActiveTagFilter(activeTagFilter === tag ? null : tag);
                  setShowOnlyCompatible(false);
                }}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  activeTagFilter === tag
                    ? 'border-primary bg-primary text-white'
                    : `${config.bg} ${config.text} ${config.border} hover:opacity-80`
                )}
              >
                {tag.replace('_', ' ')}
              </button>
            );
          })}
        </div>
      </div>

      {/* Metrics Display */}
      {viewMode === 'grid' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredMetrics.map((metric) => (
            <MetricCard
              key={metric.key}
              metric={metric}
              isSelected={selectedMetrics.includes(metric.key)}
              hasFields={hasRequiredFields(metric)}
              availableFields={availableFields}
              onToggle={() => hasRequiredFields(metric) && toggleMetric(metric.key)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredMetrics.map((metric) => (
            <MetricListItem
              key={metric.key}
              metric={metric}
              isSelected={selectedMetrics.includes(metric.key)}
              hasFields={hasRequiredFields(metric)}
              availableFields={availableFields}
              onToggle={() => hasRequiredFields(metric) && toggleMetric(metric.key)}
            />
          ))}
        </div>
      )}

      {filteredMetrics.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12">
          <Search className="text-text-muted/40 h-8 w-8" />
          <p className="mt-3 text-sm font-medium text-text-primary">No metrics found</p>
          <p className="mt-0.5 text-xs text-text-muted">Try adjusting your search or filters</p>
        </div>
      )}

      {/* Selection Summary */}
      <div className="rounded-lg border border-border bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg',
                selectedMetrics.length > 0 ? 'bg-primary/10' : 'bg-gray-100'
              )}
            >
              <CheckCircle2
                className={cn(
                  'h-[18px] w-[18px]',
                  selectedMetrics.length > 0 ? 'text-primary' : 'text-text-muted'
                )}
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {selectedMetrics.length} metric{selectedMetrics.length !== 1 ? 's' : ''} selected
              </p>
              {selectedMetrics.length > 0 ? (
                <p className="text-xs text-text-muted">
                  {selectedLlmCount} LLM-based, {selectedHeuristicCount} heuristic
                </p>
              ) : (
                <p className="text-xs text-text-muted">Select at least one metric to continue</p>
              )}
            </div>
          </div>
          {selectedMetrics.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {selectedMetrics.slice(0, 5).map((key) => {
                const metric = availableMetrics.find((m) => m.key === key);
                return (
                  <span
                    key={key}
                    className="bg-primary/8 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    {metric?.is_llm_based ? (
                      <Sparkles className="h-2.5 w-2.5" />
                    ) : (
                      <Cpu className="h-2.5 w-2.5" />
                    )}
                    {metric?.name || key}
                  </span>
                );
              })}
              {selectedMetrics.length > 5 && (
                <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-text-muted">
                  +{selectedMetrics.length - 5} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setCurrentStep('agent')}
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-gray-50"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <button
          onClick={handleContinue}
          disabled={selectedMetrics.length === 0}
          className={cn(
            'flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-all',
            selectedMetrics.length > 0
              ? 'bg-primary text-white shadow-sm hover:bg-primary-dark hover:shadow-md'
              : 'cursor-not-allowed bg-gray-100 text-gray-400'
          )}
        >
          Continue to Run
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Grid Card Component
// ============================================================================

function MetricCard({
  metric,
  isSelected,
  hasFields,
  availableFields,
  onToggle,
}: {
  metric: EvalRunnerMetricInfo;
  isSelected: boolean;
  hasFields: boolean;
  availableFields: string[];
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={!hasFields}
      className={cn(
        'group relative flex flex-col rounded-lg border p-4 text-left transition-all',
        isSelected
          ? 'border-primary bg-primary/[0.03] shadow-sm'
          : hasFields
            ? 'border-border bg-white hover:border-primary/40 hover:shadow-sm'
            : 'cursor-not-allowed border-border bg-gray-50/60 opacity-50'
      )}
    >
      {/* Selection indicator */}
      <div
        className={cn(
          'absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border transition-colors',
          isSelected
            ? 'border-primary bg-primary text-white'
            : hasFields
              ? 'border-gray-300 bg-white group-hover:border-primary/40'
              : 'border-gray-200 bg-gray-100'
        )}
      >
        {isSelected && <Check className="h-3 w-3" />}
      </div>

      {/* Header */}
      <div className="mb-2 flex items-start gap-2.5 pr-7">
        <div
          className={cn(
            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
            metric.is_llm_based ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-text-secondary'
          )}
        >
          {metric.is_llm_based ? <Sparkles className="h-4 w-4" /> : <Cpu className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-text-primary">{metric.name}</h3>
          <span
            className={cn(
              'text-[11px] font-medium',
              metric.is_llm_based ? 'text-primary' : 'text-text-muted'
            )}
          >
            {metric.is_llm_based ? 'LLM-based' : 'Heuristic'}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-text-muted">
        {metric.description}
      </p>

      {/* Required fields */}
      <div className="mb-3">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-text-muted">
          Required fields
        </p>
        <div className="flex flex-wrap gap-1">
          {metric.required_fields.map((field) => {
            const hasMapped = availableFields.includes(field);
            return (
              <span
                key={field}
                className={cn(
                  'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium',
                  hasMapped ? 'bg-success/10 text-success' : 'bg-error/8 text-error/80'
                )}
              >
                {field}
                {hasMapped ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
              </span>
            );
          })}
        </div>
      </div>

      {/* Tags */}
      <div className="mt-auto flex flex-wrap gap-1">
        {metric.tags.slice(0, 3).map((tag) => {
          const config = TAG_CONFIG[tag] || {
            bg: 'bg-gray-50',
            text: 'text-gray-500',
            border: 'border-gray-100',
          };
          return (
            <span
              key={tag}
              className={cn(
                'rounded border px-1.5 py-0.5 text-[11px] font-medium',
                config.bg,
                config.text,
                config.border
              )}
            >
              {tag.replace('_', ' ')}
            </span>
          );
        })}
        {metric.tags.length > 3 && (
          <span className="rounded bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium text-text-muted">
            +{metric.tags.length - 3}
          </span>
        )}
      </div>
    </button>
  );
}

// ============================================================================
// List Item Component
// ============================================================================

function MetricListItem({
  metric,
  isSelected,
  hasFields,
  availableFields,
  onToggle,
}: {
  metric: EvalRunnerMetricInfo;
  isSelected: boolean;
  hasFields: boolean;
  availableFields: string[];
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={!hasFields}
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all',
        isSelected
          ? 'border-primary bg-primary/[0.03]'
          : hasFields
            ? 'border-border bg-white hover:border-primary/40 hover:bg-gray-50/30'
            : 'cursor-not-allowed border-border bg-gray-50/60 opacity-50'
      )}
    >
      {/* Checkbox */}
      <div
        className={cn(
          'h-4.5 w-4.5 flex flex-shrink-0 items-center justify-center rounded border transition-colors',
          isSelected
            ? 'border-primary bg-primary text-white'
            : hasFields
              ? 'border-gray-300 group-hover:border-primary/40'
              : 'border-gray-200 bg-gray-100'
        )}
      >
        {isSelected && <Check className="h-3 w-3" />}
      </div>

      {/* Icon */}
      <div
        className={cn(
          'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
          metric.is_llm_based ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-text-secondary'
        )}
      >
        {metric.is_llm_based ? (
          <Sparkles className="h-3.5 w-3.5" />
        ) : (
          <Cpu className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-medium text-text-primary">{metric.name}</h3>
          <span className="font-mono text-[11px] text-text-muted">{metric.key}</span>
        </div>
        <p className="truncate text-xs text-text-muted">{metric.description}</p>
      </div>

      {/* Required fields indicator */}
      <div className="hidden flex-shrink-0 items-center gap-1 md:flex">
        {metric.required_fields.map((field) => {
          const hasMapped = availableFields.includes(field);
          return (
            <span
              key={field}
              className={cn(
                'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium',
                hasMapped ? 'bg-success/10 text-success' : 'bg-error/8 text-error/80'
              )}
            >
              {field}
              {hasMapped ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
            </span>
          );
        })}
      </div>

      {/* Tags */}
      <div className="hidden flex-shrink-0 gap-1 lg:flex">
        {metric.tags.slice(0, 2).map((tag) => {
          const config = TAG_CONFIG[tag] || {
            bg: 'bg-gray-50',
            text: 'text-gray-500',
            border: 'border-gray-100',
          };
          return (
            <span
              key={tag}
              className={cn(
                'rounded border px-1.5 py-0.5 text-[11px] font-medium',
                config.bg,
                config.text,
                config.border
              )}
            >
              {tag.replace('_', ' ')}
            </span>
          );
        })}
      </div>

      {/* Type badge */}
      <span
        className={cn(
          'flex-shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold',
          metric.is_llm_based ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-text-muted'
        )}
      >
        {metric.is_llm_based ? 'LLM' : 'Heuristic'}
      </span>
    </button>
  );
}
