'use client';

import { Bot, User, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationViewProps {
  messages: Message[];
  maxHeight?: string;
  compact?: boolean;
  showCopyButtons?: boolean;
}

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  compact?: boolean;
  showCopyButton?: boolean;
}

// ============================================================================
// Utilities
// ============================================================================

// Convert plain URLs in text to markdown links
function linkifyContent(content: string): string {
  const urlRegex = /(?<!\]\()(?<!\[)(https?:\/\/[^\s\)]+)/g;
  return content.replace(urlRegex, (url) => {
    const cleanUrl = url.replace(/[,.\s]+$/, '');
    return `[${cleanUrl}](${cleanUrl})`;
  });
}

/**
 * Convert Python dict/list string syntax to valid JSON.
 * Handles single quotes, None, True, False, escaped quotes, and apostrophes within strings.
 */
export function pythonToJson(pythonStr: string): string {
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
          // Unknown escape — emit escaped backslash + the next char for valid JSON
          result += '\\\\';
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
        // Escape control characters (U+0000 to U+001F) as \uXXXX for valid JSON
        const code = char.charCodeAt(0);
        if (code < 0x20) {
          result += '\\u' + code.toString(16).padStart(4, '0');
        } else {
          result += char;
        }
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
  if (typeof data === 'object' && data !== null && 'messages' in data) {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.messages)) {
      return obj.messages;
    }
  }
  return null;
}

/**
 * Parse conversation data from various formats (JSON, Python dict, plain text)
 */
export function parseConversation(data: string | unknown): Message[] {
  if (!data) return [];

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

  if (typeof data === 'string') {
    const trimmed = data.trim();

    try {
      const parsed = JSON.parse(trimmed);
      const parsedMessages = extractMessagesArray(parsed);
      if (parsedMessages) {
        return parseConversation(parsedMessages);
      }
    } catch {
      // Not valid JSON
    }

    try {
      const jsonStr = pythonToJson(trimmed);
      const parsed = JSON.parse(jsonStr);
      const parsedMessages = extractMessagesArray(parsed);
      if (parsedMessages) {
        return parseConversation(parsedMessages);
      }
    } catch {
      // Not valid Python dict
    }

    if (trimmed) {
      return [{ role: 'user', content: trimmed }];
    }
  }

  return [];
}

/**
 * Create a conversation from query and output strings
 */
export function createConversationFromQueryOutput(query?: string, output?: string): Message[] {
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
// Copy Button Component
// ============================================================================

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'rounded p-1 opacity-0 transition-colors hover:bg-black/10 group-hover:opacity-100',
        className
      )}
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// ============================================================================
// Message Bubble Component
// ============================================================================

function MessageBubble({
  role,
  content,
  compact = false,
  showCopyButton = true,
}: MessageBubbleProps) {
  const isUser = role === 'user';
  const processedContent = linkifyContent(content);

  return (
    <div className={cn('group flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div
          className={cn(
            'flex flex-shrink-0 items-center justify-center rounded-full',
            compact ? 'h-6 w-6' : 'h-8 w-8',
            'bg-accent-gold/20'
          )}
        >
          <Bot className={cn(compact ? 'h-3 w-3' : 'h-4 w-4', 'text-accent-gold')} />
        </div>
      )}
      <div
        className={cn(
          'relative',
          compact ? 'max-w-[90%]' : 'max-w-[85%]',
          compact ? 'px-3 py-2' : 'px-4 py-3',
          isUser
            ? 'rounded-2xl rounded-br-md bg-primary text-white'
            : 'rounded-2xl rounded-bl-md bg-gray-100 text-text-primary'
        )}
      >
        {showCopyButton && (
          <CopyButton
            text={content}
            className={cn(
              'absolute right-1 top-1',
              isUser ? 'text-white/70 hover:text-white' : 'text-text-muted'
            )}
          />
        )}
        {isUser ? (
          <p className={cn('whitespace-pre-wrap leading-relaxed', compact ? 'text-xs' : 'text-sm')}>
            {content}
          </p>
        ) : (
          <div
            className={cn(
              'prose max-w-none leading-relaxed',
              compact ? 'prose-xs text-xs' : 'prose-sm text-sm'
            )}
          >
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
                li: ({ children }) => <li>{children}</li>,
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
        <div
          className={cn(
            'flex flex-shrink-0 items-center justify-center rounded-full',
            compact ? 'h-6 w-6' : 'h-8 w-8',
            'bg-primary/20'
          )}
        >
          <User className={cn(compact ? 'h-3 w-3' : 'h-4 w-4', 'text-primary')} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Conversation View Component
// ============================================================================

export function ConversationView({
  messages,
  maxHeight = '300px',
  compact = false,
  showCopyButtons = true,
}: ConversationViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (messages.length === 0) {
    return (
      <div className="p-4 text-center text-sm italic text-text-muted">No conversation data</div>
    );
  }

  const shouldTruncate = messages.length > 2 && !isExpanded;

  return (
    <div className="relative">
      <div
        className={cn('space-y-3 overflow-y-auto', compact ? 'p-2' : 'p-4')}
        style={{ maxHeight: isExpanded ? 'none' : maxHeight }}
      >
        {shouldTruncate && messages.length > 2 && (
          <>
            <MessageBubble
              role={messages[0].role}
              content={messages[0].content}
              compact={compact}
              showCopyButton={showCopyButtons}
            />
            <button
              onClick={() => setIsExpanded(true)}
              className="flex w-full items-center justify-center gap-1 py-2 text-xs font-medium text-primary hover:text-primary-dark"
            >
              <ChevronDown className="h-3 w-3" />
              Show {messages.length - 2} more message{messages.length - 2 !== 1 ? 's' : ''}
            </button>
            <MessageBubble
              role={messages[messages.length - 1].role}
              content={messages[messages.length - 1].content}
              compact={compact}
              showCopyButton={showCopyButtons}
            />
          </>
        )}

        {!shouldTruncate &&
          messages.map((message, index) => (
            <MessageBubble
              key={index}
              role={message.role}
              content={message.content}
              compact={compact}
              showCopyButton={showCopyButtons}
            />
          ))}
      </div>

      {isExpanded && messages.length > 2 && (
        <button
          onClick={() => setIsExpanded(false)}
          className="border-border/30 flex w-full items-center justify-center gap-1 border-t py-2 text-xs font-medium text-primary hover:text-primary-dark"
        >
          <ChevronUp className="h-3 w-3" />
          Show less
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Compact Conversation Preview (for table cells)
// ============================================================================

interface CompactConversationProps {
  query?: string;
  output?: string;
  conversation?: string;
  maxPreviewLength?: number;
}

export function CompactConversation({
  query,
  output,
  conversation,
  maxPreviewLength = 150,
}: CompactConversationProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Parse or create messages
  const messages = conversation
    ? parseConversation(conversation)
    : createConversationFromQueryOutput(query, output);

  if (messages.length === 0) {
    return <span className="text-sm italic text-text-muted">No content</span>;
  }

  // For collapsed view, show truncated preview
  if (!isExpanded) {
    const previewText = messages
      .map((m) => `${m.role === 'user' ? 'Q: ' : 'A: '}${m.content}`)
      .join(' ');
    const truncated =
      previewText.length > maxPreviewLength
        ? previewText.substring(0, maxPreviewLength) + '...'
        : previewText;

    return (
      <div className="space-y-1">
        <p className="line-clamp-3 text-sm text-text-secondary">{truncated}</p>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(true);
          }}
          className="text-xs font-medium text-primary hover:text-primary-dark"
        >
          View conversation ({messages.length} message{messages.length !== 1 ? 's' : ''})
        </button>
      </div>
    );
  }

  // Expanded view
  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <div className="border-border/30 rounded-lg border bg-gray-50">
        <ConversationView
          messages={messages}
          maxHeight="400px"
          compact={true}
          showCopyButtons={true}
        />
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(false);
        }}
        className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-dark"
      >
        <ChevronUp className="h-3 w-3" />
        Collapse
      </button>
    </div>
  );
}
