'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  maxWidth?: string;
}

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  maxWidth = 'max-w-7xl',
}: PageHeaderProps) {
  return (
    <div className="border-b border-border bg-white px-6 py-4">
      <div className={`mx-auto ${maxWidth}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <Icon className="h-[18px] w-[18px] text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-text-primary">{title}</h1>
              {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
