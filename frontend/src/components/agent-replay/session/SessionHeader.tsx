'use client';

import { Bot, Calendar, Globe, Hash, Layers, MessageSquare } from 'lucide-react';

import { getAgentConfig } from '@/config/agents';

import type { SessionDetailResponse } from '@/types/replay';

function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) return '';
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface SessionHeaderProps {
  session: SessionDetailResponse;
  agentName?: string | null;
}

export function SessionHeader({ session, agentName }: SessionHeaderProps) {
  const agentConfig = agentName ? getAgentConfig(agentName) : undefined;
  const displayName = agentConfig?.label ?? agentName ?? session.turn_trace_name ?? 'Session';

  return (
    <div className="border-b border-primary/10 bg-gradient-to-r from-primary/[0.04] via-transparent to-primary/[0.02] px-5 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
          {agentConfig?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agentConfig.avatar} alt={displayName} className="h-6 w-6 rounded-lg" />
          ) : (
            <Bot className="h-5 w-5 text-primary" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">{displayName}</span>
            {session.environment && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {session.environment}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-text-muted">
            <Hash className="h-2.5 w-2.5" />
            {session.id}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4 text-[11px] text-text-muted">
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {session.turn_count} {session.turn_count === 1 ? 'turn' : 'turns'}
          </span>
          {session.trace_count > 0 && (
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {session.trace_count} {session.trace_count === 1 ? 'trace' : 'traces'}
            </span>
          )}
          {session.environment && (
            <span className="flex items-center gap-1">
              <Globe className="h-3 w-3" />
              {session.environment}
            </span>
          )}
          {session.created_at && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatRelativeTime(session.created_at)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
