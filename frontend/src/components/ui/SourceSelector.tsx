'use client';

import { Bot } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo } from 'react';

import { getAgentConfig, getAgentRegistry } from '@/config/agents';
import { cn } from '@/lib/utils';
import { useHumanSignalsStore, useKpiStore, useMonitoringStore } from '@/stores';

export type SourceScope = 'monitoring' | 'human_signals' | 'kpi';

interface SourceSelectorProps {
  className?: string;
  /** Which stores to pull agent names from. Defaults to all stores. */
  scope?: SourceScope[];
}

export function SourceSelector({ className, scope }: SourceSelectorProps) {
  const monitoringSourceNames = useMonitoringStore((s) => s.availableSourceNames);
  const humanSignalsSourceNames = useHumanSignalsStore((s) => s.availableSourceNames);
  const kpiSourceNames = useKpiStore((s) => s.availableSourceNames);
  const selectedSourceName = useMonitoringStore((s) => s.selectedSourceName);
  const setMonitoringSource = useMonitoringStore((s) => s.setSelectedSourceName);
  const setHumanSignalsSource = useHumanSignalsStore((s) => s.setSelectedSourceName);

  // Build ordered source list from scoped stores only
  const sources = useMemo(() => {
    const names: string[][] = [];
    const include = (s: SourceScope) => !scope || scope.includes(s);
    if (include('monitoring')) names.push(monitoringSourceNames);
    if (include('human_signals')) names.push(humanSignalsSourceNames);
    if (include('kpi')) names.push(kpiSourceNames);

    const all = new Set(names.flat());
    const registeredNames = getAgentRegistry()
      .filter((a) => all.has(a.name))
      .map((a) => a.name);
    const unregistered = Array.from(all)
      .filter((n) => !registeredNames.includes(n))
      .sort();
    return [...registeredNames, ...unregistered];
  }, [monitoringSourceNames, humanSignalsSourceNames, kpiSourceNames, scope]);

  const handleSelect = useCallback(
    (name: string) => {
      setMonitoringSource(name);
      setHumanSignalsSource(name);
    },
    [setMonitoringSource, setHumanSignalsSource]
  );

  // Auto-select first source when none is selected
  useEffect(() => {
    if (sources.length > 0 && !selectedSourceName) {
      handleSelect(sources[0]);
    }
  }, [sources, selectedSourceName, handleSelect]);

  if (sources.length === 0) return null;

  return (
    <div className={cn('border-b border-border bg-white', className)}>
      <div className="mx-auto flex max-w-7xl items-stretch px-6">
        {/* Individual agent tabs */}
        {sources.map((source) => {
          const config = getAgentConfig(source);
          return (
            <AgentTab
              key={source}
              label={config?.label ?? source}
              role={config?.role}
              avatar={config?.avatar}
              isSelected={selectedSourceName === source}
              onClick={() => handleSelect(source)}
            />
          );
        })}
      </div>
    </div>
  );
}

function AgentTab({
  label,
  role,
  avatar,
  isSelected,
  onClick,
}: {
  label: string;
  role?: string;
  avatar?: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-2 px-5 py-2.5 transition-colors',
        isSelected ? '' : 'hover:text-text-primary'
      )}
    >
      {/* Bottom underline */}
      <span
        className={cn(
          'absolute inset-x-3 bottom-0 h-0.5 rounded-t transition-colors',
          isSelected ? 'bg-primary' : 'bg-transparent group-hover:bg-border'
        )}
      />

      {/* Avatar */}
      {avatar ? (
        <div
          className={cn(
            'h-[26px] w-[26px] flex-shrink-0 overflow-hidden rounded-md',
            isSelected ? 'bg-primary-pale' : 'bg-gray-100'
          )}
        >
          <Image src={avatar} alt={label} width={26} height={26} className="object-cover" />
        </div>
      ) : (
        <div
          className={cn(
            'flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-md',
            isSelected ? 'bg-primary-pale' : 'bg-gray-100'
          )}
        >
          <Bot
            className={cn('h-3.5 w-3.5', isSelected ? 'text-primary-dark' : 'text-text-muted')}
          />
        </div>
      )}

      {/* Text */}
      <div className="flex flex-col items-start leading-none">
        <span
          className={cn(
            'text-[13px] transition-colors',
            isSelected ? 'font-semibold text-primary-dark' : 'font-medium text-text-secondary'
          )}
        >
          {label}
        </span>
        {role && (
          <span
            className={cn('mt-0.5 text-[10px]', isSelected ? 'text-primary' : 'text-text-muted')}
          >
            {role}
          </span>
        )}
      </div>
    </button>
  );
}
