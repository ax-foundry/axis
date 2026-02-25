'use client';

import { ChevronDown, ChevronUp, Brain, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { useCopilotStore } from '@/stores/copilot-store';

import { ThoughtItem } from './thought-item';

interface ThoughtPanelProps {
  className?: string;
}

export function ThoughtPanel({ className }: ThoughtPanelProps) {
  const { isStreaming, thoughts, currentThought } = useCopilotStore();
  const [isExpanded, setIsExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest thought
  useEffect(() => {
    if (scrollRef.current && isStreaming) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thoughts, isStreaming]);

  // Auto-expand when streaming starts
  useEffect(() => {
    if (isStreaming) {
      setIsExpanded(true);
    }
  }, [isStreaming]);

  // Don't render if no thoughts and not streaming
  if (!isStreaming && thoughts.length === 0) {
    return null;
  }

  return (
    <div
      className={cn('border-b border-border bg-gray-50/50 transition-all duration-300', className)}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-2 text-left transition-colors hover:bg-gray-100"
      >
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <Loader2 className="h-4 w-4 animate-spin text-accent-gold" />
          ) : (
            <Brain className="h-4 w-4 text-text-muted" />
          )}
          <span className="text-sm font-medium text-text-primary">
            {isStreaming ? 'Thinking...' : `${thoughts.length} thoughts`}
          </span>
          {currentThought && isStreaming && (
            <span className="text-xs text-text-muted">{currentThought.type}</span>
          )}
        </div>

        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-text-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-text-muted" />
        )}
      </button>

      {/* Thoughts list */}
      {isExpanded && (
        <div ref={scrollRef} className="max-h-64 overflow-y-auto px-2 pb-2">
          <div className="space-y-1">
            {thoughts.map((thought, index) => (
              <ThoughtItem
                key={thought.id}
                thought={thought}
                isLatest={index === thoughts.length - 1 && isStreaming}
              />
            ))}
          </div>

          {isStreaming && thoughts.length === 0 && (
            <div className="flex items-center justify-center py-4 text-sm text-text-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Starting analysis...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
