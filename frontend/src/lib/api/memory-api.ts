import { API_BASE_URL, fetchApi } from '@/lib/api';

import type {
  GraphData,
  GraphEdge,
  GraphNode,
  GraphSearchResult,
  MemoryConfigResponse,
  MemoryRuleDeleteResponse,
  MemoryRuleRecord,
  MemoryRuleUpdateRequest,
  MemoryUploadResponse,
} from '@/types/memory';

// ============================================
// Memory Dashboard API
// ============================================

export async function getMemoryConfig(): Promise<MemoryConfigResponse> {
  return fetchApi('/api/memory/config');
}

export async function updateMemoryRule(
  ruleId: string,
  updates: MemoryRuleUpdateRequest
): Promise<{ success: boolean; data: MemoryRuleRecord }> {
  return fetchApi(`/api/memory/rules/${encodeURIComponent(ruleId)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function uploadMemoryFile(file: File): Promise<MemoryUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/memory/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Memory upload failed');
  }

  return response.json();
}

export async function createMemoryRule(
  data: MemoryRuleUpdateRequest
): Promise<{ success: boolean; data: MemoryRuleRecord }> {
  return fetchApi('/api/memory/rules', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteMemoryRule(ruleId: string): Promise<MemoryRuleDeleteResponse> {
  return fetchApi(`/api/memory/rules/${encodeURIComponent(ruleId)}`, {
    method: 'DELETE',
  });
}

// ============================================
// Knowledge Graph API
// ============================================

export interface GraphResponse {
  success: boolean;
  data: GraphData;
}

export interface GraphSearchResponse {
  success: boolean;
  results: GraphSearchResult[];
  query: string;
  total: number;
}

export interface GraphNeighborhoodResponse {
  success: boolean;
  focal_node: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  depth: number;
}

export interface GraphSummaryResponse {
  success: boolean;
  total_nodes: number;
  total_edges: number;
  nodes_by_type: Record<string, number>;
  edges_by_relation: Record<string, number>;
  rules_by_action: Record<string, number>;
  rules_by_product: Record<string, number>;
}

export async function getMemoryGraph(filters?: {
  risk_factor?: string;
  product_type?: string;
  action?: string;
  node_type?: string;
  limit?: number;
}): Promise<GraphResponse> {
  const params = new URLSearchParams();
  if (filters?.risk_factor) params.append('risk_factor', filters.risk_factor);
  if (filters?.product_type) params.append('product_type', filters.product_type);
  if (filters?.action) params.append('action', filters.action);
  if (filters?.node_type) params.append('node_type', filters.node_type);
  if (filters?.limit) params.append('limit', String(filters.limit));

  const qs = params.toString();
  return fetchApi(`/api/memory/graph${qs ? `?${qs}` : ''}`);
}

export async function getMemoryGraphSummary(): Promise<GraphSummaryResponse> {
  return fetchApi('/api/memory/graph/summary');
}

export async function searchMemoryGraph(query: string): Promise<GraphSearchResponse> {
  return fetchApi(`/api/memory/graph/search?q=${encodeURIComponent(query)}`);
}

export async function getMemoryGraphNeighborhood(
  nodeId: string,
  depth: number = 1
): Promise<GraphNeighborhoodResponse> {
  const params = new URLSearchParams({
    node_id: nodeId,
    depth: String(depth),
  });
  return fetchApi(`/api/memory/graph/neighborhood?${params}`);
}
