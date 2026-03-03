'use client';

import { Bot, Clock, Hash, Layers, Zap } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo } from 'react';

import { getAgentConfig, getAgentRegistry } from '@/config/agents';
import { cn } from '@/lib/utils';
import { useReplayStore } from '@/stores/replay-store';

import type { TraceDetail } from '@/types/replay';

function formatMs(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface AgentIdentityBarProps {
  trace?: TraceDetail | null;
  className?: string;
}

export function AgentIdentityBar({ trace, className }: AgentIdentityBarProps) {
  const rawAgents = useReplayStore((s) => s.availableAgents);
  const selectedAgent = useReplayStore((s) => s.selectedAgent);
  const setSelectedAgent = useReplayStore((s) => s.setSelectedAgent);

  // Order by agent registry position, then alphabetical for unregistered
  const availableAgents = useMemo(() => {
    const agentSet = new Set(rawAgents);
    const registeredNames = getAgentRegistry()
      .filter((a) => agentSet.has(a.name))
      .map((a) => a.name);
    const unregistered = rawAgents.filter((n) => !registeredNames.includes(n)).sort();
    return [...registeredNames, ...unregistered];
  }, [rawAgents]);

  // Auto-select first agent when agents load and none selected
  const handleAutoSelect = useCallback(() => {
    if (availableAgents.length > 0 && !selectedAgent) {
      setSelectedAgent(availableAgents[0]);
    }
  }, [availableAgents, selectedAgent, setSelectedAgent]);

  useEffect(() => {
    handleAutoSelect();
  }, [handleAutoSelect]);

  // No agents configured — don't render the bar
  if (availableAgents.length === 0) return null;

  return (
    <div
      className={cn(
        'border-b border-primary/10 bg-gradient-to-r from-white via-primary/[0.02] to-white',
        className
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center px-6">
        {/* Agent tabs */}
        <div className="flex items-stretch">
          {availableAgents.map((agentName) => {
            const config = getAgentConfig(agentName);
            const isSelected = selectedAgent === agentName;
            return (
              <button
                key={agentName}
                onClick={() => setSelectedAgent(agentName)}
                className={cn(
                  'relative flex items-center gap-2 px-5 py-2.5 transition-all',
                  isSelected ? '' : 'hover:bg-primary/[0.03]'
                )}
              >
                {/* Bottom underline */}
                <span
                  className={cn(
                    'absolute inset-x-3 bottom-0 h-[3px] rounded-t transition-all',
                    isSelected ? 'bg-gradient-to-r from-primary to-primary-dark' : 'bg-transparent'
                  )}
                />

                {/* Avatar */}
                {config?.avatar ? (
                  <div
                    className={cn(
                      'h-[26px] w-[26px] flex-shrink-0 overflow-hidden rounded-md shadow-sm transition-shadow',
                      isSelected ? 'bg-primary-pale shadow-primary/20' : 'bg-gray-100'
                    )}
                  >
                    <Image
                      src={config.avatar}
                      alt={config.label}
                      width={26}
                      height={26}
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div
                    className={cn(
                      'flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-md shadow-sm transition-all',
                      isSelected ? 'bg-primary/15 shadow-primary/20' : 'bg-gray-100'
                    )}
                  >
                    <Bot
                      className={cn(
                        'h-3.5 w-3.5',
                        isSelected ? 'text-primary-dark' : 'text-text-muted'
                      )}
                    />
                  </div>
                )}

                {/* Text */}
                <div className="flex flex-col items-start leading-none">
                  <span
                    className={cn(
                      'text-[13px] transition-colors',
                      isSelected ? 'font-bold text-primary-dark' : 'font-medium text-text-secondary'
                    )}
                  >
                    {config?.label ?? agentName.charAt(0).toUpperCase() + agentName.slice(1)}
                  </span>
                  {config?.role && (
                    <span
                      className={cn(
                        'mt-0.5 text-[10px]',
                        isSelected ? 'text-primary' : 'text-text-muted'
                      )}
                    >
                      {config.role}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* KPI chips — shown when a trace is loaded */}
        {trace && (
          <>
            <div className="mx-4 hidden h-6 w-px bg-primary/10 sm:block" />
            <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
              <span className="bg-primary/8 flex items-center gap-1 rounded-full px-2.5 py-1 font-medium text-primary-dark">
                <Layers className="h-3 w-3 text-primary" />
                {trace.tree.length > 0
                  ? `${trace.tree.reduce((sum, root) => sum + root.children.length, 0)} nodes`
                  : `${trace.steps.length} steps`}
              </span>
              {trace.total_latency_ms != null && (
                <span className="bg-primary/8 flex items-center gap-1 rounded-full px-2.5 py-1 font-medium text-primary-dark">
                  <Clock className="h-3 w-3 text-primary" />
                  {formatMs(trace.total_latency_ms)}
                </span>
              )}
              <span className="bg-primary/8 flex items-center gap-1 rounded-full px-2.5 py-1 font-medium text-primary-dark">
                <Zap className="h-3 w-3 text-primary" />
                {formatTokenCount(trace.total_tokens.total)} tokens
              </span>
              <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 font-mono text-[10px] text-text-muted">
                <Hash className="h-3 w-3" />
                {trace.id.slice(0, 8)}...
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
