'use client';

import { Upload, Award, Search, GitCompare, BarChart3, Play, Lock } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { PageHeader } from '@/components/ui/PageHeader';
import { getFeaturesConfig } from '@/lib/api';
import { cn } from '@/lib/utils';

const steps = [
  {
    id: 'runner',
    label: 'Runner',
    href: '/evaluate/runner',
    icon: Play,
    description: 'Run batch evaluations',
  },
  {
    id: 'upload',
    label: 'Upload',
    href: '/evaluate/upload',
    icon: Upload,
    description: 'Import evaluation results',
  },
  {
    id: 'scorecard',
    label: 'Scorecard',
    href: '/evaluate/scorecard',
    icon: Award,
    description: 'Executive summary view',
  },
  {
    id: 'deepdive',
    label: 'Deep Dive',
    href: '/evaluate/deep-dive',
    icon: Search,
    description: 'Detailed analysis',
  },
  {
    id: 'compare',
    label: 'Compare',
    href: '/evaluate/compare',
    icon: GitCompare,
    description: 'Compare experiments',
  },
];

export default function EvaluateLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [evalRunnerEnabled, setEvalRunnerEnabled] = useState(true);

  useEffect(() => {
    getFeaturesConfig()
      .then((config) => setEvalRunnerEnabled(config.eval_runner_enabled))
      .catch(() => {
        // Default to enabled if config fetch fails
      });
  }, []);

  const activeStep = pathname.includes('/runner')
    ? 'runner'
    : pathname.includes('/upload')
      ? 'upload'
      : pathname.includes('/scorecard')
        ? 'scorecard'
        : pathname.includes('/deep-dive')
          ? 'deepdive'
          : pathname.includes('/compare')
            ? 'compare'
            : 'runner';

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={BarChart3}
        title="Evaluate"
        subtitle="Run evaluations, import results, and visualize with interactive charts"
      />

      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Step Navigation */}
        <div className="mb-8">
          <nav className="flex items-center">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = step.id === activeStep;
              const stepIndex = steps.findIndex((s) => s.id === activeStep);
              const isPast = index < stepIndex;
              const isDisabled = step.id === 'runner' && !evalRunnerEnabled;

              if (isDisabled) {
                return (
                  <div key={step.id} className="flex flex-1 items-center">
                    <div className="group relative flex w-full cursor-not-allowed items-center gap-3 rounded-lg bg-gray-50 px-4 py-2.5 opacity-50">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-200">
                        <Lock className="h-3.5 w-3.5 text-text-muted" />
                      </div>
                      <div className="text-left">
                        <span className="block text-sm font-semibold text-text-muted">
                          {step.label}
                        </span>
                        <span className="text-xs text-text-muted">{step.description}</span>
                      </div>
                      {/* Tooltip */}
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-text-secondary opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                        Disabled by Admin
                        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white" />
                      </div>
                    </div>
                    {index < steps.length - 1 && <div className="mx-2 h-0.5 w-8 bg-gray-200" />}
                  </div>
                );
              }

              return (
                <div key={step.id} className="flex flex-1 items-center">
                  <Link
                    href={step.href}
                    className={cn(
                      'relative flex w-full items-center gap-3 rounded-lg px-4 py-2.5 transition-colors duration-150',
                      isActive
                        ? 'bg-primary text-white'
                        : isPast
                          ? 'bg-primary-pale/50 text-primary hover:bg-primary-pale'
                          : 'bg-gray-100 text-text-muted hover:bg-gray-200 hover:text-text-primary'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-md',
                        isActive ? 'bg-white/20' : isPast ? 'bg-primary/10' : 'bg-gray-200'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="text-left">
                      <span className="block text-sm font-semibold">{step.label}</span>
                      <span
                        className={cn('text-xs', isActive ? 'text-white/70' : 'text-text-muted')}
                      >
                        {step.description}
                      </span>
                    </div>
                  </Link>
                  {index < steps.length - 1 && (
                    <div
                      className={cn(
                        'mx-2 h-0.5 w-8 transition-colors',
                        isPast ? 'bg-primary' : 'bg-gray-200'
                      )}
                    />
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Step Content */}
        <div className="card">{children}</div>
      </div>
    </div>
  );
}
