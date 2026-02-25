'use client';

import { SlidersHorizontal, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';

const AVAILABLE_FIELDS = [
  { id: 'additional_input', label: 'Additional Input' },
  { id: 'additional_output', label: 'Additional Output' },
  { id: 'expected_output', label: 'Expected Output' },
  { id: 'conversation', label: 'Conversation' },
  { id: 'retrieved_content', label: 'Retrieved Content' },
] as const;

export function FieldVisibilitySelector() {
  const { compareVisibleFields, toggleCompareVisibleField } = useUIStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeCount = compareVisibleFields.length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all',
          activeCount > 0
            ? 'border-primary/30 bg-primary/5 text-primary'
            : 'border-border bg-white text-text-secondary hover:border-primary hover:text-primary'
        )}
        title="Configure visible fields in detail views"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span>Fields</span>
        {activeCount > 0 && (
          <span className="rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-56 rounded-lg border border-border bg-white py-1 shadow-lg">
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-semibold text-text-primary">Detail View Fields</p>
            <p className="text-xs text-text-muted">Toggle fields shown in expanded rows</p>
          </div>
          {AVAILABLE_FIELDS.map((field) => {
            const isActive = compareVisibleFields.includes(field.id);
            return (
              <button
                key={field.id}
                onClick={() => toggleCompareVisibleField(field.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-50"
              >
                <div
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded border transition-colors',
                    isActive ? 'border-primary bg-primary' : 'border-gray-300 bg-white'
                  )}
                >
                  {isActive && <Check className="h-3 w-3 text-white" />}
                </div>
                <span className={cn('text-sm', isActive ? 'text-text-primary' : 'text-text-muted')}>
                  {field.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
