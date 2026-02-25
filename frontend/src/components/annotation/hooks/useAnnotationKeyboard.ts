'use client';

import { useEffect, useCallback } from 'react';

import type { AnnotationScoreMode, AnnotationScoreValue } from '@/types';

interface UseAnnotationKeyboardOptions {
  enabled?: boolean;
  scoreMode: AnnotationScoreMode;
  customScoreRange?: [number, number];
  totalRecords: number;
  currentIndex: number;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  onSetScore: (score: AnnotationScoreValue) => void;
  onSkip: () => void;
  onUndo: () => void;
}

export function useAnnotationKeyboard({
  enabled = true,
  scoreMode,
  customScoreRange = [1, 5],
  totalRecords,
  currentIndex,
  onNavigatePrev,
  onNavigateNext,
  onSetScore,
  onSkip,
  onUndo,
}: UseAnnotationKeyboardOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Ignore if user is typing in an input or textarea
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const key = event.key.toLowerCase();

      // Navigation
      if (key === 'arrowleft' || key === 'j') {
        event.preventDefault();
        onNavigatePrev();
        return;
      }

      if (key === 'arrowright' || key === 'k') {
        event.preventDefault();
        onNavigateNext();
        return;
      }

      // Skip / Flag
      if (key === 's') {
        event.preventDefault();
        onSkip();
        return;
      }

      // Undo (Ctrl+Z or Cmd+Z)
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        onUndo();
        return;
      }

      // Binary scoring
      if (scoreMode === 'binary') {
        if (key === 'a') {
          event.preventDefault();
          onSetScore('accept');
          return;
        }
        if (key === 'r') {
          event.preventDefault();
          onSetScore('reject');
          return;
        }
      }

      // Number scoring (scale-5 or custom)
      if (scoreMode === 'scale-5' || scoreMode === 'custom') {
        const [min, max] = scoreMode === 'scale-5' ? [1, 5] : customScoreRange;
        const num = parseInt(key, 10);
        if (!isNaN(num) && num >= min && num <= max) {
          event.preventDefault();
          onSetScore(num);
          return;
        }
      }

      // Enter to mark as done and go next
      if (key === 'enter') {
        event.preventDefault();
        if (currentIndex < totalRecords - 1) {
          onNavigateNext();
        }
        return;
      }
    },
    [
      enabled,
      scoreMode,
      customScoreRange,
      totalRecords,
      currentIndex,
      onNavigatePrev,
      onNavigateNext,
      onSetScore,
      onSkip,
      onUndo,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export interface KeyboardShortcut {
  key: string;
  description: string;
}

export function getAnnotationShortcuts(
  scoreMode: AnnotationScoreMode,
  customScoreRange?: [number, number]
): KeyboardShortcut[] {
  const shortcuts: KeyboardShortcut[] = [
    { key: '< / j', description: 'Previous record' },
    { key: '> / k', description: 'Next record' },
    { key: 's', description: 'Skip / Flag record' },
    { key: 'Ctrl+Z', description: 'Undo last action' },
    { key: 'Enter', description: 'Go to next' },
  ];

  if (scoreMode === 'binary') {
    shortcuts.unshift({ key: 'a', description: 'Accept' }, { key: 'r', description: 'Reject' });
  } else {
    const [min, max] = scoreMode === 'scale-5' ? [1, 5] : customScoreRange || [1, 5];
    shortcuts.unshift({ key: `${min}-${max}`, description: 'Set score' });
  }

  return shortcuts;
}
