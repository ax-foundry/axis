'use client';

import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Loader2,
  MessageSquare,
  Search,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { AgentAvatars } from '@/components/ui/AgentAvatars';
import { getAgentConfig } from '@/config/agents';
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
  hoverBg: string;
  bannerTitle: string;
  bannerSubtitle: (count: number) => string;
  bannerHref: string;
  bannerLinkText: string;
  bannerBorder: string;
  bannerGradient: string;
}

const DOMAIN_CONFIG: Record<DomainKey, DomainConfig> = {
  monitoring: {
    label: 'Monitoring',
    icon: Activity,
    accent: 'bg-primary',
    badgeBg: 'bg-primary/10',
    badgeText: 'text-primary',
    hoverBg: 'hover:bg-primary/10',
    bannerTitle: 'Evaluation metrics tracked on the Monitoring dashboard',
    bannerSubtitle: (n) => `${n} metrics configured for quality monitoring`,
    bannerHref: '/monitoring',
    bannerLinkText: 'View Monitoring',
    bannerBorder: 'border-primary/20',
    bannerGradient: 'from-primary/5',
  },
  signals: {
    label: 'Human Signals',
    icon: MessageSquare,
    accent: 'bg-blue-500',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-600',
    hoverBg: 'hover:bg-blue-50',
    bannerTitle: 'Human review signals tracked on the Signals dashboard',
    bannerSubtitle: (n) => `${n} signals configured for human-in-the-loop review`,
    bannerHref: '/human-signals',
    bannerLinkText: 'View Signals',
    bannerBorder: 'border-blue-500/20',
    bannerGradient: 'from-blue-500/5',
  },
};

export function MetricDefinitionsSection() {
  const { data, isLoading, error } = useMetricDefinitions();
  const [activeTab, setActiveTab] = useState<DomainKey>('monitoring');
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState<string | null>(null);

  const domainCounts = useMemo(() => {
    if (!data) return { monitoring: 0, signals: 0 };
    return {
      monitoring: Object.keys(data.monitoring || {}).length,
      signals: Object.keys(data.signals || {}).length,
    };
  }, [data]);

  const totalCount = domainCounts.monitoring + domainCounts.signals;

  // Unique agents for the active domain
  const uniqueAgents = useMemo(() => {
    if (!data) return [];
    const metrics = data[activeTab] || {};
    const agentSet = new Set<string>();
    Object.values(metrics).forEach((def) => {
      (def.agents || []).forEach((a) => agentSet.add(a));
    });
    return Array.from(agentSet).sort();
  }, [data, activeTab]);

  const filteredEntries = useMemo(() => {
    if (!data) return [];
    const metrics = data[activeTab] || {};
    const query = search.toLowerCase().trim();
    return Object.entries(metrics).filter(([name, def]) => {
      // Agent filter
      if (agentFilter && !(def.agents || []).includes(agentFilter)) return false;
      // Text search
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
  }, [data, activeTab, search, agentFilter]);

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

  const config = DOMAIN_CONFIG[activeTab];
  const Icon = config.icon;

  return (
    <>
      {/* Sub-tabs */}
      <div className="mb-5 flex items-center gap-1 rounded-lg border border-border bg-gray-50 p-1">
        {DOMAIN_KEYS.map((key) => {
          const dc = DOMAIN_CONFIG[key];
          const TabIcon = dc.icon;
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => {
                setActiveTab(key);
                setSearch('');
                setAgentFilter(null);
              }}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all',
                isActive
                  ? 'bg-white text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              )}
            >
              <TabIcon className="h-3.5 w-3.5" />
              {dc.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  isActive ? cn(dc.badgeBg, dc.badgeText) : 'bg-gray-200 text-text-muted'
                )}
              >
                {domainCounts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Banner */}
      <div
        className={cn(
          'mb-5 flex items-center justify-between rounded-xl border px-5 py-3.5',
          config.bannerBorder,
          `bg-gradient-to-r ${config.bannerGradient} to-transparent`
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn('flex h-8 w-8 items-center justify-center rounded-lg', config.badgeBg)}
          >
            <Icon className={cn('h-4 w-4', config.badgeText)} />
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">{config.bannerTitle}</p>
            <p className="text-xs text-text-muted">
              {config.bannerSubtitle(domainCounts[activeTab])}
            </p>
          </div>
        </div>
        <Link
          href={config.bannerHref}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            config.badgeBg,
            config.badgeText,
            'hover:opacity-80'
          )}
        >
          {config.bannerLinkText}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Agent filter chips */}
      {uniqueAgents.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-text-muted">Filter by agent:</span>
          {uniqueAgents.map((name) => {
            const ac = getAgentConfig(name);
            const label = ac?.label ?? name;
            const avatar = ac?.avatar;
            const isSelected = agentFilter === name;
            return (
              <button
                key={name}
                onClick={() => setAgentFilter(isSelected ? null : name)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all',
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-white text-text-secondary hover:border-gray-300 hover:bg-gray-50'
                )}
              >
                <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-gray-100">
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt={label} className="h-4 w-4 rounded-full object-cover" />
                  ) : (
                    <Bot className="h-2.5 w-2.5 text-text-muted" />
                  )}
                </div>
                {label}
                {isSelected && <X className="h-3 w-3" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Search + result counter */}
      <div className="mb-5 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder={`Search ${config.label.toLowerCase()} metrics...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-white py-2.5 pl-10 pr-4 text-sm text-text-primary shadow-sm placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <span className="flex-shrink-0 text-xs text-text-muted">
          Showing {filteredEntries.length} of {domainCounts[activeTab]}
        </span>
      </div>

      {/* Metric cards grid */}
      {filteredEntries.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">No metrics match your search.</p>
      ) : (
        <div className="animate-fade-in-up grid gap-2.5 sm:grid-cols-2">
          {filteredEntries.map(([name, def], index) => (
            <MetricCard
              key={`${activeTab}-${name}`}
              name={name}
              definition={def}
              config={config}
              index={index}
            />
          ))}
        </div>
      )}
    </>
  );
}

function MetricCard({
  name,
  definition,
  config,
  index,
}: {
  name: string;
  definition: MetricDefinition;
  config: DomainConfig;
  index: number;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-white transition-all duration-300 hover:shadow-md">
      {/* Top accent bar */}
      <div
        className={cn(
          'absolute left-0 top-0 h-[2px] w-0 transition-all duration-300 group-hover:w-full',
          config.accent
        )}
      />

      <div className="flex items-start gap-4 px-5 py-4">
        {/* Index badge */}
        <div
          className={cn(
            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-50 text-xs font-bold text-text-muted transition-colors duration-300',
            'group-hover:bg-primary/10 group-hover:text-primary'
          )}
        >
          {String(index + 1).padStart(2, '0')}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-text-primary transition-colors duration-300 group-hover:text-primary">
              {name}
            </h4>
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
            className={cn(
              'flex -translate-x-1 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium opacity-0 transition-all duration-300',
              config.badgeText,
              config.hoverBg,
              'group-hover:translate-x-0 group-hover:opacity-100'
            )}
          >
            Docs
            <ArrowUpRight className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
