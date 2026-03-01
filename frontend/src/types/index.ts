export const Columns = {
  // Identifiers
  DATASET_ID: 'dataset_id',
  METRIC_ID: 'metric_id',
  RUN_ID: 'run_id',

  // Core evaluation fields
  EXPERIMENT_NAME: 'evaluation_name',
  QUERY: 'query',
  ACTUAL_OUTPUT: 'actual_output',
  EXPECTED_OUTPUT: 'expected_output',
  CONVERSATION: 'conversation',
  RETRIEVED_CONTENT: 'retrieved_content',
  ADDITIONAL_INPUT: 'additional_input',
  ACCEPTANCE_CRITERIA: 'acceptance_criteria',

  // Reference fields
  DOCUMENT_TEXT: 'document_text',
  ACTUAL_REFERENCE: 'actual_reference',
  EXPECTED_REFERENCE: 'expected_reference',

  // Metric fields
  METRIC_NAME: 'metric_name',
  METRIC_SCORE: 'metric_score',
  METRIC_TYPE: 'metric_type',
  METRIC_CATEGORY: 'metric_category',
  WEIGHT: 'weight',
  PARENT: 'parent',

  // Result fields
  JUDGMENT: 'judgment',
  PASSED: 'passed',
  THRESHOLD: 'threshold',
  EXPLANATION: 'explanation',
  SIGNALS: 'signals',
  CRITIQUE: 'critique',
  ADDITIONAL_OUTPUT: 'additional_output',

  // Observability fields
  TRACE: 'trace',
  TRACE_ID: 'trace_id',
  OBSERVATION_ID: 'observation_id',
  LATENCY: 'Latency',
  COST_ESTIMATE: 'cost_estimate',

  // Metadata fields
  SOURCE: 'source',
  METADATA: 'data_metadata',
  EXPERIMENT_METADATA: 'evaluation_metadata',
  DATASET_METADATA: 'dataset_metadata',
  METRIC_METADATA: 'metric_metadata',
  USER_TAGS: 'user_tags',

  // Configuration fields
  MODEL_NAME: 'model_name',
  LLM_PROVIDER: 'llm_provider',

  // Status fields
  HAS_ERRORS: 'has_errors',
  VERSION: 'version',
  TIMESTAMP: 'timestamp',

  // Annotation columns
  ANNOTATION_FLAGGED: 'annotation_flagged',
} as const;

// Data format types - matches backend format strings
export type DataFormat =
  | 'eval_runner'
  | 'tree_format'
  | 'flat_format'
  | 'simple_judgment'
  | 'fresh_annotation'
  | 'unknown';

// Base evaluation record
export interface EvaluationRecord {
  [Columns.DATASET_ID]: string;
  [Columns.QUERY]: string;
  [Columns.ACTUAL_OUTPUT]: string;
  [Columns.EXPECTED_OUTPUT]?: string;
  [Columns.EXPERIMENT_NAME]?: string;
  [Columns.CONVERSATION]?: string;
  [Columns.RETRIEVED_CONTENT]?: string;
  [Columns.EXPERIMENT_METADATA]?: Record<string, unknown>;
  [Columns.ADDITIONAL_INPUT]?: string;
  [Columns.METADATA]?: Record<string, unknown>;
  [key: string]: unknown;
}

// Tree format specific
export interface TreeMetric {
  [Columns.DATASET_ID]: string;
  [Columns.METRIC_NAME]: string;
  [Columns.METRIC_SCORE]: number;
  [Columns.WEIGHT]: number;
  [Columns.METRIC_TYPE]: string;
  [Columns.PARENT]: string | null;
  [Columns.EXPLANATION]?: string;
  [Columns.SIGNALS]?: string[];
}

// Flat scores format
export interface FlatScore {
  [Columns.DATASET_ID]: string;
  [Columns.METRIC_NAME]: string;
  [Columns.METRIC_SCORE]: number;
  [Columns.EXPLANATION]?: string;
}

// ============================================
// Annotation Types
// ============================================

// Score mode types for annotation
export type AnnotationScoreMode = 'binary' | 'scale-5' | 'custom';
export type AnnotationScoreValue = number | 'accept' | 'reject';

// Filter types for annotation list
export type AnnotationFilter = 'all' | 'pending' | 'done' | 'flagged';

// Default tag presets
export const DEFAULT_ANNOTATION_TAGS = [
  'Hallucination',
  'Factual Error',
  'Poor Tone',
  'Incomplete',
  'Off-Topic',
  'Excellent',
] as const;

export const TAG_PRESETS = {
  quality: ['Hallucination', 'Factual Error', 'Poor Tone', 'Incomplete', 'Off-Topic', 'Excellent'],
  sentiment: ['Positive', 'Neutral', 'Negative'],
  accuracy: ['Correct', 'Partially Correct', 'Incorrect', 'Needs Review'],
} as const;

export type TagPreset = keyof typeof TAG_PRESETS;

// Annotation configuration stored in UI store
export interface AnnotationConfig {
  idColumn: string | null;
  displayColumns: string[];
  scoreMode: AnnotationScoreMode;
  customScoreRange: [number, number];
  customTags: string[];
  filter: AnnotationFilter;
  showShortcuts: boolean;
}

// Enhanced Annotation interface for data store
export interface AnnotationData {
  score?: AnnotationScoreValue;
  tags: string[];
  critique: string;
  flagged?: boolean;
  annotatedAt?: string;
}

// Undo action for annotation history
export interface AnnotationUndoAction {
  type: 'update' | 'delete';
  id: string;
  previousState: AnnotationData | null;
  timestamp: string;
}

// Legacy tag type for backwards compatibility
export type AnnotationTag =
  | 'Hallucination'
  | 'Factual Error'
  | 'Poor Tone'
  | 'Incomplete'
  | 'Off-Topic'
  | 'Excellent';

// Legacy Annotation interface (kept for backwards compatibility)
export interface Annotation {
  id: string;
  recordId: string;
  score?: number;
  tags?: AnnotationTag[];
  critique?: string;
  annotatedAt: string;
  annotatedBy?: string;
}

// Analytics types
export interface MetricSummary {
  metricName: string;
  mean: number;
  std: number;
  count: number;
  min: number;
  max: number;
  passingRate: number;
}

export interface AnalyticsData {
  metrics: MetricSummary[];
  records: EvaluationRecord[];
  format: DataFormat;
}

// KPI Overview types
export interface KPIData {
  averageScore: number;
  passRate: number;
  testCaseCount: number;
  variance: number;
}

// Comparison types
export interface ExperimentMetrics {
  experimentName: string;
  metrics: Record<string, number>;
  testCaseCount: number;
}

export interface ComparisonRow {
  id: string;
  query: string;
  actualOutput: string;
  expectedOutput?: string;
  experimentName?: string;
  additionalInput?: string;
  additionalOutput?: string;
  conversation?: string;
  retrievedContent?: string;
  metrics: Record<string, number>;
  overallScore: number;
  metadata?: Record<string, unknown>;
}

// Fields that can be toggled visible in the Compare detail views
export type CompareDetailField =
  | 'additional_input'
  | 'additional_output'
  | 'expected_output'
  | 'conversation'
  | 'retrieved_content';

export interface WinnerInfo {
  experimentName: string;
  score: number;
  improvement: number;
  metricName: string;
}

export interface ExperimentPerformanceSummary {
  experimentName: string;
  testCaseCount: number;
  averageScore: number;
  metrics: Record<string, { mean: number; std: number }>;
}

export interface TestCaseDetail {
  id: string;
  query: string;
  actualOutput: string;
  expectedOutput?: string;
  conversation?: string;
  retrievedContent?: string;
  experimentName?: string;
  metrics: Record<string, number>;
  explanations?: Record<string, string>;
}

// Correlation matrix types
export interface CorrelationMatrix {
  metrics: string[];
  values: number[][];
}

// Simulation types
export interface Persona {
  id: string;
  name: string;
  description: string;
  traits: string[];
}

export interface SimulationConfig {
  personas: Persona[];
  conversationCount: number;
  agentEndpoint?: string;
}

export interface SimulationResult {
  id: string;
  persona: Persona;
  conversation: string;
  metrics?: Record<string, number>;
}

// Calibration types
export interface CalibrationResult {
  cohensKappa: number;
  agreement: number;
  correlation: number;
  confusionMatrix: number[][];
}

// ============================================
// Align Evals Types
// ============================================

export type AlignStep = 'upload' | 'review' | 'build';

// Annotation with optional notes for Truesight feature
export interface AnnotationWithNotes {
  score: 0 | 1;
  notes?: string;
  timestamp?: string;
}

// Clustering method for pattern discovery
export type ClusteringMethod = 'llm' | 'bertopic' | 'hybrid';

// AI-clustered error patterns from annotation notes
export interface ErrorPattern {
  category: string; // AI-generated category name
  count: number; // How many records match
  examples: string[]; // Sample notes
  record_ids: string[]; // Records in this category (matches backend naming)
}

// Distilled learning artifact from EvidencePipeline
export interface LearningArtifact {
  title: string;
  content: string;
  tags: string[];
  confidence: number;
  supporting_item_ids: string[];
  recommended_actions: string[];
  counterexamples: string[];
  scope: string | null;
  when_not_to_apply: string | null;
}

// Metadata from EvidencePipeline run
export interface PipelineMetadata {
  filtered_count: number;
  deduplicated_count: number;
  validation_repairs: number;
  total_analyzed: number;
  clustering_method: string | null;
}

export type LLMProvider = 'openai' | 'anthropic';

export interface FewShotExample {
  query: string;
  actual_output: string;
  expected_output?: string;
  score: 0 | 1;
  reasoning: string;
}

export interface JudgeConfig {
  model: string;
  provider: LLMProvider;
  system_prompt: string;
  evaluation_criteria: string;
  few_shot_examples: FewShotExample[];
  temperature: number;
  name?: string;
}

export interface AlignmentMetrics {
  cohens_kappa: number;
  f1_score: number;
  precision: number;
  recall: number;
  specificity: number;
  accuracy: number;
  confusion_matrix: number[][];
  total_samples: number;
  agreement_count: number;
}

export interface AlignmentResult {
  record_id: string;
  query: string;
  actual_output: string;
  expected_output?: string;
  human_score: 0 | 1;
  llm_score: 0 | 1;
  llm_reasoning: string;
  is_aligned: boolean;
}

export interface MisalignmentPattern {
  pattern_type: string;
  description: string;
  count: number;
  examples: string[];
}

export interface MisalignmentAnalysis {
  total_misaligned: number;
  false_positives: number;
  false_negatives: number;
  patterns: MisalignmentPattern[];
  summary: string;
  recommendations: string[];
}

export interface PromptSuggestion {
  aspect: string;
  suggestion: string;
  rationale: string;
}

export interface OptimizedPrompt {
  original_prompt: string;
  optimized_prompt: string;
  evaluation_criteria: string;
  suggestions: PromptSuggestion[];
  expected_improvement: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: LLMProvider;
  context_window: number;
  supports_function_calling: boolean;
}

export interface SavedJudgeConfig {
  id: string;
  name: string;
  config: JudgeConfig;
  created_at: string;
  updated_at: string;
  metrics?: AlignmentMetrics;
}

export type ExampleSelectionStrategy = 'representative' | 'edge_cases' | 'diverse' | 'recent';

// Align API Response Types
export interface AlignEvaluationResponse {
  success: boolean;
  results: AlignmentResult[];
  metrics: AlignmentMetrics;
  message?: string;
}

export interface AlignMisalignmentResponse {
  success: boolean;
  analysis: MisalignmentAnalysis;
}

export interface AlignOptimizeResponse {
  success: boolean;
  optimized: OptimizedPrompt;
  message?: string;
}

export interface AlignSuggestExamplesResponse {
  success: boolean;
  examples: FewShotExample[];
  strategy_used: string;
  message?: string;
}

export interface AlignModelsResponse {
  success: boolean;
  models: ModelInfo[];
}

export interface AlignConfigsResponse {
  success: boolean;
  configs: SavedJudgeConfig[];
}

export interface AlignSaveConfigResponse {
  success: boolean;
  config_id: string;
  message?: string;
}

export interface AlignDefaultsResponse {
  system_prompt: string;
  evaluation_criteria: string;
}

export interface AlignStatusResponse {
  configured: boolean;
  providers: {
    openai: boolean;
    anthropic: boolean;
  };
  saved_configs_count: number;
}

// Chart configuration
export interface ChartConfig {
  type: 'violin' | 'box' | 'radar' | 'scatter' | 'bar' | 'heatmap' | 'strip' | 'pie';
  data: unknown;
  layout?: Partial<Plotly.Layout>;
  config?: Partial<Plotly.Config>;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface UploadResponse {
  success: boolean;
  format: string;
  row_count: number;
  columns: string[];
  preview: Record<string, unknown>[];
  message?: string;
  data?: Record<string, unknown>[];
}

// UI configuration
export const UIConfig = {
  ITEMS_PER_PAGE: 3,
  CONTENT_TRUNC_LENGTH: 200,
  SPANS_PER_PAGE: 10,
} as const;

// Thresholds
export const Thresholds = {
  PASSING_RATE: 0.5,
  GREEN_THRESHOLD: 0.7,
  RED_THRESHOLD: 0.3,
} as const;

// ============================================
// Theme Types
// ============================================

export interface ThemePalette {
  name: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  primarySoft: string;
  primaryPale: string;
  accentGold: string;
  accentSilver: string;
  heroImage?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  appIconUrl?: string | null;
  // Hero image filter options
  heroContrast?: number | null;
  heroSaturation?: number | null;
  heroBrightness?: number | null;
  heroOpacity?: number | null;
  // Hero mode: 'dark' (default) or 'light' (white background)
  heroMode?: string | null;
  // Hero title shimmer gradient colors
  shimmerFrom?: string | null;
  shimmerTo?: string | null;
}

export interface BrandingConfig {
  app_name: string;
  tagline: string;
  subtitle: string;
  description: string;
  report_footer: string;
  docs_url: string;
  footer_name: string;
  footer_icon: string | null;
}

export interface ThemeConfigResponse {
  success: boolean;
  active: string;
  activePalette: ThemePalette;
  palettes: Record<string, ThemePalette>;
  branding: BrandingConfig;
}

// Default/fallback color palette (used before theme loads)
export const DefaultColors = {
  primary: '#3D5A80',
  primaryLight: '#5C7AA3',
  primaryDark: '#2B3C73',
  primarySoft: '#8BA4C4',
  primaryPale: '#C5D4E8',
  accentGold: '#D4AF37',
  accentSilver: '#B8C5D3',
  textPrimary: '#2C3E50',
  textSecondary: '#34495E',
  textMuted: '#7F8C8D',
  success: '#27AE60',
  warning: '#F39C12',
  error: '#E74C3C',
} as const;

// Legacy export for backwards compatibility
export const Colors = DefaultColors;

// Default chart colors (used before theme loads)
export const DefaultChartColors = [
  DefaultColors.primary,
  DefaultColors.primaryLight,
  DefaultColors.primaryDark,
  DefaultColors.primarySoft,
  DefaultColors.accentGold,
  DefaultColors.accentSilver,
  DefaultColors.primaryPale,
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
];

// Legacy export for backwards compatibility
export const ChartColors = DefaultChartColors;

// Plotly type declarations
declare module 'plotly.js' {
  interface Layout {
    [key: string]: unknown;
  }
  interface Config {
    [key: string]: unknown;
  }
}

// ============================================
// Learn Tab Types
// ============================================

export type LearnMainTab = 'overview' | 'walkthrough' | 'methods' | 'best-practices';
export type WalkthroughType = 'single-turn' | 'expected-output' | 'multi-turn' | 'rag' | 'workflow';
export type PlaybackSpeed = 0.5 | 1 | 1.5 | 2;
export type PlaybackState = 'playing' | 'paused' | 'stopped';

export interface WalkthroughStep {
  id: string;
  title: string;
  description: string;
  highlightElements: string[];
  dataState: {
    input?: string;
    processing?: string;
    output?: string;
  };
  animationType: 'fade' | 'slide' | 'highlight' | 'flow';
  duration: number;
}

export interface WalkthroughScenario {
  id: string;
  type: WalkthroughType;
  title: string;
  description: string;
  steps: WalkthroughStep[];
  exampleData: {
    query: string;
    actualOutput: string;
    expectedOutput?: string;
    conversation?: Array<{ role: string; content: string }>;
    retrievedContent?: string;
  };
  flowNodes: FlowNode[];
  flowEdges: FlowEdge[];
}

export interface FlowNode {
  id: string;
  type: 'input' | 'process' | 'judge' | 'output';
  label: string;
  position: { x: number; y: number };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
}

export interface EvaluationMethod {
  id: string;
  name: string;
  description: string;
  pros: string[];
  cons: string[];
  useCases: string[];
  complexity: 'low' | 'medium' | 'high';
  scalability: 'low' | 'medium' | 'high';
}

// ============================================
// Compare Charts Types
// ============================================

export interface WinLossData {
  queryId: string;
  queryText: string;
  winner: string; // experiment name or "Tie"
  maxScore: number;
  scores: Record<string, number>; // experiment -> overall score
}

export interface ModelAgreementData {
  model1: string;
  model2: string;
  bothPass: number;
  bothFail: number;
  model1Only: number;
  model2Only: number;
  agreementRate: number;
}

export interface ResponseLengthBin {
  category: string; // e.g., "0-100", "100-200"
  experimentName: string;
  count: number;
  avgScore: number;
}

export interface TurnCountBin {
  category: string; // e.g., "1-2 turns", "3-4 turns"
  experimentName: string;
  count: number;
  avgScore: number;
}

export type CompareChartType =
  | 'distribution'
  | 'radar'
  | 'bar'
  | 'scatter'
  | 'winloss'
  | 'agreement';

// ============================================
// Human Signals Types
// ============================================

// Conversation message for chat-style rendering
export interface ConversationMessage {
  role: 'assistant' | 'user';
  content: string;
}

// ============================================
// Signals Case Types (data-driven dashboard)
// ============================================

// A case record with flattened signal fields
export interface SignalsCaseRecord {
  Case_ID: string;
  Business: string;
  Message_Count: number;
  Timestamp: string;
  Agent_Name?: string;
  Slack_URL?: string;
  Full_Conversation?: ConversationMessage[];
  source_name?: string;
  source_component?: string;
  source_type?: string;
  environment?: string;
  // All signal fields are {metric_name}__{signal_key}
  [key: string]: unknown;
}

// Metric schema auto-discovered from data
export interface SignalsMetricInfo {
  category: string; // 'classification' | 'score'
  signals: string[];
  signal_types: Record<string, string>; // signal_key → 'boolean'|'string'|'number'|'array'
  values: Record<string, string[]>; // signal_key → unique values (for string signals)
}

export interface SignalsMetricSchema {
  metrics: Record<string, SignalsMetricInfo>;
  source_fields: string[];
  has_timestamp: boolean;
}

// Display configuration
export interface SignalsKPIConfig {
  metric?: string;
  signal?: string;
  aggregate?: string; // 'avg_message_count' | 'total_cases'
  aggregation?: string; // 'mean' | 'median' | 'sum' | 'min' | 'max' | 'count' | 'p95'
  label: string;
  format?: string; // 'percent' | 'number' | 'duration' | 'compact'
  icon: string;
  highlight?: boolean;
}

export interface SignalsChartConfig {
  metric: string;
  signal: string;
  type: string; // 'bar' | 'donut' | 'horizontal_bar' | 'stacked_bar' | 'ranked_list' | 'single_stat'
  title: string;
}

export interface SignalsChartSection {
  title: string;
  layout: string; // 'full' | 'grid_2' | 'grid_3'
  charts: SignalsChartConfig[];
}

export interface SignalsFilterConfig {
  type: string; // 'source' | 'metric'
  field?: string; // for source filters
  metric?: string; // for metric filters
  signal?: string; // for metric filters
  label: string;
  options?: string[];
}

export interface SignalsTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
}

export interface SignalsDisplayConfig {
  kpi_strip: SignalsKPIConfig[];
  chart_sections: SignalsChartSection[];
  filters: SignalsFilterConfig[];
  table_columns: SignalsTableColumn[];
  color_maps: Record<string, Record<string, string>>;
}

// Computed KPI result (for rendering)
export interface SignalsKPIResult {
  label: string;
  value: string;
  icon: string;
  highlight?: boolean;
  rawValue?: number;
  format?: string; // 'percent' | 'number' | 'duration' | 'compact'
  aggregation?: string; // 'mean' | 'median' | 'sum' | 'min' | 'max' | 'count' | 'p95'
  sparkline?: { date: string; value: number }[];
  /** Unique key for click-to-expand (e.g. "metric__signal" or "total_cases") */
  key: string;
  /** Total cases used to compute this KPI (for count badge) */
  totalCases?: number;
  /** Metric name this KPI belongs to (for category label) */
  metricName?: string;
}

// Chart data point (generic)
export interface SignalsChartDataPoint {
  name: string;
  count: number;
  rate: number;
  color?: string;
}

// ============================================
// AI Copilot Types
// ============================================

export type ThoughtType =
  | 'reasoning'
  | 'tool_use'
  | 'observation'
  | 'planning'
  | 'reflection'
  | 'decision'
  | 'error'
  | 'success';

export interface Thought {
  id: string;
  type: ThoughtType;
  content: string;
  node_name: string | null;
  skill_name: string | null;
  metadata: Record<string, unknown>;
  timestamp: string;
  color: string;
}

export interface CopilotDataContext {
  format: string | null;
  row_count: number;
  metric_columns: string[];
  columns: string[];
}

export interface CopilotRequest {
  message: string;
  data_context?: CopilotDataContext;
  data?: Record<string, unknown>[];
  session_id?: string;
}

export interface CopilotResponse {
  success: boolean;
  response: string;
  thoughts: Thought[];
  skills_used: string[];
  metadata?: Record<string, unknown>;
}

export interface SkillParameter {
  name: string;
  type: string;
  description: string | null;
  required: boolean;
  default: unknown;
}

export interface SkillInfo {
  name: string;
  description: string;
  version: string;
  parameters: SkillParameter[];
  tags: string[];
  enabled: boolean;
}

export interface SkillsListResponse {
  success: boolean;
  skills: SkillInfo[];
  total: number;
}

// SSE Event types
export type SSEEventType = 'thought' | 'response' | 'insights' | 'error' | 'done' | 'ping';

export interface SSEThoughtEvent {
  event: 'thought';
  data: Thought;
}

export interface SSEResponseEvent {
  event: 'response';
  data: {
    success: boolean;
    response: string;
    thoughts_count: number;
  };
}

export interface SSEErrorEvent {
  event: 'error';
  data: {
    error: string;
  };
}

// Thought colors for UI
export const ThoughtColors: Record<ThoughtType, string> = {
  reasoning: '#3B82F6', // blue
  tool_use: '#8B5CF6', // purple
  observation: '#10B981', // green
  planning: '#F59E0B', // amber
  reflection: '#6366F1', // indigo
  decision: '#EC4899', // pink
  error: '#EF4444', // red
  success: '#22C55E', // green
} as const;

// Thought icons (lucide-react icon names)
export const ThoughtIcons: Record<ThoughtType, string> = {
  reasoning: 'Brain',
  tool_use: 'Wrench',
  observation: 'Eye',
  planning: 'ListTodo',
  reflection: 'Lightbulb',
  decision: 'GitBranch',
  error: 'AlertCircle',
  success: 'CheckCircle',
} as const;

// ============================================
// Report Generation Types
// ============================================

export type ReportMode = 'low' | 'high' | 'overall';
export type ReportType = 'summary' | 'detailed' | 'grouped' | 'recommendations';

// Available context fields for extraction
export const AVAILABLE_CONTEXT_FIELDS = [
  'query',
  'actual_output',
  'expected_output',
  'retrieved_content',
  'conversation',
  'signals',
  'critique',
] as const;

export type ContextField = (typeof AVAILABLE_CONTEXT_FIELDS)[number];

export interface ExtractionConfig {
  score_threshold: number;
  include_nan: boolean;
  metric_filters: string[];
  max_issues: number;
  sample_rate: number;
  include_context_fields: ContextField[];
}

export interface ReportRequest {
  mode: ReportMode;
  report_type: ReportType;
  metric_filter?: string;
  extraction_config: ExtractionConfig;
  data: Record<string, unknown>[];
  model?: string;
  provider?: string;
}

export interface InsightPattern {
  category: string;
  description: string;
  count: number;
  issue_ids: string[];
  metrics_involved: string[];
  is_cross_metric: boolean;
  distinct_test_cases: number;
  examples: string[];
  confidence: number | null;
}

export interface InsightResult {
  patterns: InsightPattern[];
  learnings: LearningArtifact[];
  total_issues_analyzed: number;
  pipeline_metadata: PipelineMetadata | null;
}

export interface ReportResponse {
  success: boolean;
  report_text: string;
  issues_analyzed: number;
  metrics_covered: string[];
  insights?: InsightResult | null;
}

export interface ExtractedIssue {
  id: string;
  metric_name: string;
  score: number | null;
  query: string;
  actual_output: string;
  expected_output?: string;
}

export interface ExtractIssuesResponse {
  success: boolean;
  issues: ExtractedIssue[];
  total_issues: number;
  metrics_covered: string[];
  mode: ReportMode;
  threshold: number;
  config: ExtractionConfig;
}

export interface ReportStatusResponse {
  available: boolean;
  providers: {
    openai: boolean;
    anthropic: boolean;
  };
  default_model: string;
  report_types: string[];
  report_modes: string[];
  available_context_fields: string[];
}

// ============================================
// Monitoring Types
// ============================================

export type MonitoringDataFormat = 'monitoring' | null;

/**
 * Metric category determines how the metric output should be interpreted:
 * - SCORE: Numeric value (0-1), used for charts, thresholds, pass/fail
 * - ANALYSIS: Structured insights/reasoning (JSON), shown in detail views
 * - CLASSIFICATION: Categorical label (string), used for breakdowns
 */
export type MetricCategory = 'SCORE' | 'ANALYSIS' | 'CLASSIFICATION';

export interface MonitoringRecord {
  // Identifiers
  [Columns.DATASET_ID]: string;
  [Columns.METRIC_ID]?: string;
  [Columns.RUN_ID]?: string;
  [Columns.TRACE_ID]?: string;
  [Columns.OBSERVATION_ID]?: string;

  // Timestamps
  [Columns.TIMESTAMP]: string;

  // Core fields
  [Columns.QUERY]?: string;
  [Columns.ACTUAL_OUTPUT]?: string;
  [Columns.EXPECTED_OUTPUT]?: string;
  [Columns.EXPERIMENT_NAME]?: string;

  // Model/Environment
  [Columns.MODEL_NAME]?: string;
  [Columns.LLM_PROVIDER]?: string;
  environment?: string;

  // Source metadata
  source_name?: string;
  source_component?: string;
  source_type?: string;

  // Performance
  latency?: number;

  // Status
  [Columns.HAS_ERRORS]?: boolean;

  // Metric fields (for long format)
  [Columns.METRIC_NAME]?: string;
  [Columns.METRIC_SCORE]?: number;
  [Columns.METRIC_TYPE]?: string;
  [Columns.METRIC_CATEGORY]?: MetricCategory;
  [Columns.PARENT]?: string | null;
  [Columns.WEIGHT]?: number;

  // Evaluation results
  [Columns.PASSED]?: boolean;
  [Columns.THRESHOLD]?: number;
  [Columns.JUDGMENT]?: string;

  // Content
  [Columns.SIGNALS]?: string | Record<string, unknown> | unknown[];
  [Columns.EXPLANATION]?: string;
  [Columns.CRITIQUE]?: string;

  // Dynamic metric columns
  [metricName: string]: unknown;
}

export interface MonitoringSummaryMetrics {
  totalRecords: number;
  avgScore: number;
  passRate: number;
  errorRate: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  activeAlerts: number;
}

export interface MonitoringTrendPoint {
  timestamp: string;
  avgScore: number;
  passRate: number;
  avgLatencyMs: number;
  recordCount: number;
}

export interface MonitoringAlert {
  id: string;
  type: 'warning' | 'error';
  title: string;
  message: string;
  timestamp: string;
  // Structured metadata for professional rendering
  category?: 'threshold' | 'anomaly';
  method?: 'z-score' | 'moving-average' | 'rate-of-change' | 'threshold';
  metric?: string;
  /** The source_name (agent) active when this alert was generated. */
  source_name?: string;
  metadata?: {
    currentValue?: number;
    threshold?: number;
    deviation?: number;
    direction?: 'above' | 'below' | 'increased' | 'decreased';
    unit?: string;
    zScore?: number;
    movingAverage?: number;
    previousValue?: number;
  };
}

// ============================================
// Monitoring Analytics Chart Types
// ============================================

export type MonitoringChartGranularity = 'hourly' | 'daily' | 'weekly';
export type MonitoringGroupBy =
  | 'environment'
  | 'source_name'
  | 'source_component'
  | 'source_type'
  | 'evaluation_name'
  | null;

export interface MonitoringTrendData {
  timestamp: string;
  metric: string;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

export interface MonitoringLatencyDistribution {
  histogram: {
    counts: number[];
    edges: number[];
  };
  percentiles: {
    p50: number;
    p95: number;
    p99: number;
  };
  byGroup?: Record<
    string,
    {
      counts: number[];
      percentiles: {
        p50: number;
        p95: number;
        p99: number;
      };
    }
  >;
}

export interface MonitoringClassDistribution {
  group: string;
  values: number[];
  stats: {
    mean: number;
    std: number;
    min: number;
    max: number;
    median: number;
    count: number;
  };
}

export interface MonitoringMetricBreakdown {
  name: string;
  passRate: number;
  avg: number;
  count: number;
  byGroup?: Record<
    string,
    {
      passRate: number;
      avg: number;
      count: number;
    }
  >;
}

export interface MonitoringCorrelation {
  matrix: number[][];
  metrics: string[];
}

// ============================================
// Classification Metric Types
// ============================================

export interface ClassificationCategoryCount {
  value: string;
  count: number;
  percentage: number;
}

export interface ClassificationBreakdown {
  metric_name: string;
  categories: ClassificationCategoryCount[];
  total_count: number;
}

export interface ClassificationTrendPoint {
  timestamp: string;
  categories: Record<string, number>; // category value -> count
}

export interface ClassificationBreakdownResponse {
  success: boolean;
  metrics: ClassificationBreakdown[];
}

export interface ClassificationTrendResponse {
  success: boolean;
  data: ClassificationTrendPoint[];
  metric_name: string;
  granularity: string;
  unique_categories: string[];
}

// ============================================
// Analysis Metric Types
// ============================================

/**
 * Signal interface for structured evaluation insights.
 * Used in both tree view MetricDetailPopup and monitoring analysis tab.
 */
export interface Signal {
  name: string;
  value: unknown;
  score?: number | null;
  description?: string;
  headline_display?: boolean;
}

/**
 * Grouped signals organized by category (e.g., 'overall', 'statement_0', etc.)
 */
export interface GroupedSignals {
  [group: string]: Signal[];
}

export interface AnalysisRecord {
  dataset_id: string;
  timestamp: string | null;
  metric_name: string;
  query: string | null;
  actual_output: string | null;
  signals: GroupedSignals | Signal[] | string | null;
  explanation: string | null;
  source_info: {
    environment?: string | null;
    source_name?: string | null;
    source_component?: string | null;
  };
}

export interface AnalysisInsightsResponse {
  success: boolean;
  records: AnalysisRecord[];
  total_count: number;
  page: number;
  limit: number;
  metric_names: string[];
}

// ============================================
// Metric Category Tab Types
// ============================================

export type MetricCategoryTab =
  | 'executive-summary'
  | 'score'
  | 'classification'
  | 'analysis'
  | 'alerts';

export interface MonitoringHierarchyNode {
  id: string;
  name: string;
  level: 'source' | 'component' | 'metric';
  sourceName: string;
  sourceComponent?: string;
  metricName?: string;
  metricCategory?: MetricCategory;
  avgScore: number | null;
  recordCount: number;
  healthStatus: 'healthy' | 'warning' | 'critical' | 'unknown';
  trendPoints: { timestamp: string; value: number }[];
  scoreDelta: number | null;
  childIds: string[];
}

// ============================================
// Evaluation Runner Types
// ============================================

export type EvalRunnerStep = 'upload' | 'agent' | 'metrics' | 'run';

export type AgentType = 'none' | 'api' | 'prompt';

export interface EvalRunnerMetricInfo {
  key: string;
  name: string;
  description: string;
  required_fields: string[];
  optional_fields: string[];
  default_threshold: number;
  score_range: [number, number];
  tags: string[];
  is_llm_based: boolean;
}

export interface EvalRunnerColumnMapping {
  // Required fields
  dataset_id: string;
  query: string;

  // Optional output fields
  actual_output?: string | null;
  expected_output?: string | null;

  // Optional context fields
  retrieved_content?: string | null;
  conversation?: string | null;
  additional_input?: string | null;
  document_text?: string | null;

  // Optional reference fields
  actual_reference?: string | null;
  expected_reference?: string | null;

  // Optional tool fields
  tools_called?: string | null;
  expected_tools?: string | null;
  acceptance_criteria?: string | null;

  // Optional observability fields
  latency?: string | null;
  trace_id?: string | null;
  observation_id?: string | null;
}

export interface EvalRunnerDatasetInfo {
  columns: string[];
  preview: Record<string, unknown>[];
  row_count: number;
}

export interface EvalRunnerAgentAPIConfig {
  endpoint_url: string;
  headers: Record<string, string>;
  request_template: string;
  response_path: string;
}

export interface EvalRunnerPromptConfig {
  model: string;
  provider: LLMProvider;
  system_prompt: string;
  user_prompt_template: string;
}

export interface EvalRunnerAgentConfig {
  type: AgentType;
  api_config?: EvalRunnerAgentAPIConfig | null;
  prompt_config?: EvalRunnerPromptConfig | null;
}

export interface EvalRunnerDatasetConfig {
  columns: EvalRunnerColumnMapping;
  data: Record<string, unknown>[];
}

export interface EvalRunnerMetricResult {
  metric_key: string;
  metric_name: string;
  average_score: number;
  median_score: number;
  min_score: number;
  max_score: number;
  pass_rate: number;
  threshold: number;
  passed: boolean;
  scores: number[];
}

export interface EvalRunnerItemResult {
  item_id: string;
  query: string;
  actual_output: string;
  expected_output?: string | null;
  metric_scores: Record<string, number>;
  metric_reasons: Record<string, string>;
  passed: boolean;
}

export interface EvalRunnerSummary {
  evaluation_name: string;
  run_id: string;
  total_items: number;
  metrics_count: number;
  average_score: number;
  overall_pass_rate: number;
  metric_results: EvalRunnerMetricResult[];
  item_results: EvalRunnerItemResult[];
  // Full dataframe from results.to_dataframe() for export/visualization
  dataframe_records: Record<string, unknown>[];
  dataframe_columns: string[];
}

// API Request/Response types
export interface EvalRunnerUploadResponse {
  success: boolean;
  dataset: EvalRunnerDatasetInfo;
  suggested_mapping?: EvalRunnerColumnMapping | null;
  message?: string | null;
}

export interface EvalRunnerMetricsResponse {
  success: boolean;
  metrics: EvalRunnerMetricInfo[];
}

export interface EvalRunnerTestConnectionRequest {
  agent_config: EvalRunnerAgentConfig;
  sample_query: string;
}

export interface EvalRunnerTestConnectionResponse {
  success: boolean;
  sample_output?: string | null;
  error?: string | null;
  latency_ms?: number | null;
}

export interface EvalRunnerRunRequest {
  evaluation_name: string;
  dataset: EvalRunnerDatasetConfig;
  agent_config?: EvalRunnerAgentConfig | null;
  metrics: string[];
  model_name: string;
  llm_provider: LLMProvider;
  max_concurrent: number;
  thresholds?: Record<string, number> | null;
}

export interface EvalRunnerResultResponse {
  success: boolean;
  summary: EvalRunnerSummary;
  message?: string | null;
}

// SSE Event types for eval runner
export interface EvalRunnerProgressEvent {
  current: number;
  total: number;
  metric?: string | null;
  item_id?: string | null;
  status: string;
}

export interface EvalRunnerLogEvent {
  timestamp: string;
  level: string;
  message: string;
}

export interface EvalRunnerCompleteEvent {
  run_id: string;
  summary: EvalRunnerSummary;
}

export interface EvalRunnerErrorEvent {
  message: string;
  details?: string | null;
}

// Memory types re-exported from @/types/memory
export type {
  MemoryTab,
  MemoryRuleRecord,
  MemoryActionCount,
  MemoryProductCount,
  MemorySummary,
  MemoryFiltersAvailable,
  MemoryRulesResponse,
  MemoryUploadResponse,
  MemoryQualityResponse,
  MemoryBatchInfo,
  MemoryTraceResponse,
  MemoryConflictInfo,
  MemoryConflictsResponse,
  MemoryRuleUpdateRequest,
  MemoryRuleDeleteResponse,
  MemoryConfigResponse,
  GraphNodeType,
  GraphEdgeType,
  GraphNode,
  GraphEdge,
  GraphData,
  GraphSearchResult,
  GraphSummary,
} from './memory';
export { GraphNodeColors, GraphNodeSizes } from './memory';

// ============================================
// DuckDB Store Types
// ============================================

export type SyncState = 'not_synced' | 'syncing' | 'ready' | 'error';

export interface DatasetSyncStatus {
  state: SyncState;
  rows: number;
  last_sync: string | null;
  error: string | null;
  truncated: boolean;
}

export interface StoreStatusResponse {
  success: boolean;
  enabled: boolean;
  datasets: Record<string, DatasetSyncStatus>;
}

export interface DatasetMetadata {
  row_count: number;
  columns: Array<{ column_name: string; column_type: string }>;
  filter_values: Record<string, string[]>;
  time_range: { min: string; max: string } | null;
}

export interface DatasetMetadataResponse {
  success: boolean;
  dataset: string;
  metadata: DatasetMetadata;
}

export interface MonitoringFilters {
  environment?: string;
  source_name?: string;
  source_component?: string;
  source_type?: string;
  metric_category?: string;
  metric_name?: string;
  time_start?: string;
  time_end?: string;
}

// ============================================
// Agent KPI Types
// ============================================

export type KpiCategory =
  | 'operational_efficiency'
  | 'commercial_impact'
  | 'risk_accuracy'
  | 'data_integrity'
  | 'ux';

export type KpiUnit = 'percent' | 'seconds' | 'count' | 'score';
export type KpiTrendDirection = 'up' | 'down' | 'flat';

export interface KpiTrendPoint {
  date: string;
  kpi_name: string;
  value: number | null;
  avg_7d: number | null;
  avg_30d: number | null;
  count: number;
}

export interface KpiSparklinePoint {
  date: string;
  value: number | null;
}

export interface KpiCategoryItem {
  kpi_name: string;
  display_name: string;
  current_value: number | null;
  card_display_value?: string;
  trend_direction: KpiTrendDirection | null;
  polarity: 'higher_better' | 'lower_better';
  sparkline: KpiSparklinePoint[];
  unit: KpiUnit;
  record_count: number;
}

export interface KpiCategoryPanel {
  category: string;
  display_name: string;
  icon: string;
  kpis: KpiCategoryItem[];
}

export interface KpiDateRange {
  min_date: string;
  max_date: string;
}

export interface KpiCategoriesResponse {
  success: boolean;
  categories: KpiCategoryPanel[];
  date_range?: KpiDateRange;
}

export interface KpiTrendsResponse {
  success: boolean;
  data: KpiTrendPoint[];
  kpi_names: string[];
  trend_lines?: string[];
}

export interface KpiFilters {
  source_name?: string;
  kpi_category?: string;
  environment?: string;
  source_type?: string;
  segment?: string;
  time_start?: string;
  time_end?: string;
}

export interface KpiCompositionKpiEntry {
  kpi_name: string;
  label: string;
  color: string;
}

export interface KpiCompositionChartConfig {
  title: string;
  kpis: KpiCompositionKpiEntry[];
  show_remainder?: boolean;
  remainder_label?: string;
  remainder_color?: string;
}

export interface KpiFiltersResponse {
  success: boolean;
  source_names: string[];
  environments: string[];
  kpi_categories: string[];
  kpi_names: string[];
  source_types: string[];
  segments: string[];
  kpi_order: Record<string, string[]>;
  composition_charts?: KpiCompositionChartConfig[];
}
