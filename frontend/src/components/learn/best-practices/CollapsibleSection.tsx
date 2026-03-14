'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';

import { useUIStore } from '@/stores/ui-store';

interface CollapsibleSectionProps {
  id: string;
  title: string;
  summary: string;
  children: React.ReactNode;
}

export function CollapsibleSection({ id, title, summary, children }: CollapsibleSectionProps) {
  const { learnExpandedSections, toggleLearnExpandedSection } = useUIStore();
  const isExpanded = learnExpandedSections.includes(id);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      {/* Header - Always visible */}
      <button
        onClick={() => toggleLearnExpandedSection(id)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <p className="mt-1 text-xs text-text-muted">{summary}</p>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-text-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-muted" />
        )}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="animate-fade-in-up mt-6 border-t border-border pt-6">{children}</div>
      )}
    </div>
  );
}
