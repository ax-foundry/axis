export type MemoryTab = 'rules' | 'quality' | 'hard-stops' | 'batches' | 'knowledge-graph';

/** A rule record — typed `id` plus any role-keyed fields from config. */
export type MemoryRuleRecord = { id: string } & Record<string, unknown>;

export interface MemoryActionCount {
  action: string;
  count: number;
  color: string;
}

export interface MemoryProductCount {
  product: string;
  count: number;
}

export interface MemorySummary {
  rules_count: number;
  risk_factors_count: number;
  mitigants_count: number;
  hard_stops_count: number;
  rules_by_action: MemoryActionCount[];
  rules_by_product: MemoryProductCount[];
}

/** Filter options keyed by role name (e.g. action, product, category). */
export type MemoryFiltersAvailable = Record<string, string[]>;

export interface MemoryRulesResponse {
  data: MemoryRuleRecord[];
  total: number;
  filters_available: MemoryFiltersAvailable;
}

export interface MemoryUploadResponse {
  success: boolean;
  format: string;
  row_count: number;
  columns: string[];
  data: MemoryRuleRecord[];
  filters_available: MemoryFiltersAvailable;
  summary: MemorySummary;
  message?: string;
}

export interface MemoryQualityResponse {
  aligned: MemoryRuleRecord[];
  divergent: MemoryRuleRecord[];
  partial: MemoryRuleRecord[];
}

export interface MemoryBatchInfo {
  batch_id: string;
  rules_count: number;
  created_at: string;
  statuses: Record<string, number>;
  risk_categories: string[];
}

export interface MemoryTraceResponse {
  group_by: string;
  name: string;
  action: string;
  description: string;
  mitigants: string[];
  threshold_value: string;
  threshold_type: string;
}

export interface MemoryConflictInfo {
  risk_factor: string;
  conflicting_rules: Array<{ rule_name: string; action: string }>;
  description: string;
}

export interface MemoryConflictsResponse {
  data: MemoryConflictInfo[];
  has_conflicts: boolean;
}

/** Update/create request — accepts any role-keyed fields. */
export type MemoryRuleUpdateRequest = Record<string, unknown>;

export interface MemoryRuleDeleteResponse {
  success: boolean;
  id: string;
}

/** Memory module configuration from GET /api/memory/config. */
export interface MemoryConfigResponse {
  config_hash: string;
  field_roles: Record<string, string>;
  required_roles: string[];
  labels: Record<string, string>;
  list_fields: string[];
  filter_roles: string[];
  hard_stops: { action_value: string; require_empty_mitigants: boolean };
  quality_values: { aligned: string; divergent: string; partial: string };
  soft_threshold_value: string;
  action_colors: Record<string, string>;
  contradictory_pairs: string[][];
  ui_roles: Record<string, string[]>;
}

// ============================================
// Knowledge Graph Types
// ============================================

export type GraphNodeType = 'RiskFactor' | 'Rule' | 'Outcome' | 'Mitigant' | 'Source';
export type GraphEdgeType = 'TRIGGERS' | 'RESULTS_IN' | 'OVERRIDES' | 'DERIVED_FROM';

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  metadata?: Record<string, string>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: GraphEdgeType;
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  node_counts: Record<string, number>;
  edge_counts: Record<string, number>;
}

export interface GraphSearchResult {
  node_id: string;
  label: string;
  type: string;
  connected_nodes: number;
  snippet: string;
}

export interface GraphSummary {
  total_nodes: number;
  total_edges: number;
  nodes_by_type: Record<string, number>;
  edges_by_relation: Record<string, number>;
  rules_by_action: Record<string, number>;
  rules_by_product: Record<string, number>;
}

export const GraphNodeColors: Record<GraphNodeType, string> = {
  RiskFactor: '#3498DB',
  Rule: '#7F8C8D',
  Outcome: '#E74C3C',
  Mitigant: '#27AE60',
  Source: '#D4AF37',
};

export const GraphNodeSizes: Record<GraphNodeType, number> = {
  RiskFactor: 14,
  Rule: 12,
  Outcome: 10,
  Mitigant: 10,
  Source: 8,
};
