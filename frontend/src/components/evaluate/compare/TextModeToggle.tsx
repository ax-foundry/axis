'use client';

import { AlignLeft, Scissors, Expand } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';

import type { CompareTextMode } from '@/stores/ui-store';

const TEXT_MODES: Array<{
  id: CompareTextMode;
  label: string;
  icon: typeof AlignLeft;
  description: string;
}> = [
  { id: 'clip', label: 'Clip', icon: Scissors, description: 'Truncate text with ellipsis' },
  { id: 'wrap', label: 'Wrap', icon: AlignLeft, description: 'Wrap text to multiple lines' },
  { id: 'full', label: 'Full', icon: Expand, description: 'Show full text (expand rows)' },
];

export function TextModeToggle() {
  const { compareTextMode, setCompareTextMode } = useUIStore();

  return (
    <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-0.5">
      {TEXT_MODES.map((mode) => {
        const Icon = mode.icon;
        const isActive = mode.id === compareTextMode;

        return (
          <button
            key={mode.id}
            onClick={() => setCompareTextMode(mode.id)}
            title={mode.description}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-all',
              isActive
                ? 'bg-white text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}
