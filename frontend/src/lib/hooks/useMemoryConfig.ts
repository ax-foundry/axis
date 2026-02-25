'use client';

import { useQuery } from '@tanstack/react-query';

import * as memoryApi from '@/lib/api/memory-api';

import type { MemoryConfigResponse, MemoryRuleRecord } from '@/types/memory';

/**
 * Fetch and cache the memory module configuration.
 * staleTime: Infinity — config doesn't change during a session.
 */
export function useMemoryConfig() {
  return useQuery<MemoryConfigResponse>({
    queryKey: ['memory-config'],
    queryFn: memoryApi.getMemoryConfig,
    staleTime: Infinity,
  });
}

/** Safe string accessor for a role-keyed field on a record. */
export function getField(record: MemoryRuleRecord, role: string): string {
  const val = record[role];
  if (val == null) return '';
  if (typeof val === 'string') return val;
  return String(val);
}

/** Safe list accessor for a role-keyed list field on a record. */
export function getListField(record: MemoryRuleRecord, role: string): string[] {
  const val = record[role];
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string' && val) return [val];
  return [];
}
