'use client';

import { useMemo } from 'react';

import { ContentRenderer } from '@/components/ui/ContentRenderer';

/** A content segment — text, valid JSON, or a truncated/raw code block. */
type ContentSegment =
  | { type: 'text'; value: string }
  | { type: 'json'; value: string }
  | { type: 'code'; value: string };

/** Heuristic: does this look like JSON content (has quoted keys, colons, etc.)? */
function looksLikeJson(str: string): boolean {
  const quoteColonMatches = str.match(/"[^"]+"\s*:/g);
  return (quoteColonMatches?.length ?? 0) >= 2;
}

/** Best-effort pretty-print for truncated JSON that won't parse. */
function prettyPrintTruncated(raw: string): string {
  // Try to parse as-is first (maybe it's valid after all)
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    // fall through
  }

  // Simple indentation: add newlines after { [ , and before } ]
  let result = '';
  let indent = 0;
  let inStr = false;
  let esc = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (esc) {
      result += ch;
      esc = false;
      continue;
    }
    if (ch === '\\' && inStr) {
      result += ch;
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      result += ch;
      continue;
    }
    if (inStr) {
      result += ch;
      continue;
    }

    if (ch === '{' || ch === '[') {
      indent++;
      result += ch + '\n' + '  '.repeat(indent);
    } else if (ch === '}' || ch === ']') {
      indent = Math.max(0, indent - 1);
      result += '\n' + '  '.repeat(indent) + ch;
    } else if (ch === ',') {
      result += ch + '\n' + '  '.repeat(indent);
    } else if (ch === ':') {
      result += ': ';
    } else if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') {
      // skip original whitespace — we're re-indenting
    } else {
      result += ch;
    }
  }

  return result;
}

/**
 * Split a string into text segments and embedded JSON/code blocks.
 * Finds top-level `{...}` or `[...]` that parse as valid JSON (>80 chars).
 * Also handles truncated JSON: when a large JSON-like block has no matching
 * closer (e.g. content was truncated by Langfuse), it renders as a code block.
 */
export function splitTextAndJson(text: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Find the first `{` or `[` that could start a JSON block
    const braceIdx = remaining.search(/[{[]/);
    if (braceIdx === -1) {
      segments.push({ type: 'text', value: remaining });
      break;
    }

    const opener = remaining[braceIdx];
    const closer = opener === '{' ? '}' : ']';

    // Walk forward to find the matching closer at depth 0
    let depth = 0;
    let inString = false;
    let escape = false;
    let endIdx = -1;

    for (let i = braceIdx; i < remaining.length; i++) {
      const ch = remaining[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === opener) depth++;
      else if (ch === closer) {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }

    if (endIdx === -1) {
      // No matching closer — could be truncated JSON
      const tail = remaining.slice(braceIdx);
      if (tail.length > 200 && looksLikeJson(tail)) {
        // Treat as truncated code block
        if (braceIdx > 0) {
          const before = remaining.slice(0, braceIdx).trim();
          if (before) segments.push({ type: 'text', value: before });
        }
        segments.push({ type: 'code', value: prettyPrintTruncated(tail) });
      } else {
        segments.push({ type: 'text', value: remaining });
      }
      break;
    }

    const candidate = remaining.slice(braceIdx, endIdx + 1);

    // Only treat as JSON if it's valid and non-trivial (>80 chars)
    let parsed = false;
    if (candidate.length > 80) {
      try {
        JSON.parse(candidate);
        parsed = true;
      } catch {
        // not valid JSON
      }
    }

    if (parsed) {
      // Push any text before the JSON
      if (braceIdx > 0) {
        const before = remaining.slice(0, braceIdx).trim();
        if (before) segments.push({ type: 'text', value: before });
      }
      segments.push({ type: 'json', value: candidate });
      remaining = remaining.slice(endIdx + 1);
    } else {
      // Not valid JSON — include up through this opener as text and continue scanning
      const chunkEnd = braceIdx + 1;
      const prefix = remaining.slice(0, chunkEnd);
      if (segments.length > 0 && segments[segments.length - 1].type === 'text') {
        segments[segments.length - 1].value += prefix;
      } else {
        segments.push({ type: 'text', value: prefix });
      }
      remaining = remaining.slice(chunkEnd);
    }
  }

  return segments;
}

/** Renders content that may contain embedded JSON blocks mixed with text. */
export function SmartContent({ text, forceType }: { text: string; forceType?: 'json' }) {
  const segments = useMemo(() => {
    if (forceType === 'json') return [{ type: 'json' as const, value: text }];
    return splitTextAndJson(text);
  }, [text, forceType]);

  // Single segment
  if (segments.length === 1) {
    const seg = segments[0];
    if (seg.type === 'code') {
      return (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-gray-100 p-2 font-mono text-[11px] leading-relaxed">
          <code>{seg.value}</code>
        </pre>
      );
    }
    return (
      <ContentRenderer content={seg.value} forceType={seg.type === 'json' ? 'json' : forceType} />
    );
  }

  return (
    <div className="space-y-2">
      {segments.map((seg, i) =>
        seg.type === 'json' ? (
          <ContentRenderer key={i} content={seg.value} forceType="json" />
        ) : seg.type === 'code' ? (
          <pre
            key={i}
            className="overflow-x-auto whitespace-pre-wrap rounded bg-gray-100 p-2 font-mono text-[11px] leading-relaxed"
          >
            <code>{seg.value}</code>
          </pre>
        ) : (
          <ContentRenderer key={i} content={seg.value} />
        )
      )}
    </div>
  );
}
