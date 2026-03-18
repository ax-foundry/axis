'use client';

import {
  Activity,
  AlertCircle,
  Brain,
  CheckCircle2,
  ChevronRight,
  Database,
  Eye,
  GitBranch,
  LayoutList,
  Lightbulb,
  ListTodo,
  Loader2,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import type { Thought, ThoughtType } from '@/types';

// ─── Step style config ────────────────────────────────────────────────────────

interface StepStyle {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  iconClass: string;
  bgClass: string;
}

const TYPE_MAP: Record<ThoughtType, StepStyle> = {
  reasoning: {
    icon: Brain,
    label: 'Analyzing',
    iconClass: 'text-blue-500',
    bgClass: 'bg-blue-50 dark:bg-blue-900/30',
  },
  tool_use: {
    icon: Zap,
    label: 'Using Tool',
    iconClass: 'text-violet-500',
    bgClass: 'bg-violet-50 dark:bg-violet-900/30',
  },
  observation: {
    icon: Eye,
    label: 'Observing',
    iconClass: 'text-emerald-500',
    bgClass: 'bg-emerald-50 dark:bg-emerald-900/30',
  },
  planning: {
    icon: ListTodo,
    label: 'Planning',
    iconClass: 'text-amber-500',
    bgClass: 'bg-amber-50 dark:bg-amber-900/30',
  },
  reflection: {
    icon: Lightbulb,
    label: 'Reflecting',
    iconClass: 'text-yellow-500',
    bgClass: 'bg-yellow-50 dark:bg-yellow-900/30',
  },
  decision: {
    icon: GitBranch,
    label: 'Deciding',
    iconClass: 'text-purple-500',
    bgClass: 'bg-purple-50 dark:bg-purple-900/30',
  },
  success: {
    icon: CheckCircle2,
    label: 'Complete',
    iconClass: 'text-green-500',
    bgClass: 'bg-green-50 dark:bg-green-900/30',
  },
  error: {
    icon: AlertCircle,
    label: 'Error',
    iconClass: 'text-red-500',
    bgClass: 'bg-red-50 dark:bg-red-900/30',
  },
};

function getStepStyle(thought: Thought): StepStyle {
  if (thought.type === 'tool_use') {
    const tool = thought.tool_name?.toLowerCase() ?? '';
    if (tool.includes('sql') || tool.includes('query') || tool.includes('kpi')) {
      return {
        icon: Database,
        label: tool.includes('kpi') ? 'Fetching KPIs' : 'Querying Data',
        iconClass: 'text-violet-500',
        bgClass: 'bg-violet-50 dark:bg-violet-900/30',
      };
    }
    if (tool.includes('summarize')) {
      return {
        icon: LayoutList,
        label: 'Summarizing',
        iconClass: 'text-cyan-600',
        bgClass: 'bg-cyan-50 dark:bg-cyan-900/30',
      };
    }
    if (tool.includes('analyze')) {
      return {
        icon: Activity,
        label: 'Analyzing Data',
        iconClass: 'text-orange-500',
        bgClass: 'bg-orange-50 dark:bg-orange-900/30',
      };
    }
    if (tool.includes('compare')) {
      return {
        icon: TrendingUp,
        label: 'Comparing',
        iconClass: 'text-indigo-500',
        bgClass: 'bg-indigo-50 dark:bg-indigo-900/30',
      };
    }
  }
  return TYPE_MAP[thought.type] ?? TYPE_MAP.reasoning;
}

// ─── Single step row ──────────────────────────────────────────────────────────

function StepRow({
  thought,
  index,
  isLatest,
  isStreaming,
}: {
  thought: Thought;
  index: number;
  isLatest: boolean;
  isStreaming: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { icon: Icon, label, iconClass, bgClass } = getStepStyle(thought);
  const isLong = thought.content.length > 80;

  return (
    <div
      className={cn(
        'flex cursor-pointer items-start gap-3 px-4 py-2 transition-colors',
        isLatest && isStreaming
          ? 'bg-white/60 dark:bg-white/10'
          : 'hover:bg-black/[0.025] dark:hover:bg-white/5',
        !isLong && 'cursor-default'
      )}
      onClick={() => isLong && setExpanded((v) => !v)}
      title={isLong ? (expanded ? 'Collapse' : 'Expand') : undefined}
    >
      <div
        className={cn(
          'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full',
          bgClass
        )}
      >
        {isLatest && isStreaming ? (
          <Loader2 className={cn('h-2.5 w-2.5 animate-spin', iconClass)} />
        ) : (
          <Icon className={cn('h-2.5 w-2.5', iconClass)} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="text-xs leading-snug">
            <span className="font-semibold text-text-primary">
              {index + 1}. {label}
            </span>
            {thought.tool_name && (
              <span className="ml-1.5 font-normal text-text-muted">· {thought.tool_name}</span>
            )}
          </p>
          {isLong && (
            <ChevronRight
              className={cn(
                'text-text-muted/50 ml-auto h-3 w-3 flex-shrink-0 transition-transform',
                expanded && 'rotate-90'
              )}
            />
          )}
        </div>
        <p
          className={cn(
            'mt-0.5 text-xs leading-relaxed text-text-secondary',
            !expanded && 'line-clamp-2'
          )}
        >
          {thought.content}
        </p>
      </div>
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

interface ThoughtStepsProps {
  thoughts: Thought[];
  /** True while the agent is actively running */
  isStreaming?: boolean;
  /** Collapsed toggle mode — used inside completed assistant messages */
  compact?: boolean;
}

export function ThoughtSteps({
  thoughts,
  isStreaming = false,
  compact = false,
}: ThoughtStepsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isStreaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thoughts.length, isStreaming]);

  if (thoughts.length === 0 && !isStreaming) return null;

  // ── Live streaming card ──────────────────────────────────────────────────
  if (isStreaming) {
    return (
      <div className="overflow-hidden rounded-xl border border-blue-100 bg-blue-50/40 dark:border-blue-900/40 dark:bg-blue-900/20">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-blue-100/60 px-4 py-2 dark:border-blue-900/30">
          <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin text-blue-500" />
          <span className="text-xs font-semibold text-text-primary">Thinking…</span>
          {thoughts.length > 0 && (
            <span className="text-xs text-text-muted">{thoughts.length} steps</span>
          )}
          {/* progress bar */}
          <div className="ml-auto h-1 w-14 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/40">
            <div
              className="h-full rounded-full bg-blue-400 transition-all duration-700"
              style={{ width: `${Math.min(15 + thoughts.length * 9, 88)}%` }}
            />
          </div>
        </div>

        {/* Steps */}
        {thoughts.length > 0 ? (
          <div
            ref={scrollRef}
            className="max-h-[180px] divide-y divide-blue-50/80 overflow-y-auto dark:divide-blue-900/30"
          >
            {thoughts.map((t, i) => (
              <StepRow
                key={t.id}
                thought={t}
                index={i}
                isLatest={i === thoughts.length - 1}
                isStreaming
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-4 py-3 text-xs text-text-muted">
            <Loader2 className="h-3 w-3 animate-spin" />
            Starting analysis…
          </div>
        )}
      </div>
    );
  }

  // ── Compact toggle (inside a completed assistant message) ────────────────
  if (compact) {
    return (
      <div className="mb-2.5">
        <button
          onClick={() => setIsExpanded((v) => !v)}
          className="text-text-muted/80 flex items-center gap-1 text-xs transition-colors hover:text-text-muted"
        >
          <ChevronRight
            className={cn('h-3 w-3 flex-shrink-0 transition-transform', isExpanded && 'rotate-90')}
          />
          Thought for {thoughts.length} {thoughts.length === 1 ? 'step' : 'steps'}
        </button>

        {isExpanded && (
          <div className="mt-1.5 overflow-hidden rounded-lg border border-border bg-gray-50/60 dark:bg-gray-800/60">
            <div className="divide-y divide-border">
              {thoughts.map((t, i) => (
                <StepRow key={t.id} thought={t} index={i} isLatest={false} isStreaming={false} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
