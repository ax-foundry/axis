'use client';

import { Activity, ArrowUpRight, Loader2, MessageSquare, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useMetricDefinitions } from '@/lib/hooks';
import { cn } from '@/lib/utils';

import type { MetricDefinition } from '@/types';

const DOMAIN_KEYS = ['monitoring', 'signals'] as const;
type DomainKey = (typeof DOMAIN_KEYS)[number];

interface DomainConfig {
  label: string;
  icon: React.ElementType;
  accent: string;
  badgeBg: string;
  badgeText: string;
  dotColor: string;
}

const DOMAIN_CONFIG: Record<DomainKey, DomainConfig> = {
  monitoring: {
    label: 'Monitoring',
    icon: Activity,
    accent: 'bg-primary',
    badgeBg: 'bg-primary/10',
    badgeText: 'text-primary',
    dotColor: 'bg-primary',
  },
  signals: {
    label: 'Human Signals',
    icon: MessageSquare,
    accent: 'bg-blue-500',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-600',
    dotColor: 'bg-blue-500',
  },
};

export function MetricDefinitionsSection() {
  const { data, isLoading, error } = useMetricDefinitions();
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState<DomainKey | 'all'>('all');

  const filteredDomains = useMemo(() => {
    if (!data) return [];

    const query = search.toLowerCase().trim();
    const keys: readonly DomainKey[] = domainFilter === 'all' ? DOMAIN_KEYS : [domainFilter];

    return keys
      .map((key) => {
        const metrics = data[key] || {};
        const entries = Object.entries(metrics).filter(([name, def]) => {
          if (!query) return true;
          return (
            name.toLowerCase().includes(query) ||
            (def.description || '').toLowerCase().includes(query)
          );
        });
        return { key, label: DOMAIN_CONFIG[key].label, entries };
      })
      .filter((d) => d.entries.length > 0);
  }, [data, search, domainFilter]);

  const totalCount = useMemo(() => {
    if (!data) return 0;
    return DOMAIN_KEYS.reduce((sum, k) => sum + Object.keys(data[k] || {}).length, 0);
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading definitions...
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-12 text-sm text-text-muted">
        Could not load metric definitions (backend unavailable)
      </p>
    );
  }

  if (totalCount === 0) {
    return (
      <p className="py-12 text-sm text-text-muted">
        No metric definitions configured. Add them to{' '}
        <code className="rounded bg-gray-100 px-1.5 py-0.5">
          custom/config/metric_definitions.yaml
        </code>
        .
      </p>
    );
  }

  return (
    <>
      {/* Search + domain filter */}
      <div className="mb-6 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search metrics..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-white py-2.5 pl-10 pr-4 text-sm text-text-primary shadow-sm placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value as DomainKey | 'all')}
          className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">All Domains</option>
          {DOMAIN_KEYS.map((k) => (
            <option key={k} value={k}>
              {DOMAIN_CONFIG[k].label}
            </option>
          ))}
        </select>
      </div>

      {/* Domain groups */}
      {filteredDomains.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">No metrics match your search.</p>
      ) : (
        <div className="space-y-8">
          {filteredDomains.map((domain) => {
            const config = DOMAIN_CONFIG[domain.key];
            const Icon = config.icon;

            return (
              <div key={domain.key} className="animate-fade-in-up">
                {/* Domain header */}
                <div className="mb-3 flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-lg',
                      config.badgeBg
                    )}
                  >
                    <Icon className={cn('h-3.5 w-3.5', config.badgeText)} />
                  </div>
                  <h3 className="text-sm font-semibold text-text-primary">{domain.label}</h3>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      config.badgeBg,
                      config.badgeText
                    )}
                  >
                    {domain.entries.length}
                  </span>
                </div>

                {/* Metric cards grid */}
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {domain.entries.map(([name, def]) => (
                    <MetricCard
                      key={`${domain.key}-${name}`}
                      name={name}
                      definition={def}
                      config={config}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function MetricCard({
  name,
  definition,
  config,
}: {
  name: string;
  definition: MetricDefinition;
  config: DomainConfig;
}) {
  const hasLink = !!definition.link;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-white p-4 transition-all duration-300 hover:shadow-md">
      {/* Top accent bar — reveals on hover */}
      <div
        className={cn(
          'absolute left-0 top-0 h-[2px] w-0 transition-all duration-300 group-hover:w-full',
          config.accent
        )}
      />

      <div className="flex items-start gap-3">
        {/* Color dot */}
        <div className={cn('mt-1.5 h-2 w-2 flex-shrink-0 rounded-full', config.dotColor)} />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary transition-colors duration-300 group-hover:text-primary">
            {name}
          </p>
          {definition.description && (
            <p className="mt-1 text-xs leading-relaxed text-text-muted">{definition.description}</p>
          )}
        </div>
      </div>

      {/* Doc link — slides in on hover */}
      {hasLink && (
        <a
          href={definition.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2.5 flex -translate-x-1 items-center gap-1 text-xs font-medium text-primary opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"
        >
          View docs
          <ArrowUpRight className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
