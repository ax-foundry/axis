import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createReview,
  getNodeDetail,
  getRecentTraces,
  getReplayStatus,
  getStepDetail,
  getTraceDetail,
  getTraceReviews,
  listDatasets,
  searchTraces,
} from '@/lib/api/replay-api';

import type { ReviewCreateRequest } from '@/types/replay';

export function useReplayStatus() {
  return useQuery({
    queryKey: ['replay-status'],
    queryFn: getReplayStatus,
    staleTime: Infinity,
    retry: 1,
  });
}

export function useSearchTraces(query: string, agent?: string | null, searchBy?: string) {
  return useQuery({
    queryKey: ['search-traces', query, agent, searchBy],
    queryFn: () => searchTraces(query, agent, undefined, undefined, searchBy),
    enabled: query.trim().length > 0,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useRecentTraces(params?: {
  limit?: number;
  days_back?: number;
  name?: string;
  tags?: string;
  agent?: string | null;
}) {
  return useQuery({
    queryKey: ['recent-traces', params],
    queryFn: () => getRecentTraces(params),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useTraceDetail(traceId: string | null, agent?: string | null) {
  return useQuery({
    queryKey: ['trace-detail', traceId, agent],
    queryFn: () => getTraceDetail(traceId!, undefined, agent),
    enabled: !!traceId,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useStepDetail(
  traceId: string | null,
  stepIndex: number | null,
  agent?: string | null
) {
  return useQuery({
    queryKey: ['step-detail', traceId, stepIndex, agent],
    queryFn: () => getStepDetail(traceId!, stepIndex!, agent),
    enabled: false,
    staleTime: 5 * 60_000,
  });
}

export function useNodeDetail(
  traceId: string | null,
  nodeId: string | null,
  agent?: string | null
) {
  return useQuery({
    queryKey: ['node-detail', traceId, nodeId, agent],
    queryFn: () => getNodeDetail(traceId!, nodeId!, agent),
    enabled: false,
    staleTime: 5 * 60_000,
  });
}

// ---------------------------------------------------------------------------
// Review hooks
// ---------------------------------------------------------------------------

export function useTraceReviews(traceId: string | null, agent?: string | null) {
  return useQuery({
    queryKey: ['trace-reviews', traceId, agent],
    queryFn: () => getTraceReviews(traceId!, agent),
    enabled: !!traceId,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useDatasets(agent?: string | null) {
  return useQuery({
    queryKey: ['datasets', agent],
    queryFn: () => listDatasets(agent),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useSaveReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ReviewCreateRequest) => createReview(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['trace-reviews', variables.trace_id] });
    },
  });
}
