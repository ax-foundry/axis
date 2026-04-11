/** Agent Replay type definitions — mirrors backend schemas. */

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface ObservationSummary {
  id: string;
  name: string | null;
  type: string | null;
  model: string | null;
  input: unknown;
  output: unknown;
  input_truncated: boolean;
  output_truncated: boolean;
  metadata: Record<string, unknown> | null;
  usage: TokenUsage | null;
  latency_ms: number | null;
  start_time: string | null;
  end_time: string | null;
  cost: number | null;
}

export interface StepSummary {
  name: string;
  index: number;
  observation_types: string[];
  generation: ObservationSummary | null;
  observations: ObservationSummary[];
  variables: Record<string, string> | null;
}

export interface TraceSummary {
  id: string;
  name: string | null;
  tags: string[];
  timestamp: string | null;
  step_count: number;
  step_names: string[];
}

export interface ObservationNodeData {
  id: string;
  name: string | null;
  type: 'SPAN' | 'GENERATION' | 'LLM' | 'TOOL' | 'EVENT' | 'AGENT' | 'CHAIN' | string | null;
  model: string | null;
  input: unknown;
  output: unknown;
  input_truncated: boolean;
  output_truncated: boolean;
  metadata: Record<string, unknown> | null;
  usage: TokenUsage | null;
  latency_ms: number | null;
  start_time: string | null;
  end_time: string | null;
  cost: number | null;
  depth: number;
  children: ObservationNodeData[];
}

export interface TraceDetail {
  id: string;
  name: string | null;
  tags: string[];
  timestamp: string | null;
  trace_input: unknown;
  trace_output: unknown;
  trace_metadata: Record<string, unknown> | null;
  steps: StepSummary[];
  tree: ObservationNodeData[];
  total_tokens: TokenUsage;
  total_latency_ms: number | null;
  total_cost: number | null;
  schema_version: string;
}

export interface RecentTracesResponse {
  traces: TraceSummary[];
  total: number;
}

export interface SearchFieldOption {
  value: string;
  label: string;
}

export interface ReplayStatusResponse {
  enabled: boolean;
  configured: boolean;
  langfuse_host: string;
  default_limit: number;
  default_days_back: number;
  whatif_enabled: boolean;
  whatif_disabled_agents: string[];
  agents: string[];
  search_fields: SearchFieldOption[];
  agent_search_fields: Record<string, SearchFieldOption[]>;
}

// ---------------------------------------------------------------------------
// Review types
// ---------------------------------------------------------------------------

export type ReviewVerdict = 'positive' | 'negative' | 'neutral';

export interface ReviewCreateRequest {
  trace_id: string;
  agent: string | null;
  agent_label?: string | null;
  verdict: ReviewVerdict;
  failure_observation_id?: string | null;
  failure_observation_name?: string | null;
  tooling_needs?: string;
  rationale?: string;
  expected_output?: string;
  trace_input?: unknown;
  add_to_dataset?: boolean;
  dataset_name?: string | null;
}

export interface ReviewScoreItem {
  id: string;
  name: string;
  value: number | null;
  string_value: string | null;
  comment: string | null;
  observation_id: string | null;
  created_at: string | null;
  source: string | null;
}

export interface ReviewResponse {
  success: boolean;
  trace_id: string;
  scores_created: number;
  dataset_item_created: boolean;
  dataset_name: string | null;
  scores: ReviewScoreItem[];
}

export interface TraceReviewsResponse {
  trace_id: string;
  scores: ReviewScoreItem[];
  datasets: string[];
}

export interface DatasetInfo {
  name: string;
  id: string;
  item_count: number;
  created_at: string | null;
}

export interface DatasetListResponse {
  datasets: DatasetInfo[];
}

// ---------------------------------------------------------------------------
// What-If types
// ---------------------------------------------------------------------------

export interface WhatIfChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
}

export type FieldType = 'text' | 'number' | 'slider' | 'toggle' | 'select' | 'textarea';
export type FieldCategory = 'variable' | 'prompt';

export interface OverridableField {
  key: string;
  label: string;
  field_type: FieldType;
  current_value: unknown;
  min?: number | null;
  max?: number | null;
  step?: number | null;
  options?: string[] | null;
  category: FieldCategory;
}

export interface StepFixture {
  node_id: string;
  name: string | null;
  type: string;
  model: string | null;
  prompt_messages: WhatIfChatMessage[];
  variables: Record<string, string>;
  temperature: number | null;
  max_tokens: number | null;
  original_output: unknown;
  original_usage: TokenUsage | null;
  original_latency_ms: number | null;
  overridable_fields: OverridableField[];
  fixture_hash: string;
}

export interface SimulateRequest {
  fixture_hash: string;
  prompt_messages_override?: WhatIfChatMessage[] | null;
  variable_overrides?: Record<string, string> | null;
}

export interface SimulateResponse {
  original_output: unknown;
  original_model: string | null;
  original_usage: TokenUsage | null;
  original_latency_ms: number | null;
  simulated_output: unknown;
  simulated_model: string | null;
  simulated_usage: TokenUsage | null;
  simulated_latency_ms: number | null;
  output_changed: boolean;
  token_delta: number;
}
