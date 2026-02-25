'use client';

import { Check, Copy, FileText, Hash, List, Quote } from 'lucide-react';
import { useCallback, useState } from 'react';

import { ContentRenderer } from '@/components/ui/ContentRenderer';
import { cn } from '@/lib/utils';

import { SmartContent } from './smart-content';

interface OutputViewerProps {
  content: unknown;
  className?: string;
}

/** Map of camelCase keys to friendly display labels. */
const KNOWN_KEY_LABELS: Record<string, string> = {
  briefRecommendation: 'Brief Recommendation',
  brief_recommendation: 'Brief Recommendation',
  detailedRecommendation: 'Detailed Recommendation',
  detailed_recommendation: 'Detailed Recommendation',
  citations: 'Citations',
  recommendation: 'Recommendation',
  analysis: 'Analysis',
  summary: 'Summary',
  reasoning: 'Reasoning',
  explanation: 'Explanation',
  conclusion: 'Conclusion',
  decision: 'Decision',
  output: 'Output',
  result: 'Result',
  findings: 'Findings',
  notes: 'Notes',
  classification: 'Classification',
  score: 'Score',
  confidence: 'Confidence',
};

/** Color themes for section cards — cycles through for visual variety. */
const SECTION_THEMES = [
  { border: 'border-l-primary', bg: 'bg-primary/5', icon: 'text-primary', IconComp: FileText },
  {
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-50/50',
    icon: 'text-emerald-600',
    IconComp: Quote,
  },
  { border: 'border-l-blue-500', bg: 'bg-blue-50/50', icon: 'text-blue-600', IconComp: List },
  { border: 'border-l-amber-500', bg: 'bg-amber-50/50', icon: 'text-amber-600', IconComp: Hash },
  {
    border: 'border-l-indigo-500',
    bg: 'bg-indigo-50/50',
    icon: 'text-indigo-600',
    IconComp: FileText,
  },
] as const;

function friendlyLabel(key: string): string {
  if (KNOWN_KEY_LABELS[key]) return KNOWN_KEY_LABELS[key];
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function isStructuredOutput(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="rounded-md p-1.5 text-text-muted transition-all hover:bg-white hover:text-text-secondary hover:shadow-sm"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function CitationsList({ items }: { items: unknown[] }) {
  return (
    <ol className="space-y-1.5 text-xs">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-text-secondary">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
            {i + 1}
          </span>
          <span className="leading-relaxed">
            {typeof item === 'string' ? item : JSON.stringify(item, null, 2)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function SectionCard({
  label,
  value,
  themeIndex,
}: {
  label: string;
  value: unknown;
  themeIndex: number;
}) {
  const isCitations =
    Array.isArray(value) &&
    (label.toLowerCase().includes('citation') || label.toLowerCase().includes('reference'));

  const stringified = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const theme = SECTION_THEMES[themeIndex % SECTION_THEMES.length];
  const Icon = theme.IconComp;

  return (
    <div
      className={cn('overflow-hidden rounded-lg border border-l-[3px] border-border', theme.border)}
    >
      <div
        className={cn(
          'flex items-center justify-between border-b border-border px-3 py-1.5',
          theme.bg
        )}
      >
        <div className="flex items-center gap-1.5">
          <Icon className={cn('h-3 w-3', theme.icon)} />
          <h4 className="text-xs font-bold text-text-primary">
            {label}
            {isCitations && (
              <span className="ml-1 text-[10px] font-normal text-text-muted">
                ({(value as unknown[]).length})
              </span>
            )}
          </h4>
        </div>
        <CopyButton text={stringified} />
      </div>
      <div className="overflow-hidden bg-white px-3 py-2 text-xs">
        <div className="break-words">
          {isCitations ? (
            <CitationsList items={value as unknown[]} />
          ) : typeof value === 'string' ? (
            <SmartContent text={value} />
          ) : (
            <ContentRenderer content={JSON.stringify(value, null, 2)} forceType="json" />
          )}
        </div>
      </div>
    </div>
  );
}

export function OutputViewer({ content, className }: OutputViewerProps) {
  if (content == null) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-text-muted">
        <FileText className="h-8 w-8 text-border" />
        <span className="text-sm italic">No output recorded</span>
      </div>
    );
  }

  // String content — SmartContent auto-detects embedded JSON blocks in text
  if (typeof content === 'string') {
    return (
      <div className={cn(className)}>
        <SmartContent text={content} />
      </div>
    );
  }

  // Structured object with known keys — render as section cards
  if (isStructuredOutput(content)) {
    const keys = Object.keys(content);
    if (keys.length > 0) {
      return (
        <div className={cn('space-y-2', className)}>
          {keys.map((key, i) => (
            <SectionCard key={key} label={friendlyLabel(key)} value={content[key]} themeIndex={i} />
          ))}
        </div>
      );
    }
  }

  // Fallback: JSON
  return (
    <div className={cn(className)}>
      <ContentRenderer content={JSON.stringify(content, null, 2)} forceType="json" />
    </div>
  );
}
