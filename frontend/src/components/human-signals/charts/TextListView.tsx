'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

const TRUNCATE_LENGTH = 160;

interface TextListViewProps {
  data: string[];
}

export function TextListView({ data }: TextListViewProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-muted">
        No data available
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3">
      {data.map((item, i) => {
        const isLong = item.length > TRUNCATE_LENGTH;
        const isExpanded = expandedIdx === i;
        const displayText = isLong && !isExpanded ? item.slice(0, TRUNCATE_LENGTH) + '...' : item;

        return (
          <div key={i} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs leading-relaxed text-text-secondary">{displayText}</p>
              {isLong && (
                <button
                  onClick={() => setExpandedIdx(isExpanded ? null : i)}
                  className="mt-0.5 flex items-center gap-0.5 text-[10px] font-medium text-primary hover:text-primary-dark"
                >
                  {isExpanded ? 'Show less' : 'Show more'}
                  <ChevronDown
                    className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-180')}
                  />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
