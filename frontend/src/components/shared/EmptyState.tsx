'use client';

import { type LucideIcon, FileQuestion } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    href: string;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon = FileQuestion,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('py-12 text-center', className)}>
      <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-6 w-6 text-primary/50" />
      </div>
      <h2 className="mb-2 text-xl font-semibold text-text-primary">{title}</h2>
      <p className="mx-auto mb-6 max-w-md text-text-muted">{description}</p>
      {action && (
        <Link href={action.href} className="btn-primary inline-flex items-center gap-2">
          {action.label}
        </Link>
      )}
    </div>
  );
}
