'use client';

import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  useCreateMemoryRule,
  useDeleteMemoryRule,
  useUpdateMemoryRule,
} from '@/lib/hooks/memory-hooks';
import { useFilteredMemoryData } from '@/lib/hooks/useFilteredMemoryData';
import { getField, getListField, useMemoryConfig } from '@/lib/hooks/useMemoryConfig';
import { cn } from '@/lib/utils';
import { useMemoryStore } from '@/stores/memory-store';

import { DecisionPathDiagram } from './DecisionPathDiagram';
import { RuleFilters } from './RuleFilters';

import type { MemoryRuleRecord } from '@/types/memory';

const RULES_PER_PAGE = 15;

function ActionBadge({ action }: { action: string }) {
  const summary = useMemoryStore((s) => s.summary);
  const color = summary?.rules_by_action.find((a) => a.action === action)?.color || '#7F8C8D';
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {action.replace(/_/g, ' ')}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ingested: '#27AE60',
    pending: '#7F8C8D',
    failed: '#E74C3C',
  };
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: colors[status] || '#7F8C8D' }}
      />
      {status}
    </span>
  );
}

function PaginationControls({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  label,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  label: string;
}) {
  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage * itemsPerPage, totalItems);

  // Show at most 5 page buttons centered around current
  const maxButtons = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  const endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }
  const pages: number[] = [];
  for (let i = startPage; i <= endPage; i++) pages.push(i);

  return (
    <div className="flex items-center justify-between border-t border-border px-1 pt-3">
      <span className="text-xs text-text-muted">
        Showing {start}&ndash;{end} of {totalItems} {label}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={cn(
              'flex h-7 min-w-[28px] items-center justify-center rounded px-1.5 text-xs font-medium transition-colors',
              p === currentPage
                ? 'bg-primary text-white'
                : 'text-text-muted hover:bg-gray-100 hover:text-text-primary'
            )}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** Table columns — driven from config labels, keyed by role. */
const TABLE_COLUMN_ROLES = ['name', 'category', 'action', 'product', 'threshold_type', 'status'];

function RuleCreateForm({ onClose }: { onClose: () => void }) {
  const { mutate: createRule, isPending } = useCreateMemoryRule();
  const { addRule } = useMemoryStore();
  const { data: config } = useMemoryConfig();

  const [form, setForm] = useState<Record<string, unknown>>({
    name: '',
    category: '',
    action: '',
    product: '',
    description: '',
    threshold_value: '',
    threshold_type: '',
    quality: '',
  });

  const lbl = (role: string) =>
    config?.labels[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const handleSave = () => {
    createRule(form, {
      onSuccess: (response) => {
        addRule(response.data as MemoryRuleRecord);
        onClose();
      },
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-primary/20 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
          New Rule
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={handleSave}
            disabled={isPending || !form.name || !form.action}
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            {isPending ? 'Creating...' : 'Create'}
          </button>
          <button
            onClick={onClose}
            disabled={isPending}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-text-muted">
            {lbl('name')} <span className="text-red-500">*</span>
          </span>
          <input
            className="input w-full rounded-lg px-2.5 py-1.5 text-sm"
            value={String(form.name ?? '')}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={`Enter ${lbl('name').toLowerCase()}`}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-text-muted">{lbl('category')}</span>
          <input
            className="input w-full rounded-lg px-2.5 py-1.5 text-sm"
            value={String(form.category ?? '')}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-text-muted">
            {lbl('action')} <span className="text-red-500">*</span>
          </span>
          <input
            className="input w-full rounded-lg px-2.5 py-1.5 text-sm"
            value={String(form.action ?? '')}
            onChange={(e) => setForm({ ...form, action: e.target.value })}
            placeholder={`Enter ${lbl('action').toLowerCase()}`}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-text-muted">{lbl('product')}</span>
          <input
            className="input w-full rounded-lg px-2.5 py-1.5 text-sm"
            value={String(form.product ?? '')}
            onChange={(e) => setForm({ ...form, product: e.target.value })}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-text-muted">{lbl('threshold_value')}</span>
          <input
            className="input w-full rounded-lg px-2.5 py-1.5 text-sm"
            value={String(form.threshold_value ?? '')}
            onChange={(e) => setForm({ ...form, threshold_value: e.target.value })}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-text-muted">{lbl('threshold_type')}</span>
          <input
            className="input w-full rounded-lg px-2.5 py-1.5 text-sm"
            value={String(form.threshold_type ?? '')}
            onChange={(e) => setForm({ ...form, threshold_type: e.target.value })}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-text-muted">{lbl('quality')}</span>
          <input
            className="input w-full rounded-lg px-2.5 py-1.5 text-sm"
            value={String(form.quality ?? '')}
            onChange={(e) => setForm({ ...form, quality: e.target.value })}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-text-muted">{lbl('description')}</span>
        <textarea
          className="input w-full rounded-lg px-2.5 py-1.5 text-sm"
          rows={3}
          value={String(form.description ?? '')}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>
    </div>
  );
}

export function RulesTab() {
  const {
    filtersAvailable,
    filters,
    expandedRuleIds,
    toggleExpandedRule,
    sortColumn,
    sortDirection,
    setSort,
  } = useMemoryStore();
  const data = useFilteredMemoryData();
  const { data: config } = useMemoryConfig();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const sortableColumns = useMemo(() => {
    return TABLE_COLUMN_ROLES.map((role) => ({
      key: role,
      label:
        config?.labels[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    }));
  }, [config]);

  // Apply client-side filters
  const filteredRules = useMemo(() => {
    let result = data;
    for (const [role, value] of Object.entries(filters)) {
      if (value) {
        result = result.filter((r) => String(r[role] ?? '') === value);
      }
    }
    return result;
  }, [data, filters]);

  const sortedRules = useMemo(() => {
    if (!sortColumn) return filteredRules;
    return [...filteredRules].sort((a, b) => {
      const aVal = String(a[sortColumn] ?? '');
      const bVal = String(b[sortColumn] ?? '');
      const cmp = aVal.localeCompare(bVal);
      return sortDirection === 'desc' ? -cmp : cmp;
    });
  }, [filteredRules, sortColumn, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(sortedRules.length / RULES_PER_PAGE);
  const paginatedRules = sortedRules.slice(
    (currentPage - 1) * RULES_PER_PAGE,
    currentPage * RULES_PER_PAGE
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredRules.length]);

  if (!filtersAvailable) return null;

  return (
    <div className="space-y-4">
      <RuleFilters />

      <div className="flex items-center justify-between">
        <div className="text-sm text-text-muted">
          Showing {sortedRules.length} of {data.length} rules
        </div>
        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-dark"
          >
            <Plus className="h-3.5 w-3.5" />
            Add New Rule
          </button>
        )}
      </div>

      {showCreateForm && <RuleCreateForm onClose={() => setShowCreateForm(false)} />}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50/80">
            <tr>
              <th className="w-8 px-3 py-2.5" />
              {sortableColumns.map((col) => (
                <th
                  key={col.key}
                  className="cursor-pointer px-3 py-2.5 font-semibold text-text-secondary hover:text-text-primary"
                  onClick={() => setSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {sortColumn === col.key && (
                      <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRules.map((rule) => {
              const isExpanded = expandedRuleIds.has(rule.id);
              return (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  isExpanded={isExpanded}
                  onToggle={() => toggleExpandedRule(rule.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={sortedRules.length}
        itemsPerPage={RULES_PER_PAGE}
        onPageChange={setCurrentPage}
        label="rules"
      />
    </div>
  );
}

function RuleEditForm({ rule, onClose }: { rule: MemoryRuleRecord; onClose: () => void }) {
  const { mutate: updateRule, isPending } = useUpdateMemoryRule();
  const { data: config } = useMemoryConfig();

  const [form, setForm] = useState<Record<string, unknown>>({
    name: rule.name ?? '',
    category: rule.category ?? '',
    action: rule.action ?? '',
    product: rule.product ?? '',
    description: rule.description ?? '',
    threshold_value: rule.threshold_value ?? '',
    threshold_type: rule.threshold_type ?? '',
    quality: rule.quality ?? '',
  });

  const lbl = (role: string) =>
    config?.labels[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const handleSave = () => {
    updateRule(
      { ruleId: rule.id, updates: form },
      {
        onSuccess: () => onClose(),
      }
    );
  };

  return (
    <div className="space-y-3 rounded-lg border border-primary/20 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
          Update Rule
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            {isPending ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={onClose}
            disabled={isPending}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-text-muted">{lbl('name')}</span>
          <input
            className="input w-full rounded-lg px-2.5 py-1.5 text-sm"
            value={String(form.name ?? '')}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-text-muted">{lbl('category')}</span>
          <input
            className="input w-full rounded-lg px-2.5 py-1.5 text-sm"
            value={String(form.category ?? '')}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-text-muted">{lbl('action')}</span>
          <input
            className="input w-full rounded-lg px-2.5 py-1.5 text-sm"
            value={String(form.action ?? '')}
            onChange={(e) => setForm({ ...form, action: e.target.value })}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-text-muted">{lbl('product')}</span>
          <input
            className="input w-full rounded-lg px-2.5 py-1.5 text-sm"
            value={String(form.product ?? '')}
            onChange={(e) => setForm({ ...form, product: e.target.value })}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-text-muted">{lbl('threshold_value')}</span>
          <input
            className="input w-full rounded-lg px-2.5 py-1.5 text-sm"
            value={String(form.threshold_value ?? '')}
            onChange={(e) => setForm({ ...form, threshold_value: e.target.value })}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-text-muted">{lbl('threshold_type')}</span>
          <input
            className="input w-full rounded-lg px-2.5 py-1.5 text-sm"
            value={String(form.threshold_type ?? '')}
            onChange={(e) => setForm({ ...form, threshold_type: e.target.value })}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-text-muted">{lbl('quality')}</span>
          <input
            className="input w-full rounded-lg px-2.5 py-1.5 text-sm"
            value={String(form.quality ?? '')}
            onChange={(e) => setForm({ ...form, quality: e.target.value })}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-text-muted">{lbl('description')}</span>
        <textarea
          className="input w-full rounded-lg px-2.5 py-1.5 text-sm"
          rows={3}
          value={String(form.description ?? '')}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>
    </div>
  );
}

function DeleteRuleButton({ ruleId }: { ruleId: string }) {
  const { mutate: deleteRule, isPending } = useDeleteMemoryRule();
  const { removeRule } = useMemoryStore();
  const [confirming, setConfirming] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    deleteRule(ruleId, {
      onSuccess: () => removeRule(ruleId),
      onError: () => setConfirming(false),
    });
  };

  return (
    <button
      onClick={handleClick}
      onBlur={() => setConfirming(false)}
      disabled={isPending}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
        confirming
          ? 'border-red-500 bg-red-500 text-white hover:bg-red-600'
          : 'border-red-300 text-red-600 hover:bg-red-50'
      )}
    >
      <Trash2 className="h-3.5 w-3.5" />
      {isPending ? 'Deleting...' : confirming ? 'Confirm?' : 'Delete Rule'}
    </button>
  );
}

function RuleRow({
  rule,
  isExpanded,
  onToggle,
}: {
  rule: MemoryRuleRecord;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const mitigants = getListField(rule, 'mitigants');

  return (
    <>
      <tr
        className={cn(
          'cursor-pointer border-b transition-colors hover:bg-gray-50',
          isExpanded && 'bg-primary/5'
        )}
        onClick={onToggle}
      >
        <td className="px-3 py-2.5">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 text-text-muted" />
          )}
        </td>
        <td className="max-w-xs truncate px-3 py-2.5 font-medium">{getField(rule, 'name')}</td>
        <td className="px-3 py-2.5 text-text-secondary">{getField(rule, 'category')}</td>
        <td className="px-3 py-2.5">
          <ActionBadge action={getField(rule, 'action')} />
        </td>
        <td className="px-3 py-2.5 text-text-secondary">{getField(rule, 'product')}</td>
        <td className="px-3 py-2.5 text-text-secondary">
          {getField(rule, 'threshold_type') || <span className="text-text-muted">-</span>}
        </td>
        <td className="px-3 py-2.5">
          <StatusDot status={getField(rule, 'status')} />
        </td>
      </tr>

      {isExpanded && (
        <tr className="border-b bg-gray-50/50">
          <td colSpan={7} className="px-6 py-4">
            <div className="space-y-3">
              {/* Description */}
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Outcome
                </div>
                <p className="text-sm leading-relaxed text-text-secondary">
                  {getField(rule, 'description')}
                </p>
              </div>

              {/* Metadata row */}
              <div className="flex flex-wrap gap-4 text-xs text-text-muted">
                <span>
                  <strong>Risk Factor:</strong> {getField(rule, 'group_by')}
                </span>
                <span>
                  <strong>Confidence:</strong> {getField(rule, 'confidence')}
                </span>
                {getField(rule, 'quality') && (
                  <span>
                    <strong>Quality:</strong> {getField(rule, 'quality')}
                  </span>
                )}
                {getField(rule, 'compound_trigger') && (
                  <span>
                    <strong>Compound Trigger:</strong> {getField(rule, 'compound_trigger')}
                  </span>
                )}
              </div>

              {/* Mitigants */}
              {mitigants.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Mitigants
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {mitigants.map((m, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs text-green-800"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Decision Path */}
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Decision Path
                </div>
                <DecisionPathDiagram rule={rule} />
              </div>

              {/* Update / Delete Rule */}
              {editing ? (
                <RuleEditForm rule={rule} onClose={() => setEditing(false)} />
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(true);
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Update Rule
                  </button>
                  <DeleteRuleButton ruleId={rule.id} />
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
