'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface CollapsibleSectionProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Extra content rendered in the header row (e.g. alert badge) */
  headerRight?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleSection({
  icon: Icon,
  title,
  subtitle,
  headerRight,
  children,
  defaultOpen = true,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="space-y-4">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="border-border/60 -mx-3 flex w-[calc(100%+1.5rem)] items-center gap-3 rounded-lg border bg-gray-50/80 px-4 py-3 text-left transition-colors hover:bg-gray-100"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-text-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 text-text-muted" />
        )}
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4.5 w-4.5 text-primary" />
        </div>
        <h2 className="text-lg font-bold tracking-tight text-text-primary">{title}</h2>
        {subtitle && <span className="text-sm text-text-muted">{subtitle}</span>}
        {headerRight && <div className="ml-auto">{headerRight}</div>}
      </button>
      <div className={cn(!isOpen && 'hidden')}>{children}</div>
    </div>
  );
}
