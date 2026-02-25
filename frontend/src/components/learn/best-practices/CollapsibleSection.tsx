'use client';

import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react';

import { useUIStore } from '@/stores/ui-store';

interface CollapsibleSectionProps {
  id: string;
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  title: string;
  summary: string;
  children: React.ReactNode;
}

export function CollapsibleSection({
  id,
  icon: Icon,
  iconColor = 'text-primary',
  iconBgColor = 'bg-primary-pale',
  title,
  summary,
  children,
}: CollapsibleSectionProps) {
  const { learnExpandedSections, toggleLearnExpandedSection } = useUIStore();
  const isExpanded = learnExpandedSections.includes(id);

  return (
    <div className="card">
      {/* Header - Always visible */}
      <button
        onClick={() => toggleLearnExpandedSection(id)}
        className="flex w-full items-start gap-4 text-left"
      >
        <div
          className={`h-10 w-10 ${iconBgColor} flex flex-shrink-0 items-center justify-center rounded-lg transition-transform duration-200 ${
            isExpanded ? 'scale-110' : ''
          }`}
        >
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
            {isExpanded ? (
              <ChevronDown className="h-5 w-5 flex-shrink-0 text-text-muted" />
            ) : (
              <ChevronRight className="h-5 w-5 flex-shrink-0 text-text-muted" />
            )}
          </div>
          <p className="mt-1 text-sm text-text-muted">{summary}</p>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="animate-fade-in-up mt-6 border-t border-border pt-6">{children}</div>
      )}
    </div>
  );
}
