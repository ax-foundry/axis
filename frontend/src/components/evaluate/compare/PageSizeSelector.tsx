'use client';

import { ChevronDown } from 'lucide-react';

import { useUIStore } from '@/stores';

const PAGE_SIZES = [10, 25, 50, 100, 500] as const;

export function PageSizeSelector() {
  const { comparePageSize, setComparePageSize } = useUIStore();

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-text-muted">Rows:</span>
      <div className="relative">
        <select
          value={comparePageSize}
          onChange={(e) => setComparePageSize(Number(e.target.value))}
          className="cursor-pointer appearance-none rounded-lg border border-border bg-white px-3 py-1.5 pr-8 text-sm font-medium text-text-primary hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
      </div>
    </div>
  );
}
