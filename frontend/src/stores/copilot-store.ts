import { create } from 'zustand';

import type { Thought, SkillInfo } from '@/types';

interface CopilotState {
  // Streaming state
  isStreaming: boolean;
  thoughts: Thought[];
  currentThought: Thought | null;
  finalResponse: string | null;
  error: string | null;

  // Skills
  skills: SkillInfo[];
  skillsLoaded: boolean;

  // Session
  sessionId: string | null;

  // Actions
  startStreaming: () => void;
  stopStreaming: () => void;
  addThought: (thought: Thought) => void;
  setFinalResponse: (response: string) => void;
  setError: (error: string | null) => void;
  clearThoughts: () => void;
  reset: () => void;

  // Skills actions
  setSkills: (skills: SkillInfo[]) => void;
  setSkillsLoaded: (loaded: boolean) => void;
}

export const useCopilotStore = create<CopilotState>()((set) => ({
  // Initial state
  isStreaming: false,
  thoughts: [],
  currentThought: null,
  finalResponse: null,
  error: null,
  skills: [],
  skillsLoaded: false,
  sessionId: null,

  // Actions
  startStreaming: () =>
    set({
      isStreaming: true,
      thoughts: [],
      currentThought: null,
      finalResponse: null,
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

  setFinalResponse: (response) =>
    set({
      finalResponse: response,
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
      error: null,
    }),

  // Skills actions
  setSkills: (skills) => set({ skills }),
  setSkillsLoaded: (loaded) => set({ skillsLoaded: loaded }),
}));
