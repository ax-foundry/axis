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
    bubble: 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900',
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
    <div className="overflow-hidden rounded border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
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
        <div className="border-t border-gray-200 bg-surface px-3 py-2 text-xs dark:border-gray-700">
          <SmartContent text={text} />
        </div>
      )}
    </div>
  );
}

function ChatMessage({ role, text }: { role: string; text: string }) {
  const config = ROLE_CONFIG[role] || {
    align: 'left' as const,
    bubble: 'border-border bg-surface',
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
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface ring-1 ring-border',
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

  // String content — try JSON parse first so chat-style dicts/arrays still render richly
  if (typeof content === 'string') {
    try {
      const parsed: unknown = JSON.parse(content);
      if (typeof parsed === 'object' && parsed !== null) {
        return <PromptViewer content={parsed} className={className} />;
      }
    } catch {
      // not JSON, fall through to plain text
    }
    return (
      <div className={cn(className)}>
        <SmartContent text={content} />
      </div>
    );
  }

  // ML chat-style dict: { system: "...", user: "...", assistant: "..." }
  // Only role keys with string values are rendered as messages; extra keys (model, temperature, etc.) are ignored.
  if (typeof content === 'object' && content !== null && !Array.isArray(content)) {
    const obj = content as Record<string, unknown>;
    const ROLE_KEYS = new Set(['system', 'user', 'assistant', 'tool']);
    const roleKeys = Object.keys(obj).filter(
      (k) => ROLE_KEYS.has(k.toLowerCase()) && typeof obj[k] === 'string'
    );
    if (roleKeys.length > 0) {
      const roleOrder = ['system', 'user', 'assistant', 'tool'];
      const sorted = [...roleKeys].sort((a, b) => {
        const ai = roleOrder.indexOf(a.toLowerCase());
        const bi = roleOrder.indexOf(b.toLowerCase());
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      const messages = sorted.map((k) => ({ role: k.toLowerCase(), content: obj[k] as string }));
      return <div className={cn(className)}>{renderMessages(messages)}</div>;
    }
  }

  // Flat dict (all primitive values) — render as compact key-value table
  if (typeof content === 'object' && content !== null && !Array.isArray(content)) {
    const obj = content as Record<string, unknown>;
    const isFlat = Object.values(obj).every(
      (v) => v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    );

    if (isFlat) {
      return (
        <div className={cn('overflow-hidden rounded-lg border border-border', className)}>
          <table className="w-full text-xs">
            <tbody>
              {Object.entries(obj).map(([key, value]) => (
                <tr key={key} className="border-border/30 border-b last:border-0">
                  <td className="whitespace-nowrap py-1.5 pl-3 pr-3 font-mono text-[10px] font-medium text-text-muted">
                    {key}
                  </td>
                  <td className="break-all py-1.5 pr-3 text-text-primary">
                    {value === null ? (
                      <span className="italic text-text-muted">null</span>
                    ) : typeof value === 'boolean' ? (
                      <span className={value ? 'text-emerald-600' : 'text-text-muted'}>
                        {String(value)}
                      </span>
                    ) : typeof value === 'number' ? (
                      <span className="font-mono">{String(value)}</span>
                    ) : (
                      String(value)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // Nested dict — render each top-level key as a labelled section
    return (
      <div className={cn('space-y-2', className)}>
        {Object.entries(obj).map(([key, value]) => (
          <div key={key} className="overflow-hidden rounded-lg border border-border">
            <div className="border-b border-border bg-gray-50/60 px-3 py-1">
              <span className="font-mono text-[10px] font-semibold text-text-muted">{key}</span>
            </div>
            <div className="px-3 py-2 text-xs text-text-secondary">
              <ContentRenderer
                content={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                forceType={typeof value !== 'string' ? 'json' : undefined}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // String / other fallback
  return (
    <div className={cn(className)}>
      <ContentRenderer content={JSON.stringify(content, null, 2)} forceType="json" />
    </div>
  );
}
