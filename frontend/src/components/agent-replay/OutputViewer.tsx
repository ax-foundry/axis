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
      className="rounded-md p-1.5 text-text-muted transition-all hover:bg-surface hover:text-text-secondary hover:shadow-sm"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/** Check if value is a flat dict with only primitive values (for clean table rendering). */
function isFlatDict(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  return Object.values(obj as Record<string, unknown>).every(
    (v) => v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
  );
}

/** Render a flat dict as a compact key-value table inside a card. */
function FlatDictTable({ data }: { data: Record<string, unknown> }) {
  return (
    <table className="w-full text-xs">
      <tbody>
        {Object.entries(data).map(([key, value]) => (
          <tr key={key} className="border-border/30 border-b last:border-0">
            <td className="whitespace-nowrap py-1 pr-3 font-mono text-[10px] font-medium text-text-muted">
              {key}
            </td>
            <td className="break-all py-1 text-text-primary">
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
  const isArrayOfPrimitives =
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === 'string' || typeof item === 'number');

  const isArrayOfFlatDicts =
    !isArrayOfPrimitives &&
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => isFlatDict(item));

  const stringified = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const theme = SECTION_THEMES[themeIndex % SECTION_THEMES.length];
  const Icon = theme.IconComp;

  const itemCount = Array.isArray(value) ? value.length : null;

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
            {itemCount != null && (
              <span className="ml-1 text-[10px] font-normal text-text-muted">({itemCount})</span>
            )}
          </h4>
        </div>
        <CopyButton text={stringified} />
      </div>
      <div className="overflow-hidden bg-surface px-3 py-2 text-xs">
        <div className="break-words">
          {isArrayOfPrimitives ? (
            <ol className="space-y-1.5">
              {(value as Array<string | number>).map((item, i) => (
                <li key={i} className="flex gap-2 text-text-secondary">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{String(item)}</span>
                </li>
              ))}
            </ol>
          ) : typeof value === 'string' ? (
            <SmartContent text={value} />
          ) : isFlatDict(value) ? (
            <FlatDictTable data={value} />
          ) : isArrayOfFlatDicts ? (
            <div className="space-y-2">
              {(value as Record<string, unknown>[]).map((item, i) => (
                <div
                  key={i}
                  className="border-border/50 rounded-md border bg-gray-50/50 p-2 dark:bg-gray-900/20"
                >
                  <FlatDictTable data={item} />
                </div>
              ))}
            </div>
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

  // String content — try to parse as JSON first for structured rendering
  if (typeof content === 'string') {
    // Strip markdown code fences if present
    const stripped = content
      .trim()
      .replace(/^```(?:json)?\s*\n?/i, '')
      .replace(/\n?\s*```\s*$/, '')
      .trim();
    try {
      const parsed = JSON.parse(stripped);
      if (parsed && typeof parsed === 'object') {
        // Re-render as structured content (array or object)
        return <OutputViewer content={parsed} className={className} />;
      }
    } catch {
      // Not JSON — fall through to SmartContent
    }
    return (
      <div className={cn(className)}>
        <SmartContent text={content} />
      </div>
    );
  }

  // Structured object — split into compact summary (short primitives) + cards (complex values)
  if (isStructuredOutput(content)) {
    const keys = Object.keys(content);
    if (keys.length > 0) {
      // Classify each entry by complexity: short primitives go in summary, rest get cards
      const SHORT_THRESHOLD = 120;
      const compactEntries: Array<[string, unknown]> = [];
      const cardEntries: Array<[string, unknown]> = [];

      for (const key of keys) {
        const value = content[key];
        const isCompact =
          value === null ||
          typeof value === 'boolean' ||
          typeof value === 'number' ||
          (typeof value === 'string' && value.length <= SHORT_THRESHOLD);
        if (isCompact) {
          compactEntries.push([key, value]);
        } else {
          cardEntries.push([key, value]);
        }
      }

      return (
        <div className={cn('space-y-2', className)}>
          {/* Compact summary table for short values */}
          {compactEntries.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-xs">
                <tbody>
                  {compactEntries.map(([key, value]) => (
                    <tr key={key} className="border-border/50 border-b last:border-0">
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] font-medium text-primary">
                        {friendlyLabel(key)}
                      </td>
                      <td className="break-all px-3 py-1.5 text-text-primary">
                        {value === null ? (
                          <span className="italic text-text-muted">null</span>
                        ) : typeof value === 'boolean' ? (
                          <span className={value ? 'text-emerald-600' : 'text-text-muted'}>
                            {String(value)}
                          </span>
                        ) : (
                          String(value)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Full section cards for complex values */}
          {cardEntries.map(([key, value], i) => (
            <SectionCard key={key} label={friendlyLabel(key)} value={value} themeIndex={i} />
          ))}
        </div>
      );
    }
  }

  // Array of primitives — numbered list
  if (
    Array.isArray(content) &&
    content.length > 0 &&
    content.every((item) => typeof item === 'string' || typeof item === 'number')
  ) {
    return (
      <div className={cn(className)}>
        <ol className="space-y-1.5 text-xs">
          {(content as Array<string | number>).map((item, i) => (
            <li key={i} className="flex gap-2 text-text-secondary">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                {i + 1}
              </span>
              <span className="leading-relaxed">{String(item)}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  // Array of flat dicts — stacked tables
  if (Array.isArray(content) && content.length > 0 && content.every((item) => isFlatDict(item))) {
    return (
      <div className={cn('space-y-2', className)}>
        {(content as Record<string, unknown>[]).map((item, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-lg border border-border bg-gray-50/50 p-2.5 dark:bg-gray-900/20"
          >
            <FlatDictTable data={item} />
          </div>
        ))}
      </div>
    );
  }

  // Fallback: JSON
  return (
    <div className={cn(className)}>
      <ContentRenderer content={JSON.stringify(content, null, 2)} forceType="json" />
    </div>
  );
}
