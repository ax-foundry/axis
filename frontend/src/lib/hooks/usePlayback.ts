'use client';

import { useEffect, useRef, useCallback } from 'react';

import { useUIStore } from '@/stores/ui-store';

const BASE_INTERVAL = 2000; // 2 seconds per step at 1x speed

export function usePlayback(totalSteps: number) {
  const {
    learnPlaybackState,
    learnCurrentStep,
    learnPlaybackSpeed,
    setLearnPlaybackState,
    setLearnCurrentStep,
    setLearnTotalSteps,
    resetLearnPlayback,
    stepForward,
    stepBackward,
  } = useUIStore();

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update total steps when it changes
  useEffect(() => {
    setLearnTotalSteps(totalSteps);
  }, [totalSteps, setLearnTotalSteps]);

  // Handle playback interval
  useEffect(() => {
    if (learnPlaybackState === 'playing' && totalSteps > 0) {
      const interval = BASE_INTERVAL / learnPlaybackSpeed;

      intervalRef.current = setInterval(() => {
        setLearnCurrentStep(learnCurrentStep >= totalSteps - 1 ? 0 : learnCurrentStep + 1);
      }, interval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [learnPlaybackState, learnPlaybackSpeed, learnCurrentStep, totalSteps, setLearnCurrentStep]);

  const play = useCallback(() => {
    setLearnPlaybackState('playing');
  }, [setLearnPlaybackState]);

  const pause = useCallback(() => {
    setLearnPlaybackState('paused');
  }, [setLearnPlaybackState]);

  const stop = useCallback(() => {
    resetLearnPlayback();
  }, [resetLearnPlayback]);

  const goToStep = useCallback(
    (step: number) => {
      if (step >= 0 && step < totalSteps) {
        setLearnCurrentStep(step);
      }
    },
    [totalSteps, setLearnCurrentStep]
  );

  const togglePlayPause = useCallback(() => {
    if (learnPlaybackState === 'playing') {
      pause();
    } else {
      play();
    }
  }, [learnPlaybackState, play, pause]);

  return {
    isPlaying: learnPlaybackState === 'playing',
    isPaused: learnPlaybackState === 'paused',
    isStopped: learnPlaybackState === 'stopped',
    currentStep: learnCurrentStep,
    totalSteps,
    play,
    pause,
    stop,
    togglePlayPause,
    stepForward,
    stepBackward,
    goToStep,
  };
}
