'use client';

import { Sparkles, Send, Loader2, X, AlertCircle } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useCopilotStream, useAIStatus } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useDataStore, useMonitoringStore, useHumanSignalsStore, useKpiStore } from '@/stores';
import { useCopilotStore, type DatasetLabel } from '@/stores/copilot-store';

import { ThoughtPanel } from './thought-panel';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface DatasetOption {
  label: DatasetLabel;
  display: string;
  available: boolean;
  rowCount: number;
}

interface CopilotSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CopilotSidebar({ isOpen, onClose }: CopilotSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const dataStore = useDataStore();
  const monitoringStore = useMonitoringStore();
  const humanSignalsStore = useHumanSignalsStore();
  const kpiStore = useKpiStore();

  const { data: aiStatus } = useAIStatus();
  const { stream, cancel, isStreaming } = useCopilotStream();
  const {
    finalResponse,
    error,
    thoughts,
    reset,
    selectedDataset,
    setSelectedDataset,
    provider,
    setProvider,
  } = useCopilotStore();

  // Build dataset options
  const datasetOptions: DatasetOption[] = [
    {
      label: 'evaluation',
      display: 'Evaluation',
      available: dataStore.data.length > 0,
      rowCount: dataStore.data.length,
    },
    {
      label: 'monitoring',
      display: 'Monitoring',
      available: monitoringStore.data.length > 0,
      rowCount: monitoringStore.data.length,
    },
    {
      label: 'human_signals',
      display: 'Human Signals',
      available: humanSignalsStore.cases.length > 0,
      rowCount: humanSignalsStore.cases.length,
    },
    {
      label: 'kpi',
      display: 'KPI',
      available: kpiStore.datasetReady,
      rowCount: 0,
    },
  ];

  const availableDatasets = datasetOptions.filter((d) => d.available);

  // Auto-select first available dataset on mount / when datasets change
  useEffect(() => {
    if (!selectedDataset && availableDatasets.length > 0) {
      setSelectedDataset(availableDatasets[0].label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableDatasets.length, selectedDataset, setSelectedDataset]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, thoughts]);

  // Handle final response from streaming
  useEffect(() => {
    if (finalResponse) {
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
    if (error) {
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

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const messageToSend = input;
    setInput('');
    stream(messageToSend);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const suggestedQueries = [
    'Summarize this dataset',
    'Which metrics are performing below average?',
    'How does performance compare across groups?',
    'What are the key statistics?',
  ];

  const selectedOption = datasetOptions.find((d) => d.label === selectedDataset);

  if (!isOpen) return null;

  return (
    <aside className="flex h-screen w-96 flex-col border-l border-border bg-surface">
      {/* Header */}
      <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-gold/20">
            <Sparkles className="h-5 w-5 text-accent-gold" />
          </div>
          <div>
            <span className="font-semibold text-text-primary">Ask Echo</span>
            {aiStatus?.configured && <p className="text-xs text-text-muted">{aiStatus.model}</p>}
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
        >
          <X className="h-5 w-5 text-text-muted" />
        </button>
      </div>

      {/* Status Warning */}
      {aiStatus && !aiStatus.configured && (
        <div className="border-warning/20 bg-warning/10 flex items-start gap-2 border-b p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
          <p className="text-xs text-warning">
            Ask Echo is not configured. Add an OpenAI or Anthropic API key to enable it.
          </p>
        </div>
      )}

      {/* Dataset Picker */}
      {availableDatasets.length > 0 && (
        <div className="flex-shrink-0 border-b border-border px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Dataset:</span>
            <div className="flex flex-wrap gap-1">
              {availableDatasets.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setSelectedDataset(opt.label)}
                  className={cn(
                    'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
                    selectedDataset === opt.label
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-text-muted hover:bg-gray-200'
                  )}
                >
                  {opt.display}
                  {opt.rowCount > 0 && (
                    <span className="opacity-70">{opt.rowCount.toLocaleString()}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          {selectedOption && (
            <p className="mt-1 text-xs text-text-muted">
              {selectedOption.display}
              {selectedOption.rowCount > 0 && ` · ${selectedOption.rowCount.toLocaleString()} rows`}
            </p>
          )}
        </div>
      )}

      {/* Provider Toggle */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-4 py-1.5">
        <span className="text-xs text-text-muted">Engine:</span>
        {(['pydantic-ai', 'oai-agents'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setProvider(p)}
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
              provider === p
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-text-muted hover:bg-gray-200'
            )}
          >
            {p === 'pydantic-ai' ? 'Pydantic AI' : 'OAI Agents'}
          </button>
        ))}
      </div>

      {/* Thought Panel */}
      <ThoughtPanel />

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && !isStreaming ? (
          <div className="py-8 text-center">
            <Sparkles className="mx-auto mb-4 h-12 w-12 text-accent-gold opacity-50" />
            <p className="mb-4 text-text-secondary">Ask Echo about your data</p>

            {availableDatasets.length === 0 && (
              <div className="mb-4 rounded-lg bg-gray-100 p-3 text-left dark:bg-gray-800">
                <p className="text-sm text-text-muted">
                  No data loaded. Upload a CSV to get started.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <p className="mb-2 text-xs text-text-muted">Try asking:</p>
              {suggestedQueries.map((query, index) => (
                <button
                  key={index}
                  onClick={() => setInput(query)}
                  className="w-full rounded-lg bg-gray-50 px-3 py-2 text-left text-sm text-text-secondary
                           transition-colors hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
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
                  <Sparkles className="h-4 w-4 text-accent-gold" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[85%] rounded-lg px-4 py-2',
                  message.role === 'user'
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-text-primary dark:bg-gray-800'
                )}
              >
                {message.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none text-text-primary prose-headings:text-text-primary prose-strong:text-text-primary prose-ul:my-1 prose-li:my-0 prose-table:w-full prose-thead:bg-gray-100 prose-th:px-3 prose-th:py-1.5 prose-th:text-left prose-th:text-xs prose-th:font-semibold prose-td:border-t prose-td:border-border prose-td:px-3 prose-td:py-1 prose-td:text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
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
            <div className="rounded-lg bg-gray-100 px-4 py-2 dark:bg-gray-800">
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
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Ask Echo..."
            rows={1}
            className="input flex-1 resize-none text-sm"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              onClick={cancel}
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
