'use client';

import { ArrowRight, ArrowUpRight, BarChart3, Loader2, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { AgentAvatars } from '@/components/ui/AgentAvatars';
import { getAgentConfig } from '@/config/agents';
import { useMetricDefinitions } from '@/lib/hooks';
import { cn } from '@/lib/utils';

import type { MetricDefinition } from '@/types';

export function KPIDefinitionsSection() {
  const { data, isLoading, error } = useMetricDefinitions();
  const [search, setSearch] = useState('');

  const kpis = useMemo(() => {
    if (!data?.kpi) return [];
    const query = search.toLowerCase().trim();
    return Object.entries(data.kpi).filter(([name, def]) => {
      if (!query) return true;
      return (
        name.toLowerCase().includes(query) ||
        (def.description || '').toLowerCase().includes(query) ||
        (def.agents || []).some(
          (a) =>
            a.toLowerCase().includes(query) ||
            (getAgentConfig(a)?.label ?? '').toLowerCase().includes(query)
        )
      );
    });
  }, [data, search]);

  const totalCount = data?.kpi ? Object.keys(data.kpi).length : 0;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading KPI definitions...
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-12 text-sm text-text-muted">
        Could not load KPI definitions (backend unavailable)
      </p>
    );
  }

  if (totalCount === 0) {
    return (
      <p className="py-12 text-sm text-text-muted">
        No KPI definitions configured. Add them under the{' '}
        <code className="rounded bg-gray-100 px-1.5 py-0.5">kpi:</code> section in{' '}
        <code className="rounded bg-gray-100 px-1.5 py-0.5">
          custom/config/metric_definitions.yaml
        </code>
        .
      </p>
    );
  }

  return (
    <>
      {/* Context banner */}
      <div className="mb-6 flex items-center justify-between rounded-xl border border-accent-gold/20 bg-gradient-to-r from-accent-gold/5 to-transparent px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-gold/10">
            <BarChart3 className="h-4 w-4 text-accent-gold" />
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">
              Business KPIs tracked on the Production dashboard
            </p>
            <p className="text-xs text-text-muted">
              {totalCount} KPIs configured across your operational categories
            </p>
          </div>
        </div>
        <Link
          href="/production"
          className="flex items-center gap-1.5 rounded-lg bg-accent-gold/10 px-3 py-1.5 text-xs font-medium text-accent-gold transition-colors hover:bg-accent-gold/20"
        >
          View Production
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search KPIs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-white py-2.5 pl-10 pr-4 text-sm text-text-primary shadow-sm placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* KPI list */}
      {kpis.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">No KPIs match your search.</p>
      ) : (
        <div className="animate-fade-in-up grid gap-2.5 sm:grid-cols-2">
          {kpis.map(([name, def], index) => (
            <KPICard key={name} name={name} definition={def} index={index} />
          ))}
        </div>
      )}
    </>
  );
}

function KPICard({
  name,
  definition,
  index,
}: {
  name: string;
  definition: MetricDefinition;
  index: number;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-white transition-all duration-300 hover:shadow-md">
      {/* Top accent bar */}
      <div className="absolute left-0 top-0 h-[2px] w-0 bg-accent-gold transition-all duration-300 group-hover:w-full" />

      <div className="flex items-start gap-4 px-5 py-4">
        {/* Index badge */}
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-50 text-xs font-bold text-text-muted transition-colors duration-300 group-hover:bg-accent-gold/10 group-hover:text-accent-gold">
          {String(index + 1).padStart(2, '0')}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4
              className={cn(
                'text-sm font-semibold text-text-primary transition-colors duration-300',
                'group-hover:text-accent-gold'
              )}
            >
              {name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </h4>
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
              {name}
            </code>
            {definition.agents && definition.agents.length > 0 && (
              <AgentAvatars agents={definition.agents} />
            )}
          </div>
          {definition.description && (
            <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
              {definition.description}
            </p>
          )}
        </div>

        {/* Doc link */}
        {definition.link && (
          <a
            href={definition.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex -translate-x-1 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent-gold opacity-0 transition-all duration-300 hover:bg-accent-gold/10 group-hover:translate-x-0 group-hover:opacity-100"
          >
            Docs
            <ArrowUpRight className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
