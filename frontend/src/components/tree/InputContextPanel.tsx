'use client';

import {
  ChevronDown,
  ChevronRight,
  Bot,
  User,
  CheckCircle,
  Database,
  Settings,
  FileText,
  Target,
  ListChecks,
  FileOutput,
  Tag,
  Hash,
  ToggleLeft,
  Braces,
  Type,
  List,
} from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

import { ContentRenderer } from '@/components/ui/ContentRenderer';
import { cn } from '@/lib/utils';
import { Columns } from '@/types';

interface InputContextPanelProps {
  testCaseData: Record<string, unknown> | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ============================================================================
// Message Bubble Component - iPhone-style chat bubbles
// ============================================================================

// Convert plain URLs in text to markdown links
function linkifyContent(content: string): string {
  // Match URLs that aren't already in markdown link format
  const urlRegex = /(?<!\]\()(?<!\[)(https?:\/\/[^\s\)]+)/g;
  return content.replace(urlRegex, (url) => {
    // Clean up trailing punctuation that might be part of text
    const cleanUrl = url.replace(/[,.\s]+$/, '');
    return `[${cleanUrl}](${cleanUrl})`;
  });
}

function MessageBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user';

  // Process content to make URLs clickable
  const processedContent = linkifyContent(content);

  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent-gold/20">
          <Bot className="h-4 w-4 text-accent-gold" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[85%] px-4 py-3',
          isUser
            ? 'rounded-2xl rounded-br-md bg-primary text-white'
            : 'rounded-2xl rounded-bl-md bg-gray-100 text-text-primary'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{content}</p>
        ) : (
          <div className="prose prose-sm max-w-none text-sm leading-relaxed">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-primary underline hover:text-primary-dark"
                  >
                    {children}
                  </a>
                ),
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                ul: ({ children }) => (
                  <ul className="my-2 list-inside list-disc space-y-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="my-2 list-inside list-decimal space-y-1">{children}</ol>
                ),
                li: ({ children }) => <li className="text-sm">{children}</li>,
                code: ({ children }) => (
                  <code className="rounded bg-gray-200 px-1 py-0.5 font-mono text-xs">
                    {children}
                  </code>
                ),
              }}
            >
              {processedContent}
            </ReactMarkdown>
          </div>
        )}
      </div>
      {isUser && (
        <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/20">
          <User className="h-4 w-4 text-primary" />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Conversation Parsing Utilities
// ============================================================================

/**
 * Convert Python dict/list string syntax to valid JSON.
 * Handles single quotes, None, True, False, escaped quotes, and apostrophes within strings.
 */
function pythonToJson(pythonStr: string): string {
  let result = '';
  let i = 0;
  let inString = false;
  let stringChar = '';

  while (i < pythonStr.length) {
    const char = pythonStr[i];
    const nextChar = i < pythonStr.length - 1 ? pythonStr[i + 1] : '';

    // Check for string start/end
    if ((char === "'" || char === '"') && !inString) {
      inString = true;
      stringChar = char;
      result += '"'; // Always use double quotes in JSON
      i++;
      continue;
    }

    // Inside a string
    if (inString) {
      // Handle escape sequences
      if (char === '\\') {
        if (nextChar === stringChar) {
          // Escaped quote (e.g., \' inside '...' or \" inside "...")
          // In JSON, single quotes don't need escaping, double quotes do
          if (stringChar === "'") {
            // Python \' -> JSON ' (no escaping needed)
            result += "'";
          } else {
            // Python \" -> JSON \"
            result += '\\"';
          }
          i += 2; // Skip both backslash and quote
          continue;
        } else if (nextChar === '\\') {
          // Escaped backslash
          result += '\\\\';
          i += 2;
          continue;
        } else if (nextChar === 'n') {
          result += '\\n';
          i += 2;
          continue;
        } else if (nextChar === 'r') {
          result += '\\r';
          i += 2;
          continue;
        } else if (nextChar === 't') {
          result += '\\t';
          i += 2;
          continue;
        } else {
          // Unknown escape, keep the backslash
          result += '\\';
          i++;
          continue;
        }
      }

      // Check for end of string
      if (char === stringChar) {
        inString = false;
        stringChar = '';
        result += '"';
        i++;
        continue;
      }

      // Handle characters that need escaping in JSON
      if (char === '"') {
        result += '\\"';
      } else if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        result += '\\r';
      } else if (char === '\t') {
        result += '\\t';
      } else {
        result += char;
      }
      i++;
      continue;
    }

    // Outside strings, handle Python keywords
    if (pythonStr.slice(i, i + 4) === 'None') {
      result += 'null';
      i += 4;
      continue;
    }
    if (pythonStr.slice(i, i + 4) === 'True') {
      result += 'true';
      i += 4;
      continue;
    }
    if (pythonStr.slice(i, i + 5) === 'False') {
      result += 'false';
      i += 5;
      continue;
    }
    // Handle nan/NaN (Python float nan)
    if (
      pythonStr.slice(i, i + 3).toLowerCase() === 'nan' &&
      (i === 0 || /[\s,:\[\{(]/.test(pythonStr[i - 1])) &&
      (i + 3 >= pythonStr.length || /[\s,:\]\})]/.test(pythonStr[i + 3]))
    ) {
      result += 'null';
      i += 3;
      continue;
    }

    result += char;
    i++;
  }

  return result;
}

function extractMessagesArray(data: unknown): unknown[] | null {
  if (Array.isArray(data)) {
    return data;
  }
  // Handle object with 'messages' key
  if (typeof data === 'object' && data !== null && 'messages' in data) {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.messages)) {
      return obj.messages;
    }
  }
  return null;
}

function parseConversation(data: string | unknown): Message[] {
  if (!data) return [];

  // Check if it's already an array or object with messages
  const messagesArray = extractMessagesArray(data);
  if (messagesArray) {
    return messagesArray
      .filter(
        (msg): msg is { role?: string; content?: string } => typeof msg === 'object' && msg !== null
      )
      .map((msg) => ({
        role: (msg.role === 'user' || msg.role === 'human' ? 'user' : 'assistant') as
          | 'user'
          | 'assistant',
        content: String(msg.content || ''),
      }))
      .filter((msg) => msg.content.trim() !== '');
  }

  // If it's a string, try parsing it
  if (typeof data === 'string') {
    const trimmed = data.trim();

    // Try JSON parsing first
    try {
      const parsed = JSON.parse(trimmed);
      const parsedMessages = extractMessagesArray(parsed);
      if (parsedMessages) {
        return parseConversation(parsedMessages);
      }
    } catch {
      // Not valid JSON, continue with other formats
    }

    // Try Python dict syntax with proper parsing
    try {
      const jsonStr = pythonToJson(trimmed);
      const parsed = JSON.parse(jsonStr);
      const parsedMessages = extractMessagesArray(parsed);
      if (parsedMessages) {
        return parseConversation(parsedMessages);
      }
    } catch {
      // Not valid Python dict syntax
    }

    // Fall back to plain text as single message
    if (trimmed) {
      return [{ role: 'user', content: trimmed }];
    }
  }

  return [];
}

function createConversationFromQueryOutput(query?: string, output?: string): Message[] {
  const messages: Message[] = [];
  if (query && query.trim()) {
    messages.push({ role: 'user', content: query.trim() });
  }
  if (output && output.trim()) {
    messages.push({ role: 'assistant', content: output.trim() });
  }
  return messages;
}

// ============================================================================
// Conversation Display Component
// ============================================================================

function ConversationDisplay({ messages }: { messages: Message[] }) {
  if (messages.length === 0) return null;

  return (
    <div className="space-y-4 p-4">
      {messages.map((message, index) => (
        <MessageBubble key={index} role={message.role} content={message.content} />
      ))}
    </div>
  );
}

// ============================================================================
// Collapsible Section Component
// ============================================================================

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
}

function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = false,
  badge,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-border/50 border-t">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-gray-50"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-text-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-muted" />
        )}
        <span className="text-text-muted">{icon}</span>
        <span className="text-sm font-medium text-text-primary">{title}</span>
        {badge && (
          <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs text-text-muted">
            {badge}
          </span>
        )}
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ============================================================================
// Expected Output Section (Ground Truth) - Professional Design
// ============================================================================

function ExpectedOutputSection({ content }: { content: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentLength = content.length;
  const shouldTruncate = contentLength > 500 && !isExpanded;
  const displayContent = shouldTruncate ? content.substring(0, 500) + '...' : content;
  const processedContent = linkifyContent(displayContent);

  return (
    <CollapsibleSection
      title="Expected Output"
      icon={<Target className="h-4 w-4" />}
      badge="Ground Truth"
      defaultOpen={false}
    >
      <div className="overflow-hidden rounded-lg border border-amber-200 bg-white">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-transparent px-3 py-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-amber-100">
            <CheckCircle className="h-3 w-3 text-amber-600" />
          </div>
          <span className="text-sm font-medium text-amber-800">Reference Answer</span>
        </div>
        {/* Content */}
        <div className="p-3">
          <div className="prose prose-sm max-w-none text-sm leading-relaxed text-text-secondary">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-primary underline hover:text-primary-dark"
                  >
                    {children}
                  </a>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-text-primary">{children}</strong>
                ),
                ul: ({ children }) => (
                  <ul className="my-1 list-inside list-disc space-y-0.5">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="my-1 list-inside list-decimal space-y-0.5">{children}</ol>
                ),
                li: ({ children }) => <li className="text-sm">{children}</li>,
                code: ({ children }) => (
                  <code className="rounded bg-amber-50 px-1 py-0.5 font-mono text-xs text-amber-800">
                    {children}
                  </code>
                ),
              }}
            >
              {processedContent}
            </ReactMarkdown>
          </div>
          {contentLength > 500 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700"
            >
              {isExpanded ? (
                <>
                  <ChevronRight className="h-3 w-3 rotate-90" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronRight className="h-3 w-3 -rotate-90" />
                  Show more ({Math.round(contentLength / 100) * 100}+ chars)
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}

// ============================================================================
// Retrieved Content Section (RAG Chunks)
// ============================================================================

interface RetrievedChunk {
  content: string;
  source?: string;
  title?: string;
  url?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

function parseRetrievedChunks(raw: unknown): RetrievedChunk[] {
  if (!raw) return [];

  // If it's already an array, process each item
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      if (typeof item === 'string') {
        return { content: item };
      }
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        return {
          content: String(
            obj.content || obj.text || obj.chunk || obj.passage || JSON.stringify(obj, null, 2)
          ),
          source: obj.source as string | undefined,
          title: obj.title as string | undefined,
          url: (obj.url || obj.link || obj.href) as string | undefined,
          score:
            typeof obj.score === 'number'
              ? obj.score
              : typeof obj.relevance === 'number'
                ? obj.relevance
                : typeof obj.similarity === 'number'
                  ? obj.similarity
                  : undefined,
          metadata: obj.metadata as Record<string, unknown> | undefined,
        };
      }
      return { content: String(item) };
    });
  }

  // If it's a string, try to parse it
  if (typeof raw === 'string') {
    const trimmed = raw.trim();

    // Try JSON parsing
    try {
      const parsed = JSON.parse(trimmed);
      return parseRetrievedChunks(parsed);
    } catch {
      // Not JSON
    }

    // Try Python syntax
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const jsonStr = pythonToJson(trimmed);
        const parsed = JSON.parse(jsonStr);
        return parseRetrievedChunks(parsed);
      } catch {
        // Not valid
      }
    }

    // Split by common separators
    if (trimmed.includes('\n---\n') || trimmed.includes('\n\n---\n\n')) {
      const chunks = trimmed.split(/\n-{3,}\n/).filter((c) => c.trim());
      return chunks.map((c) => ({ content: c.trim() }));
    }

    // Return as single chunk
    return [{ content: trimmed }];
  }

  // If it's an object, wrap as single chunk
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    return [
      {
        content: String(obj.content || obj.text || JSON.stringify(obj, null, 2)),
        source: obj.source as string | undefined,
        title: obj.title as string | undefined,
        url: (obj.url || obj.link) as string | undefined,
        score: typeof obj.score === 'number' ? obj.score : undefined,
      },
    ];
  }

  return [{ content: String(raw) }];
}

function ChunkCard({ chunk, index }: { chunk: RetrievedChunk; index: number; total?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentLength = chunk.content.length;
  const shouldTruncate = contentLength > 500 && !isExpanded;
  const displayContent = shouldTruncate ? chunk.content.substring(0, 500) + '...' : chunk.content;

  // Process content for markdown and links
  const processedContent = linkifyContent(displayContent);

  // Extract domain from URL for display
  const displaySource = (() => {
    if (chunk.title) return chunk.title;
    if (chunk.url) {
      try {
        const url = new URL(chunk.url);
        return url.hostname.replace('www.', '');
      } catch {
        return chunk.url;
      }
    }
    if (chunk.source) return chunk.source;
    return `Source ${index + 1}`;
  })();

  return (
    <div className="border-border/60 overflow-hidden rounded-lg border bg-white transition-colors hover:border-primary/30">
      {/* Chunk Header */}
      <div className="border-border/40 flex items-center justify-between border-b bg-gradient-to-r from-gray-50 to-transparent px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-medium text-primary">
            {index + 1}
          </div>
          <span className="truncate text-sm font-medium text-text-primary">{displaySource}</span>
          {chunk.url && (
            <a
              href={chunk.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 text-primary hover:text-primary-dark"
              title="Open source"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          )}
        </div>
        {chunk.score !== undefined && (
          <div
            className={cn(
              'flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
              chunk.score >= 0.8
                ? 'bg-success/10 text-success'
                : chunk.score >= 0.5
                  ? 'bg-warning/10 text-warning'
                  : 'bg-gray-100 text-text-muted'
            )}
          >
            {(chunk.score * 100).toFixed(0)}% match
          </div>
        )}
      </div>

      {/* Chunk Content */}
      <div className="p-3">
        <div className="prose prose-sm max-w-none text-sm leading-relaxed text-text-secondary">
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-primary underline hover:text-primary-dark"
                >
                  {children}
                </a>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-text-primary">{children}</strong>
              ),
              ul: ({ children }) => (
                <ul className="my-1 list-inside list-disc space-y-0.5">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="my-1 list-inside list-decimal space-y-0.5">{children}</ol>
              ),
              li: ({ children }) => <li className="text-sm">{children}</li>,
              code: ({ children }) => (
                <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">
                  {children}
                </code>
              ),
              h1: ({ children }) => (
                <h1 className="mb-1 mt-2 text-base font-semibold text-text-primary">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="mb-1 mt-2 text-sm font-semibold text-text-primary">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="mb-0.5 mt-1 text-sm font-medium text-text-primary">{children}</h3>
              ),
            }}
          >
            {processedContent}
          </ReactMarkdown>
        </div>

        {/* Show more/less button */}
        {contentLength > 500 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-dark"
          >
            {isExpanded ? (
              <>
                <ChevronRight className="h-3 w-3 rotate-90" />
                Show less
              </>
            ) : (
              <>
                <ChevronRight className="h-3 w-3 -rotate-90" />
                Show more ({Math.round(contentLength / 100) * 100}+ chars)
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function RetrievedContentSection({ content }: { content: string | unknown }) {
  const chunks = parseRetrievedChunks(content);

  if (chunks.length === 0) return null;

  return (
    <CollapsibleSection
      title="Retrieved Content"
      icon={<Database className="h-4 w-4" />}
      badge={`${chunks.length} chunk${chunks.length !== 1 ? 's' : ''}`}
      defaultOpen={false}
    >
      <div className="max-h-[500px] space-y-3 overflow-y-auto pr-1">
        {/* Summary bar */}
        <div className="border-border/30 flex items-center gap-4 border-b pb-2 text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" />
            {chunks.length} retrieved passage{chunks.length !== 1 ? 's' : ''}
          </span>
          {chunks.some((c) => c.score !== undefined) && (
            <span className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              Relevance scores available
            </span>
          )}
        </div>

        {/* Chunk cards */}
        {chunks.map((chunk, index) => (
          <ChunkCard key={index} chunk={chunk} index={index} total={chunks.length} />
        ))}
      </div>
    </CollapsibleSection>
  );
}

// ============================================================================
// Shared Utilities for Context Sections
// ============================================================================

function parseStructuredData(data: unknown): Record<string, unknown> {
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }

  if (typeof data === 'string') {
    const trimmed = data.trim();

    // Try JSON parsing
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Not valid JSON
    }

    // Try Python dict syntax with proper parsing
    try {
      const jsonStr = pythonToJson(trimmed);
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Not valid Python dict syntax
    }

    // Return as single entry if it's just a string
    if (trimmed) {
      return { value: trimmed };
    }
  }

  return {};
}

function getValueIcon(value: unknown) {
  if (value === null || value === undefined) return <Type className="h-3 w-3 text-gray-400" />;
  if (typeof value === 'boolean') return <ToggleLeft className="h-3 w-3 text-purple-500" />;
  if (typeof value === 'number') return <Hash className="h-3 w-3 text-blue-500" />;
  if (Array.isArray(value)) return <List className="h-3 w-3 text-orange-500" />;
  if (typeof value === 'object') return <Braces className="h-3 w-3 text-green-500" />;
  return <Type className="h-3 w-3 text-gray-500" />;
}

function formatValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-xs italic text-text-muted">null</span>;
  }

  if (typeof value === 'boolean') {
    return (
      <span
        className={cn(
          'rounded-full px-2 py-0.5 text-xs font-medium',
          value ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        )}
      >
        {value ? 'true' : 'false'}
      </span>
    );
  }

  if (typeof value === 'number') {
    return (
      <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-sm text-blue-600">
        {value}
      </span>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-xs italic text-text-muted">empty array</span>;
    }
    // For simple arrays of strings/numbers, show inline
    if (value.length <= 5 && value.every((v) => typeof v === 'string' || typeof v === 'number')) {
      return (
        <div className="flex flex-wrap gap-1">
          {value.map((item, i) => (
            <span
              key={i}
              className="rounded bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700"
            >
              {String(item)}
            </span>
          ))}
        </div>
      );
    }
    return (
      <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 font-mono text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  if (typeof value === 'object') {
    return (
      <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 font-mono text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  const str = String(value);

  // Use ContentRenderer for smart markdown/JSON/plain text detection
  return <ContentRenderer content={str} className="text-sm leading-relaxed" />;
}

// ============================================================================
// Professional Key-Value Card Component
// ============================================================================

interface KeyValueCardProps {
  title: string;
  icon: React.ReactNode;
  data: unknown;
  accentColor: string;
  defaultOpen?: boolean;
}

function KeyValueCard({ title, icon, data, accentColor, defaultOpen = false }: KeyValueCardProps) {
  const parsed = parseStructuredData(data);
  const entries = Object.entries(parsed);

  if (entries.length === 0) return null;

  const colorClasses: Record<
    string,
    { bg: string; border: string; headerBg: string; iconBg: string; text: string }
  > = {
    blue: {
      bg: 'bg-white',
      border: 'border-blue-200',
      headerBg: 'from-blue-50',
      iconBg: 'bg-blue-100',
      text: 'text-blue-800',
    },
    purple: {
      bg: 'bg-white',
      border: 'border-purple-200',
      headerBg: 'from-purple-50',
      iconBg: 'bg-purple-100',
      text: 'text-purple-800',
    },
    green: {
      bg: 'bg-white',
      border: 'border-green-200',
      headerBg: 'from-green-50',
      iconBg: 'bg-green-100',
      text: 'text-green-800',
    },
    orange: {
      bg: 'bg-white',
      border: 'border-orange-200',
      headerBg: 'from-orange-50',
      iconBg: 'bg-orange-100',
      text: 'text-orange-800',
    },
    gray: {
      bg: 'bg-white',
      border: 'border-gray-200',
      headerBg: 'from-gray-50',
      iconBg: 'bg-gray-100',
      text: 'text-gray-800',
    },
    cyan: {
      bg: 'bg-white',
      border: 'border-cyan-200',
      headerBg: 'from-cyan-50',
      iconBg: 'bg-cyan-100',
      text: 'text-cyan-800',
    },
  };

  const colors = colorClasses[accentColor] || colorClasses.gray;

  return (
    <CollapsibleSection
      title={title}
      icon={icon}
      badge={`${entries.length} field${entries.length !== 1 ? 's' : ''}`}
      defaultOpen={defaultOpen}
    >
      <div className={cn('overflow-hidden rounded-lg border', colors.border)}>
        {/* Summary bar */}
        <div
          className={cn(
            'flex items-center gap-2 border-b bg-gradient-to-r to-transparent px-3 py-2',
            colors.headerBg,
            colors.border
          )}
        >
          <div className={cn('flex h-5 w-5 items-center justify-center rounded', colors.iconBg)}>
            <FileText className={cn('h-3 w-3', colors.text)} />
          </div>
          <span className={cn('text-xs font-medium', colors.text)}>
            {entries.length} {entries.length === 1 ? 'property' : 'properties'}
          </span>
        </div>

        {/* Key-Value rows */}
        <div className="divide-y divide-gray-100">
          {entries.map(([key, value]) => (
            <div
              key={key}
              className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-gray-50/50"
            >
              <div className="flex min-w-[140px] flex-shrink-0 items-center gap-2">
                {getValueIcon(value)}
                <span className="truncate text-sm font-medium text-text-primary" title={key}>
                  {key}
                </span>
              </div>
              <div className="min-w-0 flex-1">{formatValue(value)}</div>
            </div>
          ))}
        </div>
      </div>
    </CollapsibleSection>
  );
}

// ============================================================================
// Text Content Card Component (for long-form text content)
// ============================================================================

interface TextContentCardProps {
  title: string;
  icon: React.ReactNode;
  content: string;
  accentColor: string;
  badge?: string;
  defaultOpen?: boolean;
}

function TextContentCard({
  title,
  icon,
  content,
  accentColor,
  badge,
  defaultOpen = false,
}: TextContentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentLength = content.length;
  const shouldTruncate = contentLength > 500 && !isExpanded;
  const displayContent = shouldTruncate ? content.substring(0, 500) + '...' : content;
  const processedContent = linkifyContent(displayContent);

  const colorClasses: Record<
    string,
    { border: string; headerBg: string; iconBg: string; text: string; buttonText: string }
  > = {
    blue: {
      border: 'border-blue-200',
      headerBg: 'from-blue-50',
      iconBg: 'bg-blue-100',
      text: 'text-blue-800',
      buttonText: 'text-blue-600 hover:text-blue-700',
    },
    purple: {
      border: 'border-purple-200',
      headerBg: 'from-purple-50',
      iconBg: 'bg-purple-100',
      text: 'text-purple-800',
      buttonText: 'text-purple-600 hover:text-purple-700',
    },
    green: {
      border: 'border-green-200',
      headerBg: 'from-green-50',
      iconBg: 'bg-green-100',
      text: 'text-green-800',
      buttonText: 'text-green-600 hover:text-green-700',
    },
    orange: {
      border: 'border-orange-200',
      headerBg: 'from-orange-50',
      iconBg: 'bg-orange-100',
      text: 'text-orange-800',
      buttonText: 'text-orange-600 hover:text-orange-700',
    },
    cyan: {
      border: 'border-cyan-200',
      headerBg: 'from-cyan-50',
      iconBg: 'bg-cyan-100',
      text: 'text-cyan-800',
      buttonText: 'text-cyan-600 hover:text-cyan-700',
    },
  };

  const colors = colorClasses[accentColor] || colorClasses.blue;

  return (
    <CollapsibleSection title={title} icon={icon} badge={badge} defaultOpen={defaultOpen}>
      <div className={cn('overflow-hidden rounded-lg border', colors.border)}>
        {/* Header */}
        <div
          className={cn(
            'flex items-center gap-2 border-b bg-gradient-to-r to-transparent px-3 py-2',
            colors.headerBg,
            colors.border
          )}
        >
          <div className={cn('flex h-5 w-5 items-center justify-center rounded', colors.iconBg)}>
            <FileText className={cn('h-3 w-3', colors.text)} />
          </div>
          <span className={cn('text-xs font-medium', colors.text)}>
            {contentLength > 1000
              ? `${Math.round(contentLength / 1000)}k+ characters`
              : `${contentLength} characters`}
          </span>
        </div>

        {/* Content */}
        <div className="p-3">
          <div className="prose prose-sm max-w-none text-sm leading-relaxed text-text-secondary">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-primary underline hover:text-primary-dark"
                  >
                    {children}
                  </a>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-text-primary">{children}</strong>
                ),
                ul: ({ children }) => (
                  <ul className="my-1 list-inside list-disc space-y-0.5">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="my-1 list-inside list-decimal space-y-0.5">{children}</ol>
                ),
                li: ({ children }) => <li className="text-sm">{children}</li>,
                code: ({ children }) => (
                  <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">
                    {children}
                  </code>
                ),
              }}
            >
              {processedContent}
            </ReactMarkdown>
          </div>
          {contentLength > 500 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={cn('mt-2 flex items-center gap-1 text-xs font-medium', colors.buttonText)}
            >
              {isExpanded ? (
                <>
                  <ChevronRight className="h-3 w-3 rotate-90" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronRight className="h-3 w-3 -rotate-90" />
                  Show more ({Math.round(contentLength / 100) * 100}+ chars)
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}

// ============================================================================
// Acceptance Criteria Section (List-style display)
// ============================================================================

function AcceptanceCriteriaSection({ data }: { data: unknown }) {
  // Parse criteria - could be array, string, or object
  let criteria: string[] = [];

  if (Array.isArray(data)) {
    criteria = data.map((item) => String(item));
  } else if (typeof data === 'string') {
    const trimmed = data.trim();
    // Try to parse as JSON/Python
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        criteria = parsed.map((item) => String(item));
      } else {
        criteria = trimmed
          .split(/\n|;/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
    } catch {
      try {
        const jsonStr = pythonToJson(trimmed);
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
          criteria = parsed.map((item) => String(item));
        } else {
          criteria = trimmed
            .split(/\n|;/)
            .map((s) => s.trim())
            .filter(Boolean);
        }
      } catch {
        criteria = trimmed
          .split(/\n|;/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }
  } else if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    criteria = Object.entries(obj).map(([key, val]) => `${key}: ${String(val)}`);
  }

  if (criteria.length === 0) return null;

  return (
    <CollapsibleSection
      title="Acceptance Criteria"
      icon={<ListChecks className="h-4 w-4" />}
      badge={`${criteria.length} criteria`}
      defaultOpen={false}
    >
      <div className="overflow-hidden rounded-lg border border-green-200">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-green-100 bg-gradient-to-r from-green-50 to-transparent px-3 py-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-green-100">
            <ListChecks className="h-3 w-3 text-green-700" />
          </div>
          <span className="text-xs font-medium text-green-800">
            {criteria.length} {criteria.length === 1 ? 'criterion' : 'criteria'} defined
          </span>
        </div>

        {/* Criteria list */}
        <div className="space-y-2 p-3">
          {criteria.map((criterion, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-100">
                <span className="text-xs font-semibold text-green-700">{index + 1}</span>
              </div>
              <p className="flex-1 text-sm leading-relaxed text-text-secondary">{criterion}</p>
            </div>
          ))}
        </div>
      </div>
    </CollapsibleSection>
  );
}

// ============================================================================
// Helper to check if data has meaningful content
// ============================================================================

function hasData(data: unknown): boolean {
  if (data === undefined || data === null) return false;
  if (Array.isArray(data)) return data.length > 0;
  if (typeof data === 'object') return Object.keys(data as object).length > 0;

  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (trimmed.length === 0) return false;

    // Check for empty object/array strings
    if (trimmed === '{}' || trimmed === '[]' || trimmed === 'null' || trimmed === 'None') {
      return false;
    }

    // Try to parse and check if the parsed result is empty
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed === null) return false;
      if (Array.isArray(parsed)) return parsed.length > 0;
      if (typeof parsed === 'object') return Object.keys(parsed).length > 0;
    } catch {
      // Not JSON, but has content as a string
    }

    return true;
  }

  return true;
}

// ============================================================================
// Main InputContextPanel Component
// ============================================================================

export function InputContextPanel({ testCaseData }: InputContextPanelProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(true);

  if (!testCaseData) {
    return null;
  }

  // Extract all fields
  const query = testCaseData[Columns.QUERY] as string | undefined;
  const actualOutput = testCaseData[Columns.ACTUAL_OUTPUT] as string | undefined;
  const expectedOutput = testCaseData[Columns.EXPECTED_OUTPUT] as string | undefined;
  const conversation = testCaseData[Columns.CONVERSATION] as string | undefined;
  const retrievedContent = testCaseData[Columns.RETRIEVED_CONTENT];
  const additionalInput = testCaseData[Columns.ADDITIONAL_INPUT];
  const additionalOutput = testCaseData[Columns.ADDITIONAL_OUTPUT];
  const acceptanceCriteria = testCaseData[Columns.ACCEPTANCE_CRITERIA];
  const dataMetadata = testCaseData[Columns.METADATA]; // data_metadata

  // Smart conversation construction:
  // If conversation exists, parse it; otherwise create from query + actualOutput
  const messages = conversation
    ? parseConversation(conversation)
    : createConversationFromQueryOutput(query, actualOutput);

  // Check if we have any content to display
  const hasRetrievedContent = hasData(retrievedContent);
  const hasAdditionalInput = hasData(additionalInput);
  const hasAdditionalOutput = hasData(additionalOutput);
  const hasAcceptanceCriteria = hasData(acceptanceCriteria);
  const hasDataMetadata = hasData(dataMetadata);
  const hasExpectedOutput = expectedOutput && expectedOutput.trim();

  const hasContent =
    messages.length > 0 ||
    hasExpectedOutput ||
    hasRetrievedContent ||
    hasAdditionalInput ||
    hasAdditionalOutput ||
    hasAcceptanceCriteria ||
    hasDataMetadata;

  if (!hasContent) {
    return null;
  }

  return (
    <div className="border-border/50 h-fit overflow-hidden rounded-xl border bg-white shadow-sm">
      {/* Header */}
      <button
        onClick={() => setIsPanelOpen(!isPanelOpen)}
        className="border-border/50 flex w-full items-center justify-between border-b bg-gray-50 px-4 py-3 transition-colors hover:bg-gray-100"
      >
        <h3 className="text-sm font-semibold text-text-primary">Test Case Context</h3>
        {isPanelOpen ? (
          <ChevronDown className="h-4 w-4 text-text-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 text-text-muted" />
        )}
      </button>

      {/* Content */}
      {isPanelOpen && (
        <div>
          {/* Conversation Display - Primary section, always visible if messages exist */}
          {messages.length > 0 && <ConversationDisplay messages={messages} />}

          {/* Expected Output */}
          {hasExpectedOutput && <ExpectedOutputSection content={expectedOutput} />}

          {/* Acceptance Criteria */}
          {hasAcceptanceCriteria && <AcceptanceCriteriaSection data={acceptanceCriteria} />}

          {/* Retrieved Content - RAG chunks */}
          {hasRetrievedContent && <RetrievedContentSection content={retrievedContent} />}

          {/* Additional Input */}
          {hasAdditionalInput && (
            <KeyValueCard
              title="Additional Input"
              icon={<Settings className="h-4 w-4" />}
              data={additionalInput}
              accentColor="blue"
            />
          )}

          {/* Additional Output */}
          {hasAdditionalOutput &&
            (typeof additionalOutput === 'string' ? (
              <TextContentCard
                title="Additional Output"
                icon={<FileOutput className="h-4 w-4" />}
                content={additionalOutput}
                accentColor="purple"
              />
            ) : (
              <KeyValueCard
                title="Additional Output"
                icon={<FileOutput className="h-4 w-4" />}
                data={additionalOutput}
                accentColor="purple"
              />
            ))}

          {/* Data Metadata */}
          {hasDataMetadata && (
            <KeyValueCard
              title="Data Metadata"
              icon={<Tag className="h-4 w-4" />}
              data={dataMetadata}
              accentColor="cyan"
            />
          )}
        </div>
      )}
    </div>
  );
}
