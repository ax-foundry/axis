'use client';

import { X, Copy, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

import type { Components } from 'react-markdown';

interface ExpandMessageModalProps {
  content: string;
  timestamp: Date;
  onClose: () => void;
}

const MODAL_COMPONENTS: Components = {
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full divide-y divide-border">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
  th: ({ children }) => (
    <th className="px-4 py-2 text-left text-xs font-semibold text-text-primary">{children}</th>
  ),
  td: ({ children }) => <td className="px-4 py-2 text-sm text-text-secondary">{children}</td>,
  tr: ({ children }) => <tr className="border-t border-border">{children}</tr>,
  pre: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg bg-gray-900">
      <pre className="p-4 text-xs leading-relaxed text-gray-100">{children}</pre>
    </div>
  ),
  code: ({ children, className, ...props }) => {
    const isBlock = className?.startsWith('language-');
    return isBlock ? (
      <code className={className} {...props}>
        {children}
      </code>
    ) : (
      <code
        className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-800"
        {...props}
      >
        {children}
      </code>
    );
  },
};

export function ExpandMessageModal({ content, timestamp, onClose }: ExpandMessageModalProps) {
  const [copied, setCopied] = useState(false);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-white shadow-2xl">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm text-text-muted">
            {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                copied
                  ? 'bg-success/10 text-success'
                  : 'bg-gray-100 text-text-muted hover:bg-gray-200 hover:text-text-primary'
              )}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="prose prose-sm max-w-none text-text-primary prose-headings:font-semibold prose-headings:text-text-primary prose-p:leading-relaxed prose-strong:text-text-primary prose-ul:my-1 prose-li:my-0.5">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MODAL_COMPONENTS}>
              {content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
