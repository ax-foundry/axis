'use client';

import Link from 'next/link';

import type { LucideIcon } from 'lucide-react';

interface EmptyDataStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  linkTo: string;
  linkText: string;
}

export function EmptyDataState({
  icon: Icon,
  title,
  description,
  linkTo,
  linkText,
}: EmptyDataStateProps) {
  return (
    <div className="border-border/50 flex flex-col items-center justify-center rounded-lg border border-dashed bg-gray-50/50 p-8 text-center">
      <div className="bg-muted/50 mb-4 flex h-12 w-12 items-center justify-center rounded-full">
        <Icon className="h-6 w-6 text-text-muted" />
      </div>
      <h3 className="text-sm font-medium text-text-primary">{title}</h3>
      <p className="mt-1 max-w-xs text-xs text-text-muted">{description}</p>
      <Link
        href={linkTo}
        className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
      >
        {linkText}
      </Link>
    </div>
  );
}
