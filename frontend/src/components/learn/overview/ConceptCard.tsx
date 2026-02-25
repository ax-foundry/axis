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
  iconBgColor = 'bg-primary-pale',
  title,
  description,
  children,
}: ConceptCardProps) {
  return (
    <div className="card">
      <div className="flex items-start gap-4">
        <div
          className={`h-12 w-12 ${iconBgColor} flex flex-shrink-0 items-center justify-center rounded-xl`}
        >
          <Icon className={`h-6 w-6 ${iconColor}`} />
        </div>
        <div className="flex-1">
          <h3 className="mb-2 text-lg font-semibold text-text-primary">{title}</h3>
          <p className="mb-4 text-text-muted">{description}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
