'use client';

import { ChevronDown, ChevronRight, Clock, MapPin } from 'lucide-react';
import { useState } from 'react';

import { SignalDisplay } from '@/components/shared/SignalDisplay';
import { type AnalysisRecord } from '@/types';

interface AnalysisCardProps {
  record: AnalysisRecord;
  defaultExpanded?: boolean;
}

export function AnalysisCard({ record, defaultExpanded = false }: AnalysisCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Format timestamp
  const formattedTime = record.timestamp
    ? new Date(record.timestamp).toLocaleString()
    : 'Unknown time';

  // Build source info string
  const sourceInfo = [
    record.source_info.environment,
    record.source_info.source_name,
    record.source_info.source_component,
  ]
    .filter(Boolean)
    .join(' / ');

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-text-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-muted" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-text-secondary">
              {record.metric_name}
            </span>
            <code className="truncate font-mono text-xs text-text-muted">
              {record.dataset_id.slice(0, 12)}...
            </code>
          </div>
          {record.query && (
            <p className="mt-1 truncate text-sm text-text-secondary">{record.query}</p>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-4 text-xs text-text-muted">
          {sourceInfo && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              <span>{sourceInfo}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{formattedTime}</span>
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border px-4 py-4">
          {/* Query Section */}
          {record.query && (
            <div className="mb-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Query
              </h4>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="whitespace-pre-wrap text-sm text-text-secondary">{record.query}</p>
              </div>
            </div>
          )}

          {/* Output Section */}
          {record.actual_output && (
            <div className="mb-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Output
              </h4>
              <div className="max-h-40 overflow-y-auto rounded-lg bg-gray-50 p-3">
                <p className="whitespace-pre-wrap text-sm text-text-secondary">
                  {record.actual_output}
                </p>
              </div>
            </div>
          )}

          {/* Explanation Section */}
          {record.explanation && (
            <div className="mb-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Explanation
              </h4>
              <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm leading-relaxed text-text-secondary">
                {record.explanation}
              </p>
            </div>
          )}

          {/* Signals Section */}
          {record.signals && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Signals
              </h4>
              <SignalDisplay signals={record.signals} />
            </div>
          )}

          {/* Empty state */}
          {!record.query && !record.actual_output && !record.explanation && !record.signals && (
            <p className="py-4 text-center text-sm italic text-text-muted">
              No additional details available for this record.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
