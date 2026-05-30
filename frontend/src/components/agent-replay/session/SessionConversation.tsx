'use client';

import { Bot, ExternalLink, User } from 'lucide-react';
import { useState } from 'react';

import { SmartContent } from '@/components/agent-replay/smart-content';
import { getAgentConfig } from '@/config/agents';
import { cn } from '@/lib/utils';

import type { SessionTurn } from '@/types/replay';

interface TurnCardProps {
  turn: SessionTurn;
  onOpenTrace?: (traceId: string) => void;
  agentAvatar?: string;
  agentLabel?: string;
}

function TurnCard({ turn, onOpenTrace, agentAvatar, agentLabel }: TurnCardProps) {
  const [expanded, setExpanded] = useState(true);
  const hasTrace = !!turn.trace_id;

  return (
    <div className="overflow-hidden rounded-xl border border-l-2 border-border border-l-primary/30 bg-surface shadow-sm transition-all hover:border-l-primary/60 hover:shadow-md">
      {/* Turn header */}
      <div
        className="border-border/50 flex cursor-pointer items-center gap-3 border-b bg-gradient-to-r from-primary/[0.04] to-transparent px-4 py-2.5"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white shadow-sm">
          {turn.index + 1}
        </span>
        <span className="flex-1 text-[11px] font-semibold text-text-muted">
          {turn.trace_name ?? 'Turn'}
        </span>
        {turn.timestamp && (
          <span className="text-text-muted/60 text-[10px]">
            {new Date(turn.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
        {hasTrace && onOpenTrace && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenTrace(turn.trace_id!);
            }}
            className="bg-primary/8 flex items-center gap-1.5 rounded-lg border border-primary/30 px-2.5 py-1 text-[10px] font-semibold text-primary transition-all hover:border-primary/60 hover:bg-primary/15 hover:shadow-sm"
            title="Open trace replay for this turn"
          >
            <ExternalLink className="h-2.5 w-2.5" />
            View trace
          </button>
        )}
      </div>

      {/* Messages */}
      {expanded && (
        <div className="divide-border/40 divide-y">
          {turn.user_message && (
            <div className="flex gap-3 border-l-2 border-l-blue-300/60 bg-blue-50/30 px-4 py-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 ring-1 ring-blue-200">
                <User className="h-3.5 w-3.5 text-blue-500" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-blue-500">
                  User
                </div>
                <div className="text-sm text-text-primary">
                  <SmartContent text={turn.user_message} />
                </div>
              </div>
            </div>
          )}

          {turn.assistant_message && (
            <div className="flex gap-3 border-l-2 border-l-primary/40 bg-primary/[0.025] px-4 py-3">
              <div
                className={cn(
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1',
                  agentAvatar
                    ? 'ring-primary/20'
                    : 'bg-gradient-to-br from-primary/20 to-primary/5 ring-primary/15'
                )}
              >
                {agentAvatar ? (
                  <img
                    src={agentAvatar}
                    alt={agentLabel ?? 'Assistant'}
                    className="h-6 w-6 object-cover"
                  />
                ) : (
                  <Bot className="h-3.5 w-3.5 text-primary" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  {agentLabel ?? 'Assistant'}
                </div>
                <div className="text-sm text-text-primary">
                  <SmartContent text={turn.assistant_message} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface SessionConversationProps {
  turns: SessionTurn[];
  onOpenTrace?: (traceId: string) => void;
  agentName?: string | null;
}

export function SessionConversation({ turns, onOpenTrace, agentName }: SessionConversationProps) {
  const agentConfig = agentName ? getAgentConfig(agentName) : undefined;
  const agentAvatar = agentConfig?.avatar;
  const agentLabel = agentConfig?.label ?? agentName ?? undefined;

  if (turns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-text-muted">
        <Bot className="h-10 w-10 text-border" />
        <p className="text-sm">No turns found in this session.</p>
        <p className="text-text-muted/60 text-xs">
          The session may not have qualifying turn traces, or it may be empty.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 px-6 py-6">
      {turns.map((turn) => (
        <TurnCard
          key={turn.index}
          turn={turn}
          onOpenTrace={onOpenTrace}
          agentAvatar={agentAvatar}
          agentLabel={agentLabel}
        />
      ))}
    </div>
  );
}
