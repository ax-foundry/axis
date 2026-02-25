import { useMutation, useQuery } from '@tanstack/react-query';

import * as memoryApi from '@/lib/api/memory-api';

// ============================================
// Memory Dashboard Hooks
// ============================================

export function useUpdateMemoryRule() {
  return useMutation({
    mutationFn: ({ ruleId, updates }: { ruleId: string; updates: Record<string, unknown> }) =>
      memoryApi.updateMemoryRule(ruleId, updates),
  });
}

export function useCreateMemoryRule() {
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => memoryApi.createMemoryRule(data),
  });
}

export function useDeleteMemoryRule() {
  return useMutation({
    mutationFn: (ruleId: string) => memoryApi.deleteMemoryRule(ruleId),
  });
}

// ============================================
// Knowledge Graph Hooks
// ============================================

export function useMemoryGraph(filters?: {
  risk_factor?: string;
  product_type?: string;
  action?: string;
  node_type?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['memory-graph', filters],
    queryFn: () => memoryApi.getMemoryGraph(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useMemoryGraphSummary() {
  return useQuery({
    queryKey: ['memory-graph-summary'],
    queryFn: memoryApi.getMemoryGraphSummary,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMemoryGraphSearch(query: string) {
  return useQuery({
    queryKey: ['memory-graph-search', query],
    queryFn: () => memoryApi.searchMemoryGraph(query),
    enabled: query.length >= 2,
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useMemoryGraphNeighborhood(nodeId: string | null, depth: number = 1) {
  return useQuery({
    queryKey: ['memory-graph-neighborhood', nodeId, depth],
    queryFn: () => memoryApi.getMemoryGraphNeighborhood(nodeId!, depth),
    enabled: !!nodeId,
    staleTime: 5 * 60 * 1000,
  });
}
