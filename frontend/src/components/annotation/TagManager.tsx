'use client';

import { X, Plus, RotateCcw, Settings2 } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';
import { TAG_PRESETS, type TagPreset } from '@/types';

const POSITIVE_TAGS = new Set(['Excellent', 'Cool', 'Correct', 'Positive']);

interface TagSelectorProps {
  availableTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  className?: string;
}

export function TagSelector({
  availableTags,
  selectedTags,
  onToggleTag,
  className,
}: TagSelectorProps) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {availableTags.map((tag) => {
        const isSelected = selectedTags.includes(tag);
        const isPositive = POSITIVE_TAGS.has(tag);

        return (
          <button
            key={tag}
            onClick={() => onToggleTag(tag)}
            className={cn(
              'rounded-full border px-3 py-1 text-[11px] font-medium transition-all',
              isSelected
                ? isPositive
                  ? 'bg-success/10 border-success font-semibold text-success'
                  : 'bg-error/10 border-error font-semibold text-error'
                : 'border-border bg-white text-text-secondary hover:border-text-muted hover:bg-gray-50'
            )}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}

interface TagManagerProps {
  tags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onResetToDefault: () => void;
  onApplyPreset: (preset: TagPreset) => void;
  className?: string;
}

export function TagManager({
  tags,
  onAddTag,
  onRemoveTag,
  onResetToDefault,
  onApplyPreset,
  className,
}: TagManagerProps) {
  const [newTag, setNewTag] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const handleAddTag = () => {
    const trimmed = newTag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onAddTag(trimmed);
      setNewTag('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn-secondary flex items-center gap-2 text-sm"
      >
        <Settings2 className="h-4 w-4" />
        Manage Tags
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="font-semibold text-text-primary">Manage Tags</h4>
              <button
                onClick={() => setIsOpen(false)}
                className="text-text-muted hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Presets */}
            <div className="mb-4">
              <label className="mb-2 block text-xs font-medium text-text-muted">Apply Preset</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(TAG_PRESETS) as TagPreset[]).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => onApplyPreset(preset)}
                    className="rounded-md bg-gray-100 px-2.5 py-1 text-xs capitalize text-text-secondary hover:bg-gray-200"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Add new tag */}
            <div className="mb-4">
              <label className="mb-2 block text-xs font-medium text-text-muted">
                Add Custom Tag
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter tag name..."
                  className="flex-1 rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  onClick={handleAddTag}
                  disabled={!newTag.trim()}
                  className="rounded-md bg-primary p-1.5 text-white disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Current tags */}
            <div className="mb-4">
              <label className="mb-2 block text-xs font-medium text-text-muted">
                Current Tags ({tags.length})
              </label>
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs text-text-secondary"
                  >
                    {tag}
                    <button onClick={() => onRemoveTag(tag)} className="hover:text-error">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Reset button */}
            <button
              onClick={onResetToDefault}
              className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary"
            >
              <RotateCcw className="h-4 w-4" />
              Reset to Default
            </button>
          </div>
        </>
      )}
    </div>
  );
}
