'use client';

import { AlertTriangle, ArrowRight, type LucideIcon } from 'lucide-react';

interface PitfallCardProps {
  icon?: LucideIcon;
  title: string;
  mistake: string;
  consequence: string;
  solution: string;
}

export function PitfallCard({
  icon: Icon = AlertTriangle,
  title,
  mistake,
  consequence,
  solution,
}: PitfallCardProps) {
  return (
    <div className="card border-error/20 bg-error/5">
      <div className="mb-4 flex items-start gap-3">
        <div className="bg-error/10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg">
          <Icon className="h-4 w-4 text-error" />
        </div>
        <h4 className="pt-1 text-base font-semibold text-text-primary">{title}</h4>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg bg-white/50 p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-error">The Mistake</p>
          <p className="text-sm text-text-secondary">{mistake}</p>
        </div>

        <div className="flex items-center justify-center">
          <ArrowRight className="h-4 w-4 text-text-muted" />
        </div>

        <div className="rounded-lg bg-white/50 p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-warning">
            The Consequence
          </p>
          <p className="text-sm text-text-secondary">{consequence}</p>
        </div>

        <div className="flex items-center justify-center">
          <ArrowRight className="h-4 w-4 text-text-muted" />
        </div>

        <div className="border-success/20 bg-success/10 rounded-lg border p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-success">
            The Solution
          </p>
          <p className="text-sm text-text-secondary">{solution}</p>
        </div>
      </div>
    </div>
  );
}
