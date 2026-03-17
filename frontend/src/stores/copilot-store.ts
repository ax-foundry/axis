import { create } from 'zustand';

import type { Thought, ToolInfo } from '@/types';

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export type DatasetLabel = 'evaluation' | 'monitoring' | 'human_signals' | 'kpi';

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type CopilotProvider = 'pydantic-ai' | 'oai-agents';

interface CopilotState {
  // Streaming state
  isStreaming: boolean;
  thoughts: Thought[];
  currentThought: Thought | null;
  finalResponse: string | null;
  finalChart: Record<string, unknown> | null;
  finalDownload: { export_sql: string; filename: string; row_count: number } | null;
  error: string | null;

  // Tools
  tools: ToolInfo[];
  toolsLoaded: boolean;

  // Session
  sessionId: string | null;

  // Dataset selection
  selectedDataset: DatasetLabel | null;

  // Conversation history (for multi-turn context)
  conversationHistory: HistoryMessage[];

  // Provider selection
  provider: CopilotProvider;

  // Actions
  startStreaming: () => void;
  stopStreaming: () => void;
  addThought: (thought: Thought) => void;
  setFinalResponse: (
    response: string,
    chart?: Record<string, unknown> | null,
    download?: { export_sql: string; filename: string; row_count: number } | null
  ) => void;
  setError: (error: string | null) => void;
  clearThoughts: () => void;
  reset: () => void;

  // Tools actions
  setTools: (tools: ToolInfo[]) => void;
  setToolsLoaded: (loaded: boolean) => void;

  // Dataset actions
  setSelectedDataset: (dataset: DatasetLabel | null) => void;

  // Provider actions
  setProvider: (provider: CopilotProvider) => void;

  // History actions
  appendToHistory: (message: HistoryMessage) => void;
  clearHistory: () => void;

  // Session actions
  ensureSessionId: () => string;
  startNewChat: () => void;
}

export const useCopilotStore = create<CopilotState>()((set, get) => ({
  // Initial state
  isStreaming: false,
  thoughts: [],
  currentThought: null,
  finalResponse: null,
  finalChart: null,
  finalDownload: null,
  error: null,
  tools: [],
  toolsLoaded: false,
  sessionId: null,
  selectedDataset: null,
  conversationHistory: [],
  provider: 'pydantic-ai',

  // Actions
  startStreaming: () =>
    set({
      isStreaming: true,
      thoughts: [],
      currentThought: null,
      finalResponse: null,
      finalChart: null,
      finalDownload: null,
      error: null,
    }),

  stopStreaming: () =>
    set({
      isStreaming: false,
      currentThought: null,
    }),

  addThought: (thought) =>
    set((state) => ({
      thoughts: [...state.thoughts, thought],
      currentThought: thought,
    })),

  setFinalResponse: (response, chart = null, download = null) =>
    set({
      finalResponse: response,
      finalChart: chart ?? null,
      finalDownload: download ?? null,
      isStreaming: false,
    }),

  setError: (error) =>
    set({
      error,
      isStreaming: false,
    }),

  clearThoughts: () =>
    set({
      thoughts: [],
      currentThought: null,
    }),

  reset: () =>
    set({
      isStreaming: false,
      thoughts: [],
      currentThought: null,
      finalResponse: null,
      finalChart: null,
      finalDownload: null,
      error: null,
    }),

  // Tools actions
  setTools: (tools) => set({ tools }),
  setToolsLoaded: (loaded) => set({ toolsLoaded: loaded }),

  // Dataset actions
  setSelectedDataset: (dataset) => set({ selectedDataset: dataset }),

  // Provider actions
  setProvider: (provider) => set({ provider }),

  // History actions
  appendToHistory: (message) =>
    set((state) => ({
      conversationHistory: [...state.conversationHistory.slice(-19), message],
    })),
  clearHistory: () => set({ conversationHistory: [] }),

  // Session actions
  ensureSessionId: () => {
    const current = get().sessionId;
    if (current) return current;
    const id = newSessionId();
    set({ sessionId: id });
    return id;
  },

  startNewChat: () =>
    set({
      sessionId: newSessionId(),
      conversationHistory: [],
      isStreaming: false,
      thoughts: [],
      currentThought: null,
      finalResponse: null,
      finalChart: null,
      finalDownload: null,
      error: null,
    }),
}));
