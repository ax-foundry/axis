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
    <div className="border-error/20 rounded-xl border bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="bg-error/10 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg">
          <Icon className="h-3.5 w-3.5 text-error" />
        </div>
        <h4 className="text-xs font-semibold text-text-primary">{title}</h4>
      </div>

      <div className="space-y-2">
        <div className="rounded-lg bg-gray-50 p-2.5">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-error">
            The Mistake
          </p>
          <p className="text-xs text-text-secondary">{mistake}</p>
        </div>

        <div className="flex items-center justify-center">
          <ArrowRight className="h-3 w-3 text-text-muted" />
        </div>

        <div className="rounded-lg bg-gray-50 p-2.5">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
            The Consequence
          </p>
          <p className="text-xs text-text-secondary">{consequence}</p>
        </div>

        <div className="flex items-center justify-center">
          <ArrowRight className="h-3 w-3 text-text-muted" />
        </div>

        <div className="border-success/20 bg-success/5 rounded-lg border p-2.5">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
            The Solution
          </p>
          <p className="text-xs text-text-secondary">{solution}</p>
        </div>
      </div>
    </div>
  );
}
