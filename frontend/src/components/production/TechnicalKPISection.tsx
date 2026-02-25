'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

interface TechnicalKPISectionProps {
  alertCount: number;
}

/**
 * Renders the alerts badge for the AI Quality Monitoring section header.
 * The section header itself is provided by CollapsibleSection on the page.
 */
export function TechnicalKPISection({ alertCount }: TechnicalKPISectionProps) {
  return (
    <Link
      href="/monitoring"
      className={cn(
        'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
        alertCount > 0
          ? 'border-error/30 bg-error/5 hover:bg-error/10 text-error'
          : 'border-border bg-white text-text-muted hover:bg-gray-50'
      )}
    >
      <Bell className="h-4 w-4" />
      <span>
        {alertCount} Alert{alertCount !== 1 ? 's' : ''}
      </span>
    </Link>
  );
}
