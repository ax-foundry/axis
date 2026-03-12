'use client';

import { Bot } from 'lucide-react';

import { getAgentConfig } from '@/config/agents';
import { cn } from '@/lib/utils';

interface AgentAvatarsProps {
  agents: string[];
  max?: number;
  className?: string;
}

export function AgentAvatars({ agents, max = 4, className }: AgentAvatarsProps) {
  if (!agents.length) return null;

  const visible = agents.slice(0, max);
  const overflow = agents.length - max;

  return (
    <div className={cn('flex items-center -space-x-1.5', className)}>
      {visible.map((name) => {
        const config = getAgentConfig(name);
        const label = config?.label ?? name;
        const avatar = config?.avatar;

        return (
          <div
            key={name}
            title={label}
            className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-white bg-gray-100 ring-1 ring-border"
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt={label} className="h-5 w-5 rounded-full object-cover" />
            ) : (
              <Bot className="h-3 w-3 text-text-muted" />
            )}
          </div>
        );
      })}
      {overflow > 0 && (
        <div
          title={agents
            .slice(max)
            .map((n) => getAgentConfig(n)?.label ?? n)
            .join(', ')}
          className="flex h-5 flex-shrink-0 items-center justify-center rounded-full border border-white bg-gray-200 px-1 ring-1 ring-border"
        >
          <span className="text-[9px] font-semibold text-text-muted">+{overflow}</span>
        </div>
      )}
    </div>
  );
}
