'use client';

import { useMemoryConfig } from '@/lib/hooks/useMemoryConfig';
import { useMemoryStore } from '@/stores/memory-store';

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (val: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-text-muted">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input rounded-lg px-2 py-1.5 text-sm"
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
    </div>
  );
}

export function RuleFilters() {
  const { filters, filtersAvailable, setFilter, resetFilters } = useMemoryStore();
  const { data: config } = useMemoryConfig();

  if (!filtersAvailable) return null;

  const hasActiveFilters = Object.values(filters).some((v) => v !== '');

  // Render filters from config.filter_roles (order = UI order)
  const filterRoles = config?.filter_roles ?? Object.keys(filtersAvailable);

  return (
    <div className="flex flex-wrap items-end gap-3">
      {filterRoles.map((role) => {
        const options = filtersAvailable[role];
        if (!options || options.length === 0) return null;
        const label =
          config?.labels[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        return (
          <FilterSelect
            key={role}
            label={label}
            value={filters[role] ?? ''}
            options={options}
            onChange={(v) => setFilter(role, v)}
          />
        );
      })}
      {hasActiveFilters && (
        <button
          onClick={resetFilters}
          className="rounded-lg px-3 py-1.5 text-sm text-text-muted hover:bg-gray-100 hover:text-text-primary"
        >
          Clear
        </button>
      )}
    </div>
  );
}
