'use client';

import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  Send,
  SquarePen,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { PlotlyChart } from '@/components/charts/plotly-chart';
import { getAgentRegistry } from '@/config/agents';
import { useCopilotStream, useAIStatus, useStoreStatus } from '@/lib/hooks';
import { useAppIconUrl, useBranding, useCopilotIcon } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useCopilotStore, type DatasetLabel } from '@/stores/copilot-store';

import { ExpandMessageModal } from './expand-message-modal';
import { ThoughtSteps } from './thought-panel';

import type { Thought } from '@/types';
import type { Components } from 'react-markdown';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  thoughts?: Thought[];
  chart?: Record<string, unknown> | null;
  download?: { export_sql: string; filename: string; row_count: number } | null;
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

// ─── Markdown renderers ───────────────────────────────────────────────────────

const MD_COMPONENTS: Components = {
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full divide-y divide-border">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-50 dark:bg-gray-800">{children}</thead>,
  th: ({ children }) => (
    <th className="whitespace-nowrap px-3 py-1.5 text-left text-xs font-semibold text-text-primary">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="px-3 py-1 text-sm text-text-secondary">{children}</td>,
  tr: ({ children }) => <tr className="border-t border-border">{children}</tr>,
  pre: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg bg-gray-900">
      <pre className="p-3 text-xs leading-relaxed text-gray-100">{children}</pre>
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
        className="rounded bg-gray-200 px-1 py-0.5 font-mono text-xs text-gray-800 dark:bg-gray-700 dark:text-gray-200"
        {...props}
      >
        {children}
      </code>
    );
  },
};

const COLLAPSE_THRESHOLD = 600;

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const isLong = message.content.length > COLLAPSE_THRESHOLD;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ── User bubble ──
  if (message.role === 'user') {
    return (
      <div className="flex justify-end px-1">
        <div className="max-w-[82%] rounded-2xl bg-primary px-4 py-2.5 text-white shadow-sm">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
          <p className="mt-1 text-right text-[10px] text-white/50">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    );
  }

  // ── Assistant bubble ──
  return (
    <>
      <div className="px-1">
        {/* Thoughts toggle */}
        {message.thoughts && message.thoughts.length > 0 && (
          <ThoughtSteps thoughts={message.thoughts} compact />
        )}

        {/* Chart (if agent produced one) */}
        {message.chart && (
          <div className="mb-2 overflow-hidden rounded-xl border border-border bg-white shadow-sm dark:bg-gray-800">
            <PlotlyChart
              data={(message.chart.data as Plotly.Data[]) ?? []}
              layout={(message.chart.layout as Partial<Plotly.Layout>) ?? {}}
              style={{ width: '100%', height: 260 }}
            />
          </div>
        )}

        {/* Download button (if agent produced a downloadable export) */}
        {message.download && (
          <div className="mb-2 flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-3 shadow-sm dark:bg-gray-800">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Download className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-text-primary">
                {message.download.filename}
              </p>
              <p className="text-[11px] text-text-muted">
                {message.download.row_count.toLocaleString()} rows · CSV
              </p>
            </div>
            <button
              onClick={async () => {
                const res = await fetch('/api/store/export', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    sql: message.download!.export_sql,
                    filename: message.download!.filename,
                  }),
                });
                if (!res.ok) return;
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = message.download!.filename;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex-shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-dark"
            >
              Download
            </button>
          </div>
        )}

        {/* Response card */}
        <div className="border-border/60 rounded-2xl border bg-white px-4 py-3 shadow-sm dark:bg-gray-800">
          {/* Content */}
          <div className={cn('relative', isLong && !isExpanded && 'max-h-[300px] overflow-hidden')}>
            <div className="prose prose-sm max-w-none text-text-primary prose-headings:font-semibold prose-headings:text-text-primary prose-p:leading-relaxed prose-strong:text-text-primary prose-ul:my-1 prose-li:my-0">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                {message.content}
              </ReactMarkdown>
            </div>
            {isLong && !isExpanded && (
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent dark:from-gray-800" />
            )}
          </div>

          {/* Show more/less */}
          {isLong && (
            <button
              onClick={() => setIsExpanded((v) => !v)}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-dark"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3" /> Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" /> Show full response
                </>
              )}
            </button>
          )}

          {/* Action footer */}
          <div className="border-border/40 mt-2.5 flex items-center gap-0.5 border-t pt-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary dark:hover:bg-white/10"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-success" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> Copy
                </>
              )}
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary dark:hover:bg-white/10"
            >
              <Maximize2 className="h-3 w-3" /> Expand
            </button>
            <span className="text-text-muted/50 ml-auto text-[10px]">
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </div>

      {showModal && (
        <ExpandMessageModal
          content={message.content}
          timestamp={message.timestamp}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

// ─── CopilotSidebar ───────────────────────────────────────────────────────────

const MIN_WIDTH = 320;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 384;

export function CopilotSidebar({ isOpen, onClose }: CopilotSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const [isDetached, setIsDetached] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const thoughtsRef = useRef<Thought[]>([]);
  const { url: copilotIcon, isDedicated } = useCopilotIcon();
  const appIconUrl = useAppIconUrl();
  const { copilot_name: copilotName } = useBranding();

  // Resize drag state
  const isResizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(DEFAULT_WIDTH);

  const { data: aiStatus } = useAIStatus();
  const { data: storeStatus } = useStoreStatus();
  const { stream, cancel, isStreaming } = useCopilotStream();
  const {
    finalResponse,
    finalChart,
    finalDownload,
    error,
    thoughts,
    reset,
    selectedDataset,
    setSelectedDataset,
    provider,
    setProvider,
    startNewChat,
    selectedAgent,
    setSelectedAgent,
    conversationResetKey,
  } = useCopilotStore();

  const agents = getAgentRegistry().filter((agent) => agent.active !== false);

  const handleNewChat = useCallback(() => {
    cancel();
    startNewChat();
    setMessages([]);
  }, [cancel, startNewChat]);

  // Keep a ref snapshot of thoughts so we can capture them when response arrives
  useEffect(() => {
    thoughtsRef.current = thoughts;
  }, [thoughts]);

  // Clear local messages when agent changes (conversationResetKey increments)
  useEffect(() => {
    if (conversationResetKey > 0) {
      setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationResetKey]);

  // ── Dataset options ──
  const duckdbDatasets = storeStatus?.datasets ?? {};
  const duckRows = (table: string) =>
    (duckdbDatasets[table] as { rows?: number } | undefined)?.rows ?? 0;

  const datasetOptions: DatasetOption[] = [
    {
      label: 'evaluation',
      display: 'Evaluation',
      available: duckRows('eval_data') > 0,
      rowCount: duckRows('eval_data'),
    },
    {
      label: 'monitoring',
      display: 'Monitoring',
      available: duckRows('monitoring_data') > 0,
      rowCount: duckRows('monitoring_data'),
    },
    {
      label: 'human_signals',
      display: 'Human Signals',
      available: duckRows('human_signals_cases') > 0,
      rowCount: duckRows('human_signals_cases'),
    },
    {
      label: 'kpi',
      display: 'KPI',
      available: duckRows('kpi_data') > 0,
      rowCount: duckRows('kpi_data'),
    },
  ];

  const availableDatasets = datasetOptions.filter((d) => d.available);
  const selectedOption = datasetOptions.find((d) => d.label === selectedDataset);

  // Auto-select first available
  useEffect(() => {
    if (!selectedDataset && availableDatasets.length > 0) {
      setSelectedDataset(availableDatasets[0].label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableDatasets.length, selectedDataset, setSelectedDataset]);

  // Auto-scroll on new messages / thoughts
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thoughts]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // Capture thoughts + chart + download snapshot and attach to assistant message on completion
  useEffect(() => {
    if (finalResponse) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: finalResponse,
          timestamp: new Date(),
          thoughts: [...thoughtsRef.current],
          chart: finalChart ?? null,
          download: finalDownload ?? null,
        },
      ]);
      reset();
    }
  }, [finalResponse, finalChart, finalDownload, reset]);

  // Handle error
  useEffect(() => {
    if (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `I encountered an error: ${error}`,
          timestamp: new Date(),
          thoughts: [...thoughtsRef.current],
        },
      ]);
      reset();
    }
  }, [error, reset]);

  // ── Resize ──
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      isResizing.current = true;
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = sidebarWidth;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    },
    [sidebarWidth]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = resizeStartX.current - e.clientX;
      const next = Math.min(Math.max(resizeStartWidth.current + delta, MIN_WIDTH), MAX_WIDTH);
      setSidebarWidth(next);
    };
    const onUp = () => {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  // ── Send ──
  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    setMessages((prev) => [...prev, { role: 'user', content: input, timestamp: new Date() }]);
    const msg = input;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    stream(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const suggestedQueries = [
    'What tools do you have available?',
    'Explain the current dataset options and the schemas',
    'Plot a line chart of the lowest scoring metrics scores by day',
  ];

  if (!isOpen) return null;

  // ── Shared inner content ──
  const inner = (
    <>
      {/* Resize handle */}
      {!isDetached && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize transition-colors hover:bg-primary/20"
        />
      )}

      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-[#FAFAF8] px-4 py-3 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <p className="text-base font-semibold leading-tight text-text-primary">
            Ask {copilotName}
          </p>
          {isStreaming && <p className="text-[10px] font-medium text-blue-500">thinking…</p>}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleNewChat}
            title="New chat"
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-black/5 hover:text-text-primary dark:hover:bg-white/10"
          >
            <SquarePen className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsDetached((v) => !v)}
            title={isDetached ? 'Re-attach' : 'Float panel'}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-black/5 hover:text-text-primary dark:hover:bg-white/10"
          >
            {isDetached ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-black/5 hover:text-text-primary dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Not configured warning */}
      {aiStatus && !aiStatus.configured && (
        <div className="border-warning/20 bg-warning/8 flex flex-shrink-0 items-start gap-2 border-b p-3">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
          <p className="text-xs text-warning">
            Ask {copilotName} is not configured. Add an API key in Settings.
          </p>
        </div>
      )}

      {/* Dataset + Engine controls */}
      <div className="flex-shrink-0 border-b border-border bg-[#FAFAF8] dark:bg-gray-900">
        {/* Agent selector pills — only shown when registry has agents and one is selected */}
        {agents.length > 0 && selectedAgent !== null && (
          <div className="px-4 pb-1 pt-3">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Agent
            </p>
            <div className="flex flex-wrap gap-1.5">
              {agents.map((a) => (
                <button
                  key={a.name}
                  onClick={() => setSelectedAgent(a.name)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    selectedAgent === a.name
                      ? 'bg-primary text-white'
                      : 'bg-muted hover:bg-muted/80 text-text-muted'
                  )}
                >
                  {a.avatar && (
                    <img src={a.avatar} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
                  )}
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Dataset row */}
        <div className="flex items-center gap-2 px-4 pb-2 pt-3">
          <p className="text-[11px] font-medium text-text-muted">Dataset:</p>
          <div className="border-border/60 flex items-center rounded-full border bg-white px-0.5 py-0.5 shadow-sm dark:bg-gray-800">
            {datasetOptions.map((opt) => (
              <button
                key={opt.label}
                onClick={() => opt.available && setSelectedDataset(opt.label)}
                disabled={!opt.available}
                title={opt.available ? undefined : `Load ${opt.display} data to enable`}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all',
                  selectedDataset === opt.label
                    ? 'bg-[#6B7FA3] text-white shadow-sm'
                    : opt.available
                      ? 'text-text-secondary hover:bg-gray-100 dark:hover:bg-white/10'
                      : 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                )}
              >
                {opt.display}
              </button>
            ))}
          </div>
        </div>

        {/* Engine row */}
        <div className="flex items-center gap-2 px-4 pb-2.5 pt-1">
          <span className="text-xs font-medium text-text-muted">Engine:</span>
          {(['oai-agents'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-all',
                provider === p
                  ? 'bg-[#6B7FA3] text-white shadow-sm'
                  : 'bg-gray-100 text-text-secondary hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600'
              )}
            >
              {p === 'oai-agents' ? 'OpenAI Agents' : p}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {messages.length === 0 && !isStreaming ? (
          /* ── Empty state ── */
          <div className="flex flex-col items-center py-10 text-center">
            <div className="relative mb-5 flex h-64 w-64 items-center justify-center overflow-hidden rounded-3xl">
              {isDedicated && copilotIcon ? (
                <Image
                  src={copilotIcon}
                  alt={copilotName}
                  fill
                  className="object-cover opacity-30"
                  unoptimized
                />
              ) : (
                <Image
                  src={appIconUrl || '/images/ax-icon.png'}
                  alt={copilotName}
                  width={96}
                  height={96}
                  className="opacity-40"
                  unoptimized
                />
              )}
            </div>
            <p className="mb-1 text-sm font-medium text-text-primary">Ask {copilotName}</p>
            <p className="mb-5 text-xs text-text-muted">
              {availableDatasets.length > 0
                ? `Explore your ${selectedOption?.display ?? 'data'} with natural language`
                : 'Load a dataset to get started'}
            </p>

            {availableDatasets.length === 0 && (
              <div className="mb-4 w-full rounded-xl border border-border bg-gray-50 p-3 text-left dark:bg-gray-800">
                <p className="text-xs text-text-muted">
                  No data loaded yet. Upload a CSV or connect a database.
                </p>
              </div>
            )}

            <div className="w-full space-y-1.5">
              {suggestedQueries.map((query, i) => (
                <button
                  key={i}
                  onClick={() => setInput(query)}
                  className="border-border/60 w-full rounded-xl border bg-gray-50/80 px-3 py-2 text-left text-xs text-text-secondary transition-colors hover:border-border hover:bg-gray-100 dark:bg-gray-800/80 dark:hover:bg-gray-700"
                >
                  {query}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Message list ── */
          <div className="space-y-4">
            {messages.map((message, i) => (
              <MessageBubble key={i} message={message} />
            ))}

            {/* Live thinking card */}
            {isStreaming && (
              <div className="px-1">
                <ThoughtSteps thoughts={thoughts} isStreaming />
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar — replaced by agent picker when no agent is selected */}
      {agents.length > 0 && selectedAgent === null ? (
        <div className="flex flex-shrink-0 flex-col items-center gap-3 border-t border-border bg-white p-6 text-center dark:bg-gray-900">
          <p className="text-sm text-text-muted">Select an agent to start</p>
          <div className="flex flex-wrap justify-center gap-2">
            {agents.map((a) => (
              <button
                key={a.name}
                onClick={() => setSelectedAgent(a.name)}
                className="hover:bg-muted flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors"
              >
                {a.avatar && (
                  <img src={a.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                )}
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-shrink-0 border-t border-border bg-white px-3 py-3 dark:bg-gray-900">
          <div className="flex items-end gap-2 rounded-xl border border-border bg-gray-50 px-3 py-2 focus-within:border-primary/40 focus-within:bg-white focus-within:shadow-sm dark:bg-gray-800 dark:focus-within:bg-gray-700">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask ${copilotName}…`}
              rows={1}
              className="placeholder:text-text-muted/60 flex-1 resize-none bg-transparent text-sm leading-relaxed text-text-primary outline-none"
              style={{ maxHeight: '160px' }}
              disabled={isStreaming}
            />
            {isStreaming ? (
              <button
                onClick={cancel}
                className="bg-error/10 hover:bg-error/20 mb-0.5 flex-shrink-0 rounded-lg p-1.5 text-error transition-colors"
                title="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="mb-0.5 flex-shrink-0 rounded-lg bg-primary p-1.5 text-white transition-colors hover:bg-primary-dark disabled:opacity-30"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="text-text-muted/50 mt-1.5 text-center text-[10px]">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      )}
    </>
  );

  // ── Detached floating panel ──
  if (isDetached) {
    return (
      <>
        <div
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px]"
          onClick={() => setIsDetached(false)}
        />
        <aside
          className="fixed inset-y-4 right-4 z-50 flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10"
          style={{ width: Math.max(sidebarWidth, 680) }}
        >
          {inner}
        </aside>
      </>
    );
  }

  // ── Normal sidebar ──
  return (
    <aside
      className="relative flex h-screen flex-col border-l border-border bg-white dark:bg-gray-900"
      style={{ width: sidebarWidth }}
    >
      {inner}
    </aside>
  );
}
