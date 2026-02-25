import { fetchApi } from '@/lib/api';

import type {
  DatasetListResponse,
  ObservationNodeData,
  RecentTracesResponse,
  ReplayStatusResponse,
  ReviewCreateRequest,
  ReviewResponse,
  StepSummary,
  TraceDetail,
  TraceReviewsResponse,
} from '@/types/replay';

// ============================================
// Agent Replay API
// ============================================

export async function getReplayStatus(): Promise<ReplayStatusResponse> {
  return fetchApi('/api/agent-replay/status');
}

export async function getReplayAgents(): Promise<{ agents: string[] }> {
  return fetchApi('/api/agent-replay/agents');
}

export async function searchTraces(
  query: string,
  agent?: string | null,
  limit?: number,
  daysBack?: number,
  searchBy?: string
): Promise<RecentTracesResponse> {
  const qs = new URLSearchParams();
  qs.append('query', query);
  if (agent) qs.append('agent', agent);
  if (limit) qs.append('limit', String(limit));
  if (daysBack) qs.append('days_back', String(daysBack));
  if (searchBy) qs.append('search_by', searchBy);
  return fetchApi(`/api/agent-replay/search?${qs.toString()}`);
}

export async function getRecentTraces(params?: {
  limit?: number;
  days_back?: number;
  name?: string;
  tags?: string;
  agent?: string | null;
}): Promise<RecentTracesResponse> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.append('limit', String(params.limit));
  if (params?.days_back) qs.append('days_back', String(params.days_back));
  if (params?.name) qs.append('name', params.name);
  if (params?.tags) qs.append('tags', params.tags);
  if (params?.agent) qs.append('agent', params.agent);
  const query = qs.toString();
  return fetchApi(`/api/agent-replay/traces${query ? `?${query}` : ''}`);
}

export async function getTraceDetail(
  traceId: string,
  maxChars?: number,
  agent?: string | null
): Promise<TraceDetail> {
  const qs = new URLSearchParams();
  if (maxChars) qs.append('max_chars', String(maxChars));
  if (agent) qs.append('agent', agent);
  const query = qs.toString();
  return fetchApi(
    `/api/agent-replay/traces/${encodeURIComponent(traceId)}${query ? `?${query}` : ''}`
  );
}

export async function getStepDetail(
  traceId: string,
  index: number,
  agent?: string | null
): Promise<StepSummary> {
  const qs = agent ? `?agent=${encodeURIComponent(agent)}` : '';
  return fetchApi(`/api/agent-replay/traces/${encodeURIComponent(traceId)}/steps/${index}${qs}`);
}

export async function getNodeDetail(
  traceId: string,
  nodeId: string,
  agent?: string | null
): Promise<ObservationNodeData> {
  const qs = agent ? `?agent=${encodeURIComponent(agent)}` : '';
  return fetchApi(
    `/api/agent-replay/traces/${encodeURIComponent(traceId)}/nodes/${encodeURIComponent(nodeId)}${qs}`
  );
}

// ============================================
// Review API
// ============================================

export async function createReview(data: ReviewCreateRequest): Promise<ReviewResponse> {
  return fetchApi('/api/agent-replay/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function getTraceReviews(
  traceId: string,
  agent?: string | null
): Promise<TraceReviewsResponse> {
  const qs = agent ? `?agent=${encodeURIComponent(agent)}` : '';
  return fetchApi(`/api/agent-replay/traces/${encodeURIComponent(traceId)}/reviews${qs}`);
}

export async function listDatasets(agent?: string | null): Promise<DatasetListResponse> {
  const qs = agent ? `?agent=${encodeURIComponent(agent)}` : '';
  return fetchApi(`/api/agent-replay/datasets${qs}`);
}
