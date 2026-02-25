'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useMemoryGraphSearch } from '@/lib/hooks/memory-hooks';
import { cn } from '@/lib/utils';
import { useMemoryStore } from '@/stores/memory-store';
import { GraphNodeColors } from '@/types/memory';

import type { GraphNodeType } from '@/types/memory';

export function GraphSearchBar() {
  const { graphSearchQuery, setGraphSearchQuery, setSelectedNodeId } = useMemoryStore();
  const [localQuery, setLocalQuery] = useState(graphSearchQuery);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: searchData } = useMemoryGraphSearch(graphSearchQuery);

  // Debounce the search query
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setGraphSearchQuery(localQuery);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [localQuery, setGraphSearchQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const results = searchData?.results ?? [];
  const showDropdown = isOpen && graphSearchQuery.length >= 2 && results.length > 0;

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder="Search nodes..."
          value={localQuery}
          onChange={(e) => {
            setLocalQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="w-full rounded-lg border border-border bg-white py-2 pl-10 pr-8 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {localQuery && (
          <button
            onClick={() => {
              setLocalQuery('');
              setGraphSearchQuery('');
              setIsOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-white shadow-lg">
          <div className="max-h-64 overflow-y-auto py-1">
            {results.map((result) => (
              <button
                key={result.node_id}
                onClick={() => {
                  setSelectedNodeId(result.node_id);
                  setLocalQuery(result.label);
                  setIsOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50'
                )}
              >
                <span
                  className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{
                    backgroundColor: GraphNodeColors[result.type as GraphNodeType] ?? '#7F8C8D',
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-text-primary">{result.label}</div>
                  <div className="truncate text-xs text-text-muted">{result.snippet}</div>
                </div>
                <span className="flex-shrink-0 text-xs text-text-muted">
                  {result.connected_nodes} conn.
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
