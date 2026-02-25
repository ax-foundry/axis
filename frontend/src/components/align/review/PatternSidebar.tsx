'use client';

import { Sparkles, ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useClusterPatterns } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useCalibrationStore } from '@/stores/calibration-store';

import type { ClusteringMethod, ErrorPattern } from '@/types';

interface PatternCardProps {
  pattern: ErrorPattern;
  onSelectRecords: (recordIds: string[]) => void;
}

function PatternCard({ pattern, onSelectRecords }: PatternCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-white">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-text-primary">{pattern.category}</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {pattern.count}
            </span>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-text-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-text-muted" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-border px-3 py-2">
          {/* Frequency bar */}
          <div className="mb-2">
            <div className="h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light"
                style={{ width: `${Math.min(100, pattern.count * 10)}%` }}
              />
            </div>
          </div>

          {/* Examples */}
          {pattern.examples.length > 0 && (
            <div className="mb-2 space-y-1">
              <p className="text-xs font-medium text-text-muted">Examples:</p>
              {pattern.examples.slice(0, 3).map((example, idx) => (
                <p key={idx} className="truncate text-xs text-text-secondary">
                  &ldquo;{example}&rdquo;
                </p>
              ))}
            </div>
          )}

          {/* Action button */}
          <button
            onClick={() => onSelectRecords(pattern.record_ids)}
            className="mt-1 text-xs font-medium text-primary hover:text-primary-dark"
          >
            View {pattern.count} records
          </button>
        </div>
      )}
    </div>
  );
}

const CLUSTERING_METHODS: { value: ClusteringMethod; label: string; description: string }[] = [
  { value: 'llm', label: 'LLM', description: 'AI-powered categorization' },
  { value: 'bertopic', label: 'BERTopic', description: 'Local topic modeling' },
  { value: 'hybrid', label: 'Hybrid', description: 'BERTopic + LLM labels' },
];

interface PatternSidebarProps {
  onSelectRecordIds?: (recordIds: string[]) => void;
}

export function PatternSidebar({ onSelectRecordIds }: PatternSidebarProps) {
  const { humanAnnotations, errorPatterns, isClusteringPatterns, judgeConfig } =
    useCalibrationStore();

  const [selectedMethod, setSelectedMethod] = useState<ClusteringMethod>('llm');
  const clusterMutation = useClusterPatterns();

  // Count annotations with notes
  const notesCount = Object.values(humanAnnotations).filter(
    (ann) => ann.notes && ann.notes.trim()
  ).length;

  const MIN_NOTES_FOR_BERTOPIC = 10;
  const needsMoreNotes = notesCount < MIN_NOTES_FOR_BERTOPIC;

  // Auto-switch to LLM if selected method requires more notes than available
  useEffect(() => {
    if (needsMoreNotes && (selectedMethod === 'bertopic' || selectedMethod === 'hybrid')) {
      setSelectedMethod('llm');
    }
  }, [needsMoreNotes, selectedMethod]);

  const handleClusterPatterns = () => {
    clusterMutation.mutate({
      annotations: humanAnnotations,
      judgeConfig,
      method: selectedMethod,
    });
  };

  const handleSelectRecords = (recordIds: string[]) => {
    onSelectRecordIds?.(recordIds);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent-gold" />
          <h3 className="font-medium text-text-primary">Pattern Discovery</h3>
        </div>
        {notesCount > 0 && (
          <button
            onClick={handleClusterPatterns}
            disabled={isClusteringPatterns}
            className={cn(
              'flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors',
              isClusteringPatterns
                ? 'bg-gray-100 text-text-muted'
                : 'bg-primary/10 text-primary hover:bg-primary/20'
            )}
          >
            {isClusteringPatterns ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {isClusteringPatterns ? 'Analyzing...' : 'Refresh'}
          </button>
        )}
      </div>

      {/* Clustering Method Selector */}
      {notesCount > 0 && (
        <div className="rounded-lg border border-border bg-gray-50 p-3">
          <p className="mb-2 text-xs font-medium text-text-muted">Clustering Method</p>
          <div className="flex gap-1">
            {CLUSTERING_METHODS.map((method) => {
              const requiresMinNotes = method.value === 'bertopic' || method.value === 'hybrid';
              const isDisabled = isClusteringPatterns || (requiresMinNotes && needsMoreNotes);
              return (
                <button
                  key={method.value}
                  onClick={() => setSelectedMethod(method.value)}
                  disabled={isDisabled}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                    selectedMethod === method.value
                      ? 'bg-primary text-white'
                      : 'bg-white text-text-secondary hover:bg-gray-100',
                    isDisabled && 'cursor-not-allowed opacity-50'
                  )}
                  title={
                    requiresMinNotes && needsMoreNotes
                      ? `Requires ${MIN_NOTES_FOR_BERTOPIC}+ notes (${notesCount} available)`
                      : method.description
                  }
                >
                  {method.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-text-muted">
            {CLUSTERING_METHODS.find((m) => m.value === selectedMethod)?.description}
          </p>
          {needsMoreNotes && (
            <p className="mt-1 text-xs text-text-muted">
              BERTopic/Hybrid require {MIN_NOTES_FOR_BERTOPIC}+ notes ({notesCount} available)
            </p>
          )}
          {clusterMutation.error && (
            <p className="mt-1.5 text-xs text-red-600">
              {clusterMutation.error instanceof Error
                ? clusterMutation.error.message
                : 'Clustering failed'}
            </p>
          )}
        </div>
      )}

      {notesCount === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-gray-50 p-4 text-center">
          <Sparkles className="mx-auto mb-2 h-8 w-8 text-text-muted" />
          <p className="text-sm text-text-muted">
            Add notes to your annotations to discover patterns.
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Press <kbd className="rounded bg-white px-1 py-0.5 text-xs shadow-sm">N</kbd> while
            reviewing to add notes.
          </p>
        </div>
      ) : errorPatterns.length === 0 && !isClusteringPatterns ? (
        <div className="rounded-lg border border-border bg-primary-pale/30 p-4">
          <p className="text-sm text-text-secondary">
            You have <span className="font-medium text-primary">{notesCount}</span> annotations with
            notes.
          </p>
          <button
            onClick={handleClusterPatterns}
            className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
          >
            Discover Patterns
          </button>
        </div>
      ) : isClusteringPatterns ? (
        <div className="flex items-center justify-center py-8">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-text-muted">Analyzing patterns...</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {errorPatterns.map((pattern, idx) => (
            <PatternCard key={idx} pattern={pattern} onSelectRecords={handleSelectRecords} />
          ))}

          {errorPatterns.length > 0 && (
            <p className="text-center text-xs text-text-muted">
              {errorPatterns.length} patterns from {notesCount} notes
            </p>
          )}
        </div>
      )}
    </div>
  );
}
