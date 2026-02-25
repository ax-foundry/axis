'use client';

import { Bot, ChevronDown, ChevronRight, Shield, User, Wrench } from 'lucide-react';
import { useState } from 'react';

import { ContentRenderer } from '@/components/ui/ContentRenderer';
import { cn } from '@/lib/utils';

import { SmartContent } from './smart-content';

import type { LucideIcon } from 'lucide-react';

interface PromptViewerProps {
  content: unknown;
  className?: string;
}

const ROLE_CONFIG: Record<
  string,
  {
    align: 'left' | 'right';
    bubble: string;
    badge: string;
    label: string;
    Icon: LucideIcon;
    iconColor: string;
  }
> = {
  system: {
    align: 'left',
    bubble: 'border-gray-200 bg-gray-50',
    badge: 'bg-gray-600 text-white',
    label: 'System',
    Icon: Shield,
    iconColor: 'text-gray-500',
  },
  user: {
    align: 'right',
    bubble: 'border-primary/20 bg-primary/5',
    badge: 'bg-primary text-white',
    label: 'User',
    Icon: User,
    iconColor: 'text-primary',
  },
  assistant: {
    align: 'left',
    bubble: 'border-emerald-200 bg-emerald-50/40',
    badge: 'bg-emerald-600 text-white',
    label: 'Assistant',
    Icon: Bot,
    iconColor: 'text-emerald-600',
  },
  tool: {
    align: 'left',
    bubble: 'border-amber-200 bg-amber-50/40',
    badge: 'bg-amber-600 text-white',
    label: 'Tool',
    Icon: Wrench,
    iconColor: 'text-amber-600',
  },
};

function getMessageContent(msg: { content?: unknown }): string {
  if (typeof msg.content === 'string') return msg.content;
  if (msg.content == null) return '';
  return JSON.stringify(msg.content, null, 2);
}

function SystemMessage({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="overflow-hidden rounded border border-gray-200 bg-gray-50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-gray-100"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-gray-400" />
        )}
        <Shield className="h-3 w-3 shrink-0 text-gray-500" />
        <span className="rounded bg-gray-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
          System
        </span>
        <span className="truncate font-medium text-text-secondary">System prompt</span>
        <span className="ml-auto shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-[9px] font-medium text-text-muted">
          {text.length.toLocaleString()} chars
        </span>
      </button>
      {expanded && (
        <div className="border-t border-gray-200 bg-white px-3 py-2 text-xs">
          <SmartContent text={text} />
        </div>
      )}
    </div>
  );
}

function ChatMessage({ role, text }: { role: string; text: string }) {
  const config = ROLE_CONFIG[role] || {
    align: 'left' as const,
    bubble: 'border-border bg-white',
    badge: 'bg-gray-500 text-white',
    label: role.charAt(0).toUpperCase() + role.slice(1),
    Icon: Bot,
    iconColor: 'text-gray-500',
  };

  const isRight = config.align === 'right';
  const isTool = role === 'tool';
  const Icon = config.Icon;

  return (
    <div className={cn('flex gap-1.5', isRight && 'flex-row-reverse')}>
      {/* Avatar circle */}
      <div
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-border',
          isRight && 'ring-primary/20'
        )}
      >
        <Icon className={cn('h-2.5 w-2.5', config.iconColor)} />
      </div>

      {/* Bubble */}
      <div
        className={cn(
          'max-w-[90%] overflow-hidden rounded-lg border',
          config.bubble,
          isRight ? 'rounded-tr-sm' : 'rounded-tl-sm'
        )}
      >
        <div className="flex items-center gap-1.5 px-2 py-1">
          <span
            className={cn(
              'rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide',
              config.badge
            )}
          >
            {config.label}
          </span>
        </div>
        <div className="border-border/50 border-t px-2 py-1.5 text-xs leading-relaxed text-text-secondary">
          <SmartContent text={text} forceType={isTool ? 'json' : undefined} />
        </div>
      </div>
    </div>
  );
}

function renderMessages(messages: Array<{ role?: string; content?: unknown }>) {
  return (
    <div className="space-y-2">
      {messages.map((msg, i) => {
        const role = (msg.role || 'unknown').toLowerCase();
        const text = getMessageContent(msg);

        if (role === 'system') {
          return <SystemMessage key={i} text={text} />;
        }

        return <ChatMessage key={i} role={role} text={text} />;
      })}
    </div>
  );
}

export function PromptViewer({ content, className }: PromptViewerProps) {
  if (content == null) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-text-muted">
        <User className="h-8 w-8 text-border" />
        <span className="text-sm italic">No input</span>
      </div>
    );
  }

  // Chat message array
  if (
    Array.isArray(content) &&
    content.length > 0 &&
    typeof content[0] === 'object' &&
    content[0] !== null &&
    'role' in content[0]
  ) {
    return (
      <div className={cn(className)}>
        {renderMessages(content as Array<{ role: string; content: string }>)}
      </div>
    );
  }

  // String content
  if (typeof content === 'string') {
    return (
      <div className={cn(className)}>
        <SmartContent text={content} />
      </div>
    );
  }

  // Object/dict content
  return (
    <div className={cn(className)}>
      <ContentRenderer content={JSON.stringify(content, null, 2)} forceType="json" />
    </div>
  );
}
