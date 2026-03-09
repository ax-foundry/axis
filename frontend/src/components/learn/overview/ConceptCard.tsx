'use client';

import { type LucideIcon } from 'lucide-react';

interface ConceptCardProps {
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}

export function ConceptCard({
  icon: Icon,
  iconColor = 'text-primary',
  iconBgColor = 'bg-primary/10',
  title,
  description,
  children,
}: ConceptCardProps) {
  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <div
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${iconBgColor}`}
        >
          <Icon className={`h-[18px] w-[18px] ${iconColor}`} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <p className="text-xs text-text-muted">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
