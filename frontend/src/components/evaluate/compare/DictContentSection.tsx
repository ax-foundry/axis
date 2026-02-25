'use client';

import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { useMemo, useState } from 'react';

import { pythonToJson } from '@/components/shared';
import { ContentRenderer } from '@/components/ui/ContentRenderer';
import { cn } from '@/lib/utils';

/**
 * Try to parse a string as a JSON or Python dict.
 * Returns the parsed object if it's a dict/object, or null otherwise.
 */
function tryParseDict(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;

  // Try JSON first
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // Try Python dict conversion
    try {
      const converted = pythonToJson(trimmed);
      const parsed = JSON.parse(converted);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // not parseable
    }
  }
  return null;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function formatKeyLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function DictEntry({ label, value }: { label: string; value: string }) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const isLong = value.length > 200;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-border/50 overflow-hidden rounded-lg border bg-white">
      <div
        className={cn(
          'border-border/30 flex items-center gap-2 border-b bg-gray-50 px-4 py-2',
          isLong && 'cursor-pointer hover:bg-gray-100'
        )}
        onClick={() => isLong && setExpanded(!expanded)}
      >
        {isLong &&
          (expanded ? (
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
          ))}
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          {label}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopy();
          }}
          className="ml-auto flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-primary"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {(expanded || !isLong) && (
        <div className="max-h-64 overflow-y-auto px-4 py-3">
          <ContentRenderer content={value} className="text-sm leading-relaxed" />
        </div>
      )}
    </div>
  );
}

interface DictContentSectionProps {
  title: string;
  content: string | Record<string, unknown>;
  /** Compact mode for use inside SideBySideTable expanded rows */
  compact?: boolean;
}

export function DictContentSection({ title, content, compact }: DictContentSectionProps) {
  const isObjectContent = content != null && typeof content === 'object';
  const safeContent = useMemo(() => {
    if (typeof content === 'string') return content;
    if (isObjectContent) return JSON.stringify(content, null, 2);
    return content != null ? String(content) : '';
  }, [content, isObjectContent]);
  const parsed = useMemo(
    () =>
      isObjectContent
        ? (content as Record<string, unknown>)
        : safeContent
          ? tryParseDict(safeContent)
          : null,
    [content, isObjectContent, safeContent]
  );

  if (!safeContent) return null;

  // If it's not a dict, fall back to content-aware rendering
  if (!parsed) {
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
        <div
          className={cn(
            'border-border/50 overflow-y-auto rounded-lg border bg-white p-4 text-sm',
            compact ? 'max-h-48' : 'max-h-64'
          )}
        >
          <ContentRenderer content={safeContent} className="text-sm leading-relaxed" />
        </div>
      </div>
    );
  }

  const entries = Object.entries(parsed);

  return (
    <div>
      <h4 className="mb-3 text-sm font-semibold text-text-primary">
        {title}
        <span className="ml-2 text-xs font-normal text-text-muted">
          {entries.length} {entries.length === 1 ? 'field' : 'fields'}
        </span>
      </h4>
      <div className={cn('space-y-3', compact && 'max-h-[400px] overflow-y-auto pr-1')}>
        {entries.map(([key, value]) => (
          <DictEntry key={key} label={formatKeyLabel(key)} value={formatValue(value)} />
        ))}
      </div>
    </div>
  );
}
