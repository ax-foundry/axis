'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';

type ContentType = 'markdown' | 'json' | 'plain';

/**
 * Detect the content type based on patterns in the text
 */
function detectContentType(content: string): ContentType {
  if (!content || typeof content !== 'string') return 'plain';

  const trimmed = content.trim();

  // Check for JSON (starts with { or [)
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON, continue checking
    }
  }

  // Check for markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s+/m, // Headers: # ## ### etc.
    /\*\*[^*]+\*\*/, // Bold: **text**
    /\*[^*]+\*/, // Italic: *text*
    /^\s*[-*+]\s+/m, // Unordered lists: - item, * item
    /^\s*\d+\.\s+/m, // Ordered lists: 1. item
    /```[\s\S]*?```/, // Code blocks: ```code```
    /`[^`]+`/, // Inline code: `code`
    /\[.+?\]\(.+?\)/, // Links: [text](url)
    /^\s*>\s+/m, // Blockquotes: > text
    /\|.+\|/, // Tables: | cell |
  ];

  const hasMarkdown = markdownPatterns.some((pattern) => pattern.test(trimmed));

  if (hasMarkdown) {
    return 'markdown';
  }

  return 'plain';
}

interface ContentRendererProps {
  content: string;
  className?: string;
  forceType?: ContentType;
}

export function ContentRenderer({ content, className = '', forceType }: ContentRendererProps) {
  const contentType = useMemo(() => {
    if (forceType) return forceType;
    return detectContentType(content);
  }, [content, forceType]);

  if (!content) {
    return <span className="italic text-text-muted">Empty</span>;
  }

  if (contentType === 'json') {
    try {
      const parsed = JSON.parse(content);
      const formatted = JSON.stringify(parsed, null, 2);
      return (
        <pre className={`overflow-x-auto rounded bg-gray-100 p-3 font-mono text-sm ${className}`}>
          <code>{formatted}</code>
        </pre>
      );
    } catch {
      // Fall through to plain text if JSON parsing fails
    }
  }

  if (contentType === 'markdown') {
    return (
      <div className={`max-w-none text-text-secondary ${className}`}>
        <ReactMarkdown
          components={{
            // Customize heading sizes
            h1: ({ children }) => <h1 className="mb-2 mt-4 text-xl font-bold">{children}</h1>,
            h2: ({ children }) => <h2 className="mb-2 mt-3 text-lg font-semibold">{children}</h2>,
            h3: ({ children }) => <h3 className="mb-1 mt-3 text-base font-semibold">{children}</h3>,
            h4: ({ children }) => <h4 className="mb-1 mt-2 text-sm font-semibold">{children}</h4>,
            // Style code blocks
            code: ({ className, children, ...props }) => {
              const isInline = !className;
              if (isInline) {
                return (
                  <code
                    className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm text-primary-dark"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }
              return (
                <code
                  className={`block overflow-x-auto rounded-lg bg-gray-100 p-3 font-mono text-sm ${className || ''}`}
                  {...props}
                >
                  {children}
                </code>
              );
            },
            pre: ({ children }) => (
              <pre className="my-2 overflow-x-auto rounded-lg bg-gray-100">{children}</pre>
            ),
            // Style lists
            ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
            ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
            li: ({ children }) => <li className="text-text-secondary">{children}</li>,
            // Style links
            a: ({ children, href }) => (
              <a
                href={href}
                className="text-primary underline hover:text-primary-dark"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            ),
            // Style blockquotes
            blockquote: ({ children }) => (
              <blockquote className="my-2 border-l-4 border-primary/30 pl-4 italic text-text-muted">
                {children}
              </blockquote>
            ),
            // Style paragraphs
            p: ({ children }) => <p className="my-2">{children}</p>,
            // Style strong/bold
            strong: ({ children }) => (
              <strong className="font-semibold text-text-primary">{children}</strong>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  }

  // Plain text - preserve whitespace
  return <div className={`whitespace-pre-wrap ${className}`}>{content}</div>;
}

export { detectContentType, type ContentType };
