'use client';

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Code2,
  Info,
  Loader2,
  Search,
  Table as TableIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import * as api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useDatabaseStore } from '@/stores/database-store';

import type { TableInfo } from '@/stores/database-store';

function formatRowCount(count: number): string {
  if (count < 0) return '~0';
  if (count < 1000) return `~${count}`;
  if (count < 1000000) return `~${(count / 1000).toFixed(1)}K`;
  return `~${(count / 1000000).toFixed(1)}M`;
}

export function DataSelector() {
  const {
    handle,
    tables,
    setTables,
    selectedTable,
    setSelectedTable,
    tableSearchQuery,
    setTableSearchQuery,
    dataSelectMode,
    setDataSelectMode,
    sqlQuery,
    setSqlQuery,
    configuredTables,
    configuredFilters,
    configuredQuery,
    activeFilters,
    setFilterValue,
    setFilterDistinctValues,
    goBack,
    setStep,
    isLoading,
    setLoading,
    error,
    setError,
  } = useDatabaseStore();

  const [loadingFilters, setLoadingFilters] = useState(false);

  // Load tables on mount
  useEffect(() => {
    async function loadTables() {
      if (!handle || tables.length > 0) return;

      setLoading(true);
      setError(null);

      try {
        const response = await api.databaseListTables(handle);
        if (response.success) {
          setTables(response.tables);
        } else {
          setError('Failed to load tables');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tables');
      }

      setLoading(false);
    }

    loadTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  // Filter tables by search query + config restrictions
  const filteredTables = useMemo(() => {
    let result: TableInfo[] = tables;

    // Restrict to configured tables if set
    if (configuredTables.length > 0) {
      result = result.filter((t) => {
        const fullName = `${t.schema_name}.${t.name}`;
        return configuredTables.some(
          (ct) =>
            ct === fullName ||
            ct === t.name ||
            ct.toLowerCase() === fullName.toLowerCase() ||
            ct.toLowerCase() === t.name.toLowerCase()
        );
      });
    }

    // Apply search filter
    if (tableSearchQuery.trim()) {
      const query = tableSearchQuery.toLowerCase();
      result = result.filter(
        (t) => t.name.toLowerCase().includes(query) || t.schema_name.toLowerCase().includes(query)
      );
    }

    return result;
  }, [tables, configuredTables, tableSearchQuery]);

  // Handle table selection — fetch distinct values for configured filters
  const handleSelectTable = useCallback(
    async (table: TableInfo) => {
      if (!handle) return;

      const tableId = { schema_name: table.schema_name, name: table.name };
      setSelectedTable(tableId);

      // Fetch distinct values for all configured filters in parallel
      if (configuredFilters.length > 0) {
        setLoadingFilters(true);
        try {
          const promises = configuredFilters.map((f) =>
            api
              .databaseGetDistinctValues(handle, tableId, f.column, 100)
              .then((resp) => ({ column: f.column, values: resp.success ? resp.values : [] }))
              .catch(() => ({ column: f.column, values: [] as string[] }))
          );
          const results = await Promise.all(promises);
          for (const { column, values } of results) {
            setFilterDistinctValues(column, values);
          }
        } catch {
          // Ignore errors — filters just won't have options
        }
        setLoadingFilters(false);
      }
    },
    [handle, configuredFilters, setSelectedTable, setFilterDistinctValues]
  );

  // Continue to preview
  const handleContinue = () => {
    if (dataSelectMode === 'table' && !selectedTable) {
      setError('Please select a table');
      return;
    }
    if (dataSelectMode === 'query' && !sqlQuery.trim()) {
      setError('Please enter a SQL query');
      return;
    }
    setError(null);
    setStep('preview');
  };

  // Filters with distinct values available
  const visibleFilters = activeFilters.filter((f) => f.distinctValues.length > 0);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={goBack}
          disabled={isLoading}
          className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h3 className="font-medium text-text-primary">Select Data</h3>
          <p className="text-sm text-text-muted">Choose a table or write a SQL query</p>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setDataSelectMode('table')}
          disabled={isLoading}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors',
            dataSelectMode === 'table'
              ? 'border-violet-300 bg-violet-50 text-violet-700'
              : 'border-border bg-white text-text-secondary hover:border-violet-200 hover:bg-violet-50/50'
          )}
        >
          <TableIcon className="h-4 w-4" />
          Table
        </button>
        <button
          type="button"
          onClick={() => setDataSelectMode('query')}
          disabled={isLoading}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors',
            dataSelectMode === 'query'
              ? 'border-violet-300 bg-violet-50 text-violet-700'
              : 'border-border bg-white text-text-secondary hover:border-violet-200 hover:bg-violet-50/50'
          )}
        >
          <Code2 className="h-4 w-4" />
          SQL Query
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="border-error/20 bg-error/5 mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm text-error">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Table Mode */}
      {dataSelectMode === 'table' && (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={tableSearchQuery}
              onChange={(e) => setTableSearchQuery(e.target.value)}
              placeholder="Search tables..."
              className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              disabled={isLoading}
            />
          </div>

          {/* Filter Dropdowns */}
          {visibleFilters.length > 0 && (
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {visibleFilters.map((filter) => (
                <div key={filter.column}>
                  <label className="mb-1 block text-xs font-medium text-text-muted">
                    {filter.label}
                  </label>
                  <div className="relative">
                    <select
                      value={filter.value || ''}
                      onChange={(e) => setFilterValue(filter.column, e.target.value || null)}
                      className="w-full appearance-none rounded-lg border border-border bg-white px-3 py-1.5 pr-8 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      disabled={loadingFilters}
                    >
                      <option value="">All</option>
                      {filter.distinctValues.map((val) => (
                        <option key={val} value={val}>
                          {val}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Loading tables */}
          {isLoading && tables.length === 0 && (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                <p className="mt-2 text-sm text-text-muted">Loading tables...</p>
              </div>
            </div>
          )}

          {/* Table List */}
          {(!isLoading || tables.length > 0) && (
            <div className="flex-1 overflow-y-auto">
              {filteredTables.length === 0 ? (
                <div className="py-8 text-center text-sm text-text-muted">
                  {tableSearchQuery ? 'No tables match your search' : 'No tables found'}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredTables.map((table) => {
                    const isSelected =
                      selectedTable?.schema_name === table.schema_name &&
                      selectedTable?.name === table.name;
                    return (
                      <button
                        key={`${table.schema_name}.${table.name}`}
                        onClick={() => handleSelectTable(table)}
                        disabled={isLoading}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all',
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-transparent hover:border-border hover:bg-gray-50',
                          isLoading && 'cursor-wait opacity-70'
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-lg',
                            isSelected
                              ? 'bg-primary/10 text-primary'
                              : 'bg-gray-100 text-text-muted'
                          )}
                        >
                          <TableIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-text-primary">
                              {table.name}
                            </span>
                            <span className="shrink-0 text-xs text-text-muted">
                              {table.schema_name}
                            </span>
                          </div>
                          <span className="text-xs text-text-muted">
                            {formatRowCount(table.row_count_estimate)} rows
                          </span>
                        </div>
                        {loadingFilters && isSelected && (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SQL Query Mode */}
      {dataSelectMode === 'query' && (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Info callout */}
          <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <div className="flex gap-2 text-sm text-blue-800">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
              <span>
                Only <strong>SELECT</strong> queries are allowed. For best security, use a read-only
                database role.
              </span>
            </div>
          </div>

          {/* SQL Textarea */}
          <div className="flex-1">
            <textarea
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              placeholder={
                configuredQuery
                  ? ''
                  : "SELECT * FROM public.evaluations WHERE created_at > now() - interval '7 days'"
              }
              className="h-full w-full resize-none rounded-lg border border-border bg-white p-3 font-mono text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              disabled={isLoading}
            />
          </div>
        </div>
      )}

      {/* Continue Button */}
      <div className="mt-4 border-t border-border pt-4">
        <button
          onClick={handleContinue}
          disabled={
            isLoading ||
            loadingFilters ||
            (dataSelectMode === 'table' && !selectedTable) ||
            (dataSelectMode === 'query' && !sqlQuery.trim())
          }
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-medium text-white transition-all',
            'bg-gradient-to-r from-violet-500 to-violet-600 shadow-lg shadow-violet-500/25',
            'hover:shadow-xl hover:shadow-violet-500/30',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <ArrowRight className="h-4 w-4" />
          Continue to Preview
        </button>
      </div>
    </div>
  );
}
