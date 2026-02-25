'use client';

import { Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react';

import { useUIStore } from '@/stores/ui-store';

import type { PlaybackSpeed } from '@/types';

interface PlaybackControlsProps {
  totalSteps: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onGoToStep: (step: number) => void;
}

const speedOptions: PlaybackSpeed[] = [0.5, 1, 1.5, 2];

export function PlaybackControls({
  totalSteps,
  onPlay,
  onPause,
  onStop,
  onStepForward,
  onStepBackward,
  onGoToStep,
}: PlaybackControlsProps) {
  const { learnPlaybackState, learnCurrentStep, learnPlaybackSpeed, setLearnPlaybackSpeed } =
    useUIStore();

  const isPlaying = learnPlaybackState === 'playing';

  return (
    <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">
              Step {learnCurrentStep + 1} of {totalSteps}
            </span>
            <span className="text-text-muted">
              {Math.round(((learnCurrentStep + 1) / totalSteps) * 100)}%
            </span>
          </div>
          <div className="relative">
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isPlaying ? 'progress-bar-animated' : 'bg-primary'
                }`}
                style={{ width: `${((learnCurrentStep + 1) / totalSteps) * 100}%` }}
              />
            </div>
            {/* Step Indicators */}
            <div className="absolute inset-0 flex items-center justify-between px-0.5">
              {Array.from({ length: totalSteps }, (_, i) => (
                <button
                  key={i}
                  onClick={() => onGoToStep(i)}
                  className={`h-3 w-3 rounded-full border-2 transition-all duration-200 ${
                    i <= learnCurrentStep
                      ? 'border-primary bg-primary'
                      : 'border-gray-300 bg-white hover:border-primary'
                  } ${i === learnCurrentStep && isPlaying ? 'step-indicator-active' : ''}`}
                  title={`Go to step ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Main Controls */}
        <div className="flex items-center justify-center gap-2">
          {/* Restart */}
          <button
            onClick={onStop}
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary"
            title="Restart"
          >
            <RotateCcw className="h-5 w-5" />
          </button>

          {/* Step Backward */}
          <button
            onClick={onStepBackward}
            disabled={learnCurrentStep === 0}
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            title="Previous step"
          >
            <SkipBack className="h-5 w-5" />
          </button>

          {/* Play/Pause */}
          <button
            onClick={isPlaying ? onPause : onPlay}
            className="rounded-xl bg-gradient-to-r from-primary to-primary-light p-4 text-white shadow-md shadow-primary/20 transition-all duration-200 hover:shadow-lg hover:shadow-primary/30"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
          </button>

          {/* Step Forward */}
          <button
            onClick={onStepForward}
            disabled={learnCurrentStep === totalSteps - 1}
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            title="Next step"
          >
            <SkipForward className="h-5 w-5" />
          </button>

          {/* Speed Control */}
          <div className="ml-4 flex items-center gap-1 border-l border-border pl-4">
            <span className="mr-1 text-xs text-text-muted">Speed:</span>
            {speedOptions.map((speed) => (
              <button
                key={speed}
                onClick={() => setLearnPlaybackSpeed(speed)}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                  learnPlaybackSpeed === speed
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-text-muted hover:bg-gray-200'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
