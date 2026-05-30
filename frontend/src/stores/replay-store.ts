import { create } from 'zustand';

import type { ReviewVerdict, WhatIfChatMessage } from '@/types/replay';

const INITIAL_REVIEW_STATE = {
  reviewPanelOpen: false,
  reviewVerdict: null as ReviewVerdict | null,
  reviewFailureNodeId: null as string | null,
  reviewToolingNeeds: '',
  reviewRationale: '',
  reviewExpectedOutput: '',
  reviewAddToDataset: false,
  reviewDatasetName: '',
};

interface WhatIfState {
  active: boolean;
  nodeId: string | null;
  fixtureHash: string | null;
  overrides: Record<string, unknown>;
  promptMessagesOverride: WhatIfChatMessage[] | null;
}

const INITIAL_WHATIF_STATE: WhatIfState = {
  active: false,
  nodeId: null,
  fixtureHash: null,
  overrides: {},
  promptMessagesOverride: null,
};

interface ReplayState {
  traceId: string | null;
  sessionId: string | null;
  selectedNodeId: string | null;
  expandedNodeIds: Record<string, boolean>;
  isPickerOpen: boolean;
  sidebarCollapsed: boolean;
  selectedAgent: string | null;
  availableAgents: string[];

  // Review panel
  reviewPanelOpen: boolean;
  reviewVerdict: ReviewVerdict | null;
  reviewFailureNodeId: string | null;
  reviewToolingNeeds: string;
  reviewRationale: string;
  reviewExpectedOutput: string;
  reviewAddToDataset: boolean;
  reviewDatasetName: string;

  // What-If state
  whatIf: WhatIfState;

  setTraceId: (id: string | null) => void;
  setSessionId: (id: string | null) => void;
  backToConversation: () => void;
  setSelectedNodeId: (id: string | null) => void;
  toggleNodeExpanded: (id: string) => void;
  setExpandedNodeIds: (ids: Record<string, boolean>) => void;
  expandAll: (allIds: string[]) => void;
  collapseAll: () => void;
  togglePicker: () => void;
  toggleSidebar: () => void;
  setSelectedAgent: (name: string | null) => void;
  setAvailableAgents: (names: string[]) => void;
  reset: () => void;

  // Review actions
  toggleReviewPanel: () => void;
  setReviewVerdict: (v: ReviewVerdict | null) => void;
  setReviewFailureNodeId: (id: string | null) => void;
  setReviewToolingNeeds: (v: string) => void;
  setReviewRationale: (v: string) => void;
  setReviewExpectedOutput: (v: string) => void;
  setReviewAddToDataset: (v: boolean) => void;
  setReviewDatasetName: (v: string) => void;
  resetReviewForm: () => void;

  // What-If actions
  enterWhatIf: (nodeId: string) => void;
  exitWhatIf: () => void;
  setWhatIfFixtureHash: (hash: string) => void;
  setWhatIfOverride: (key: string, value: unknown) => void;
  resetWhatIfOverrides: () => void;
  setWhatIfPromptMessages: (msgs: WhatIfChatMessage[] | null) => void;
}

export const useReplayStore = create<ReplayState>()((set) => ({
  traceId: null,
  sessionId: null,
  selectedNodeId: null,
  expandedNodeIds: {},
  isPickerOpen: true,
  sidebarCollapsed: false,
  selectedAgent: null,
  availableAgents: [],
  ...INITIAL_REVIEW_STATE,
  whatIf: { ...INITIAL_WHATIF_STATE },

  setTraceId: (id) =>
    set({
      traceId: id,
      selectedNodeId: null,
      expandedNodeIds: {},
      isPickerOpen: !id,
      ...INITIAL_REVIEW_STATE,
      whatIf: { ...INITIAL_WHATIF_STATE },
    }),

  setSessionId: (id) =>
    set({
      sessionId: id,
      traceId: null,
      selectedNodeId: null,
      expandedNodeIds: {},
      isPickerOpen: !id,
      ...INITIAL_REVIEW_STATE,
      whatIf: { ...INITIAL_WHATIF_STATE },
    }),

  backToConversation: () =>
    set({
      traceId: null,
      selectedNodeId: null,
      expandedNodeIds: {},
      ...INITIAL_REVIEW_STATE,
      whatIf: { ...INITIAL_WHATIF_STATE },
    }),

  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  toggleNodeExpanded: (id) =>
    set((s) => ({
      expandedNodeIds: { ...s.expandedNodeIds, [id]: !s.expandedNodeIds[id] },
    })),

  setExpandedNodeIds: (ids) => set({ expandedNodeIds: ids }),

  expandAll: (allIds) =>
    set({
      expandedNodeIds: Object.fromEntries(allIds.map((id) => [id, true])),
    }),

  collapseAll: () => set({ expandedNodeIds: {} }),

  togglePicker: () => set((s) => ({ isPickerOpen: !s.isPickerOpen })),

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  setSelectedAgent: (name) =>
    set({
      selectedAgent: name,
      sessionId: null,
      traceId: null,
      selectedNodeId: null,
      expandedNodeIds: {},
      ...INITIAL_REVIEW_STATE,
      whatIf: { ...INITIAL_WHATIF_STATE },
    }),

  setAvailableAgents: (names) => set({ availableAgents: names }),

  reset: () =>
    set({
      sessionId: null,
      traceId: null,
      selectedNodeId: null,
      expandedNodeIds: {},
      isPickerOpen: true,
      ...INITIAL_REVIEW_STATE,
      whatIf: { ...INITIAL_WHATIF_STATE },
    }),

  // Review actions
  toggleReviewPanel: () => set((s) => ({ reviewPanelOpen: !s.reviewPanelOpen })),
  setReviewVerdict: (v) => set({ reviewVerdict: v }),
  setReviewFailureNodeId: (id) => set({ reviewFailureNodeId: id }),
  setReviewToolingNeeds: (v) => set({ reviewToolingNeeds: v }),
  setReviewRationale: (v) => set({ reviewRationale: v }),
  setReviewExpectedOutput: (v) => set({ reviewExpectedOutput: v }),
  setReviewAddToDataset: (v) => set({ reviewAddToDataset: v }),
  setReviewDatasetName: (v) => set({ reviewDatasetName: v }),
  resetReviewForm: () => set(INITIAL_REVIEW_STATE),

  // What-If actions
  enterWhatIf: (nodeId) =>
    set({
      whatIf: { ...INITIAL_WHATIF_STATE, active: true, nodeId },
      reviewPanelOpen: false,
    }),

  exitWhatIf: () => set({ whatIf: { ...INITIAL_WHATIF_STATE } }),

  setWhatIfFixtureHash: (hash) => set((s) => ({ whatIf: { ...s.whatIf, fixtureHash: hash } })),

  setWhatIfOverride: (key, value) =>
    set((s) => ({
      whatIf: { ...s.whatIf, overrides: { ...s.whatIf.overrides, [key]: value } },
    })),

  resetWhatIfOverrides: () =>
    set((s) => ({
      whatIf: {
        ...s.whatIf,
        overrides: {},
        promptMessagesOverride: null,
      },
    })),

  setWhatIfPromptMessages: (msgs) =>
    set((s) => ({ whatIf: { ...s.whatIf, promptMessagesOverride: msgs } })),
}));
