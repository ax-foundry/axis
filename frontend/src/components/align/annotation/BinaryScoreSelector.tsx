'use client';

import { Check, X } from 'lucide-react';

import { cn } from '@/lib/utils';

interface BinaryScoreSelectorProps {
  value?: 0 | 1;
  onChange: (value: 0 | 1) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function BinaryScoreSelector({
  value,
  onChange,
  disabled = false,
  size = 'md',
}: BinaryScoreSelectorProps) {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2 text-base gap-2',
    lg: 'px-6 py-3 text-lg gap-2.5',
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  return (
    <div className="flex gap-3">
      {/* Accept Button */}
      <button
        onClick={() => onChange(1)}
        disabled={disabled}
        className={cn(
          'flex items-center rounded-lg font-medium transition-all',
          sizeClasses[size],
          value === 1
            ? 'shadow-success/30 bg-success text-white shadow-md'
            : 'hover:bg-success/10 bg-gray-100 text-text-secondary hover:text-success',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <Check className={iconSizes[size]} />
        <span>Accept</span>
        <kbd className="ml-1.5 rounded bg-black/10 px-1.5 py-0.5 text-xs font-normal opacity-70">
          A
        </kbd>
      </button>

      {/* Reject Button */}
      <button
        onClick={() => onChange(0)}
        disabled={disabled}
        className={cn(
          'flex items-center rounded-lg font-medium transition-all',
          sizeClasses[size],
          value === 0
            ? 'shadow-error/30 bg-error text-white shadow-md'
            : 'hover:bg-error/10 bg-gray-100 text-text-secondary hover:text-error',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <X className={iconSizes[size]} />
        <span>Reject</span>
        <kbd className="ml-1.5 rounded bg-black/10 px-1.5 py-0.5 text-xs font-normal opacity-70">
          R
        </kbd>
      </button>
    </div>
  );
}
