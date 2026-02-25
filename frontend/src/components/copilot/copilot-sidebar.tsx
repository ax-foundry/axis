'use client';

import { Bot, Send, Loader2, X, Sparkles, AlertCircle, Database } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

import { useCopilotStream, useAIStatus } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useDataStore } from '@/stores';
import { useCopilotStore } from '@/stores/copilot-store';

import { ThoughtPanel } from './thought-panel';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface CopilotSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CopilotSidebar({ isOpen, onClose }: CopilotSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [includeData, setIncludeData] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data, metricColumns, componentColumns } = useDataStore();
  const { data: aiStatus } = useAIStatus();
  const { stream, cancel, isStreaming } = useCopilotStream();
  const { finalResponse, error, thoughts, reset } = useCopilotStore();

  // Debug logging for state changes
  useEffect(() => {
    console.log('[CopilotSidebar] thoughts updated, count:', thoughts.length);
  }, [thoughts]);

  useEffect(() => {
    console.log('[CopilotSidebar] isStreaming changed:', isStreaming);
  }, [isStreaming]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, thoughts]);

  // Handle final response from streaming
  useEffect(() => {
    console.log('[CopilotSidebar] finalResponse changed:', finalResponse?.substring(0, 50));
    if (finalResponse) {
      console.log('[CopilotSidebar] Adding assistant message from finalResponse');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: finalResponse,
          timestamp: new Date(),
        },
      ]);
      reset();
    }
  }, [finalResponse, reset]);

  // Handle errors
  useEffect(() => {
    console.log('[CopilotSidebar] error changed:', error);
    if (error) {
      console.log('[CopilotSidebar] Adding error message');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${error}`,
          timestamp: new Date(),
        },
      ]);
      reset();
    }
  }, [error, reset]);

  const handleSend = async () => {
    console.log('[CopilotSidebar] handleSend called, input:', input, 'isStreaming:', isStreaming);
    if (!input.trim() || isStreaming) {
      console.log('[CopilotSidebar] handleSend returning early');
      return;
    }

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    console.log('[CopilotSidebar] Adding user message and calling stream()');
    setMessages((prev) => [...prev, userMessage]);
    const messageToSend = input;
    setInput('');

    // Start streaming with the copilot
    console.log(
      '[CopilotSidebar] Calling stream with:',
      messageToSend,
      includeData && data.length > 0
    );
    stream(messageToSend, includeData && data.length > 0);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCancel = () => {
    cancel();
  };

  const suggestedQueries = [
    'What are the main insights from this data?',
    'Which metrics are performing below threshold?',
    'How does this compare across experiments?',
    'Summarize the evaluation results',
  ];

  if (!isOpen) return null;

  return (
    <aside className="flex h-screen w-96 flex-col border-l border-border bg-white">
      {/* Header */}
      <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-gold/20">
            <Bot className="h-5 w-5 text-accent-gold" />
          </div>
          <div>
            <span className="font-semibold text-text-primary">AI Copilot</span>
            {aiStatus?.configured && <p className="text-xs text-text-muted">{aiStatus.model}</p>}
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-2 transition-colors hover:bg-gray-100">
          <X className="h-5 w-5 text-text-muted" />
        </button>
      </div>

      {/* Status Warning */}
      {aiStatus && !aiStatus.configured && (
        <div className="border-warning/20 bg-warning/10 flex items-start gap-2 border-b p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
          <p className="text-xs text-warning">
            AI features require OpenAI or Anthropic API configuration. Add your API key to enable
            the copilot.
          </p>
        </div>
      )}

      {/* Thought Panel - Shows real-time reasoning */}
      <ThoughtPanel />

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && !isStreaming ? (
          <div className="py-8 text-center">
            <Sparkles className="mx-auto mb-4 h-12 w-12 text-accent-gold opacity-50" />
            <p className="mb-4 text-text-secondary">Ask questions about your evaluation data</p>

            {/* Data Context */}
            {data.length > 0 ? (
              <div className="mb-4 rounded-lg bg-primary-pale/50 p-3 text-left">
                <p className="mb-1 text-sm font-medium text-text-primary">Current Context</p>
                <p className="text-xs text-text-muted">
                  {data.length} records | {metricColumns.length} metrics | {componentColumns.length}{' '}
                  components
                </p>
              </div>
            ) : (
              <div className="mb-4 rounded-lg bg-gray-100 p-3 text-left">
                <p className="text-sm text-text-muted">
                  No data loaded. Upload data for contextual insights.
                </p>
              </div>
            )}

            {/* Suggested Queries */}
            <div className="space-y-2">
              <p className="mb-2 text-xs text-text-muted">Try asking:</p>
              {suggestedQueries.map((query, index) => (
                <button
                  key={index}
                  onClick={() => setInput(query)}
                  className="w-full rounded-lg bg-gray-50 px-3 py-2 text-left text-sm
                           text-text-secondary transition-colors hover:bg-gray-100"
                >
                  {query}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                'flex gap-3',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role === 'assistant' && (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-gold/20">
                  <Bot className="h-4 w-4 text-accent-gold" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[85%] rounded-lg px-4 py-2',
                  message.role === 'user'
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-text-primary'
                )}
              >
                {message.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none text-text-primary prose-headings:text-text-primary prose-strong:text-text-primary prose-ul:my-1 prose-li:my-0">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                )}
                <p
                  className={cn(
                    'mt-1 text-xs',
                    message.role === 'user' ? 'text-white/70' : 'text-text-muted'
                  )}
                >
                  {message.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          ))
        )}

        {isStreaming && messages.length > 0 && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-gold/20">
              <Loader2 className="h-4 w-4 animate-spin text-accent-gold" />
            </div>
            <div className="rounded-lg bg-gray-100 px-4 py-2">
              <p className="text-sm text-text-muted">
                {thoughts.length > 0
                  ? `Processing (${thoughts.length} thoughts)...`
                  : 'Starting...'}
              </p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-border p-4">
        {/* Data toggle */}
        {data.length > 0 && (
          <div className="mb-3 flex items-center justify-between">
            <button
              onClick={() => setIncludeData(!includeData)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
                includeData
                  ? 'bg-primary/10 text-primary'
                  : 'bg-gray-100 text-text-muted hover:bg-gray-200'
              )}
            >
              <Database className="h-3 w-3" />
              {includeData ? 'Data included' : 'Data excluded'}
            </button>
            <span className="text-xs text-text-muted">{data.length} rows</span>
          </div>
        )}

        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Ask a question..."
            rows={1}
            className="input flex-1 resize-none text-sm"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              onClick={handleCancel}
              className="hover:bg-error/90 rounded-lg bg-error p-2 text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="rounded-lg bg-primary p-2 text-white transition-colors
                       hover:bg-primary-dark disabled:opacity-50"
            >
              <Send className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
