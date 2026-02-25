import { create } from 'zustand';

import type {
  MemoryFiltersAvailable,
  MemoryRuleRecord,
  MemorySummary,
  MemoryTab,
} from '@/types/memory';

/** Filters are keyed by role name (dynamic). */
type MemoryFilters = Record<string, string>;

interface MemoryState {
  // Data management
  data: MemoryRuleRecord[];
  columns: string[];
  rowCount: number;
  fileName: string | null;
  isLoading: boolean;
  error: string | null;
  filtersAvailable: MemoryFiltersAvailable | null;
  summary: MemorySummary | null;

  // UI state
  activeTab: MemoryTab;
  filters: MemoryFilters;
  expandedRuleIds: Set<string>;
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';

  // Agent filter
  selectedAgentName: string;
  availableAgentNames: string[];

  // Graph UI state
  graphSearchQuery: string;
  selectedNodeId: string | null;
  graphFilterType: string; // '' | 'RiskFactor' | 'Rule' | etc.

  // Data actions
  setData: (
    data: MemoryRuleRecord[],
    columns: string[],
    filtersAvailable: MemoryFiltersAvailable,
    summary: MemorySummary,
    fileName?: string
  ) => void;
  clearData: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Rule CRUD actions
  addRule: (rule: MemoryRuleRecord) => void;
  removeRule: (ruleId: string) => void;

  // UI actions
  setActiveTab: (tab: MemoryTab) => void;
  setFilter: (role: string, value: string) => void;
  resetFilters: () => void;
  toggleExpandedRule: (ruleId: string) => void;
  setSort: (column: string) => void;

  // Agent filter actions
  setSelectedAgentName: (name: string) => void;

  // Graph UI actions
  setGraphSearchQuery: (query: string) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  setGraphFilterType: (type: string) => void;
}

export const useMemoryStore = create<MemoryState>()((set) => ({
  // Data management
  data: [],
  columns: [],
  rowCount: 0,
  fileName: null,
  isLoading: false,
  error: null,
  filtersAvailable: null,
  summary: null,

  // UI state
  activeTab: 'rules',
  filters: {},
  expandedRuleIds: new Set<string>(),
  sortColumn: null,
  sortDirection: 'asc',

  // Agent filter
  selectedAgentName: '',
  availableAgentNames: [],

  // Graph UI state
  graphSearchQuery: '',
  selectedNodeId: null,
  graphFilterType: '',

  // Data actions
  setData: (data, columns, filtersAvailable, summary, fileName) => {
    const agents = Array.from(
      new Set(data.map((r) => String(r.agent ?? '')).filter(Boolean))
    ).sort();
    set({
      data,
      columns,
      rowCount: data.length,
      filtersAvailable,
      summary,
      fileName: fileName ?? null,
      isLoading: false,
      error: null,
      availableAgentNames: agents,
      selectedAgentName: '',
    });
  },

  clearData: () =>
    set({
      data: [],
      columns: [],
      rowCount: 0,
      fileName: null,
      filtersAvailable: null,
      summary: null,
      error: null,
      filters: {},
      expandedRuleIds: new Set<string>(),
      selectedAgentName: '',
      availableAgentNames: [],
    }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  // Rule CRUD actions
  addRule: (rule) =>
    set((state) => ({
      data: [rule, ...state.data],
      rowCount: state.data.length + 1,
    })),

  removeRule: (ruleId) =>
    set((state) => {
      const next = new Set(state.expandedRuleIds);
      next.delete(ruleId);
      return {
        data: state.data.filter((r) => r.id !== ruleId),
        rowCount: state.data.length - 1,
        expandedRuleIds: next,
      };
    }),

  // UI actions
  setActiveTab: (tab) => set({ activeTab: tab }),

  setFilter: (role, value) => set((state) => ({ filters: { ...state.filters, [role]: value } })),

  resetFilters: () => set({ filters: {} }),

  toggleExpandedRule: (ruleId) =>
    set((state) => {
      const next = new Set(state.expandedRuleIds);
      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }
      return { expandedRuleIds: next };
    }),

  setSort: (column) =>
    set((state) => ({
      sortColumn: column,
      sortDirection: state.sortColumn === column && state.sortDirection === 'asc' ? 'desc' : 'asc',
    })),

  // Agent filter actions
  setSelectedAgentName: (selectedAgentName) => set({ selectedAgentName }),

  // Graph UI actions
  setGraphSearchQuery: (graphSearchQuery) => set({ graphSearchQuery }),
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  setGraphFilterType: (graphFilterType) => set({ graphFilterType }),
}));
