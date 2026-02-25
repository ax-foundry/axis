'use client';

import {
  Brain,
  Wrench,
  Eye,
  ListTodo,
  Lightbulb,
  GitBranch,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import React, { useMemo } from 'react';

import { cn } from '@/lib/utils';

import type { Thought, ThoughtType } from '@/types';

interface ThoughtItemProps {
  thought: Thought;
  isLatest?: boolean;
  className?: string;
}

const ICON_MAP: Record<
  ThoughtType,
  React.ComponentType<{ className?: string; style?: React.CSSProperties }>
> = {
  reasoning: Brain,
  tool_use: Wrench,
  observation: Eye,
  planning: ListTodo,
  reflection: Lightbulb,
  decision: GitBranch,
  error: AlertCircle,
  success: CheckCircle,
};

const LABEL_MAP: Record<ThoughtType, string> = {
  reasoning: 'Thinking',
  tool_use: 'Using Tool',
  observation: 'Observing',
  planning: 'Planning',
  reflection: 'Reflecting',
  decision: 'Deciding',
  error: 'Error',
  success: 'Complete',
};

export function ThoughtItem({ thought, isLatest = false, className }: ThoughtItemProps) {
  const Icon = ICON_MAP[thought.type] || Brain;
  const label = LABEL_MAP[thought.type] || 'Thinking';

  const formattedTime = useMemo(() => {
    const date = new Date(thought.timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [thought.timestamp]);

  return (
    <div
      className={cn(
        'flex gap-2 rounded-lg p-2 transition-all duration-200',
        isLatest && 'bg-gray-50',
        thought.type === 'error' && 'bg-error/5',
        thought.type === 'success' && 'bg-success/5',
        className
      )}
    >
      <div
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: `${thought.color}20` }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color: thought.color }} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: thought.color }}>
            {label}
          </span>

          {thought.skill_name && (
            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">
              {thought.skill_name}
            </span>
          )}

          {thought.node_name && (
            <span className="text-xs text-text-muted">{thought.node_name}</span>
          )}
        </div>

        <p className="mt-0.5 whitespace-pre-wrap text-sm text-text-secondary">{thought.content}</p>

        <span className="mt-1 text-xs text-text-muted">{formattedTime}</span>
      </div>
    </div>
  );
}
