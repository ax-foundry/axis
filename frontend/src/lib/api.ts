import type {
  ColumnInfo,
  ColumnMapping,
  DatabaseConnection,
  FilterCondition,
  TableIdentifier,
  TableInfo,
} from '@/stores/database-store';
import type {
  ThemeConfigResponse,
  AlignConfigsResponse,
  AlignDefaultsResponse,
  AlignEvaluationResponse,
  AlignmentMetrics,
  AlignmentResult,
  AlignMisalignmentResponse,
  AlignModelsResponse,
  AlignOptimizeResponse,
  AlignSaveConfigResponse,
  AlignStatusResponse,
  AlignSuggestExamplesResponse,
  AnalysisInsightsResponse,
  AnnotationWithNotes,
  ClassificationBreakdownResponse,
  ClassificationTrendResponse,
  ClusteringMethod,
  DataFormat,
  ErrorPattern,
  EvaluationRecord,
  EvalRunnerAgentConfig,
  EvalRunnerColumnMapping,
  EvalRunnerMetricsResponse,
  EvalRunnerResultResponse,
  EvalRunnerRunRequest,
  EvalRunnerTestConnectionResponse,
  EvalRunnerUploadResponse,
  ExampleSelectionStrategy,
  ExtractIssuesResponse,
  LearningArtifact,
  PipelineMetadata,
  SignalsDisplayConfig,
  SignalsMetricSchema,
  JudgeConfig,
  LLMProvider,
  MetricSummary,
  MonitoringChartGranularity,
  MonitoringClassDistribution,
  MonitoringFilters,
  MonitoringTrendData,
  StoreStatusResponse,
  DatasetMetadataResponse,
  ReportRequest,
  ReportResponse,
  ReportStatusResponse,
  UploadResponse,
  KpiCategoriesResponse,
  KpiTrendsResponse,
  KpiFilters,
  KpiFiltersResponse,
} from '@/types';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8500';

export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `API error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error(
        `Cannot connect to backend at ${API_BASE_URL}. Please ensure the backend server is running (cd backend && uvicorn app.main:app --reload --port 8500)`
      );
    }
    throw error;
  }
}

// Data endpoints
export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/data/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Upload failed');
  }

  return response.json();
}

export async function loadExampleDataset(datasetName: string): Promise<{
  success: boolean;
  format: DataFormat;
  row_count: number;
  columns: string[];
  data: EvaluationRecord[];
  message: string;
}> {
  return fetchApi(`/api/data/example/${datasetName}`);
}

// ============================================
// Evaluation Database Auto-Load API
// ============================================

/**
 * Evaluation database configuration response
 */
export interface EvalDBConfigResponse {
  success: boolean;
  configured: boolean;
  auto_load: boolean;
  has_query: boolean;
  row_limit: number;
  query_timeout: number;
}

/**
 * Get evaluation database configuration
 */
export async function getEvalDBConfig(): Promise<EvalDBConfigResponse> {
  return fetchApi('/api/data/eval-db-config');
}

/**
 * Auto-import evaluation data from configured database
 */
export async function autoImportEvalFromDB(): Promise<UploadResponse> {
  return fetchApi('/api/data/eval-db-import', { method: 'POST' });
}

// Analytics endpoints
export async function getSummaryStats(data: EvaluationRecord[]): Promise<{
  success: boolean;
  summary: MetricSummary[];
  total_records: number;
}> {
  return fetchApi('/api/analytics/summary', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getDistribution(
  data: EvaluationRecord[],
  metric: string,
  bins?: number
): Promise<{
  success: boolean;
  metric: string;
  values: number[];
  histogram: { counts: number[]; bin_edges: number[] };
  stats: { mean: number; median: number; std: number; q25: number; q75: number };
}> {
  return fetchApi(`/api/analytics/distribution?metric=${metric}&bins=${bins || 20}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getComparison(
  data: EvaluationRecord[],
  groupBy: string,
  metrics?: string[]
): Promise<{
  success: boolean;
  comparison: Array<{ group: string; [key: string]: unknown }>;
  metrics: string[];
  groups: string[];
}> {
  const params = new URLSearchParams({ group_by: groupBy });
  if (metrics) params.append('metrics', JSON.stringify(metrics));

  return fetchApi(`/api/analytics/comparison?${params}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getCorrelation(
  data: EvaluationRecord[],
  metrics?: string[]
): Promise<{
  success: boolean;
  correlation: Record<string, Record<string, number>>;
  metrics: string[];
}> {
  const params = metrics ? `?metrics=${JSON.stringify(metrics)}` : '';

  return fetchApi(`/api/analytics/correlation${params}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getRadarData(
  data: EvaluationRecord[],
  metrics: string[],
  groupBy?: string
): Promise<{
  success: boolean;
  metrics: string[];
  traces: Array<{ name: string; values: number[] }>;
}> {
  const params = new URLSearchParams();
  params.append('metrics', JSON.stringify(metrics));
  if (groupBy) params.append('group_by', groupBy);

  return fetchApi(`/api/analytics/radar?${params}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getScatterData(
  data: EvaluationRecord[],
  xMetric: string,
  yMetric: string,
  colorBy?: string
): Promise<{
  success: boolean;
  x: number[];
  y: number[];
  x_metric: string;
  y_metric: string;
  color?: unknown[];
  color_by?: string;
  ids?: string[];
}> {
  const params = new URLSearchParams({
    x_metric: xMetric,
    y_metric: yMetric,
  });
  if (colorBy) params.append('color_by', colorBy);

  return fetchApi(`/api/analytics/scatter?${params}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// AI endpoints
export async function chat(
  messages: Array<{ role: string; content: string }>,
  dataContext?: Record<string, unknown>
): Promise<{
  success: boolean;
  response: { role: string; content: string } | null;
  message?: string;
}> {
  return fetchApi('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({
      messages,
      data_context: dataContext,
      stream: false,
    }),
  });
}

export async function analyzeData(
  data: EvaluationRecord[],
  focus?: string
): Promise<{
  success: boolean;
  insights: Array<{ type: string; metric: string; message: string }>;
  summary: string;
}> {
  const params = focus ? `?focus=${focus}` : '';

  return fetchApi(`/api/ai/analyze${params}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getAIStatus(): Promise<{
  configured: boolean;
  model: string;
  features: Record<string, boolean>;
}> {
  return fetchApi('/api/ai/status');
}

// Health check
export async function healthCheck(): Promise<{
  status: string;
  service: string;
  version: string;
}> {
  return fetchApi('/');
}

// ============================================
// Theme Configuration API
// ============================================

/**
 * Get theme configuration from the backend
 */
export async function getThemeConfig(): Promise<ThemeConfigResponse> {
  return fetchApi('/api/config/theme');
}

/**
 * Agent configuration response from the backend
 */
export interface AgentsConfigResponse {
  success: boolean;
  agents: Array<{
    name: string;
    label: string;
    role?: string;
    avatar?: string;
    description?: string;
    biography?: string;
    active?: boolean;
  }>;
}

/**
 * Get agent registry configuration from the backend
 */
export async function getAgentsConfig(): Promise<AgentsConfigResponse> {
  return fetchApi('/api/config/agents');
}

/**
 * Feature flags from the backend
 */
export interface FeaturesConfigResponse {
  eval_runner_enabled: boolean;
  copilot_enabled: boolean;
}

/**
 * Get feature flags from the backend
 */
export async function getFeaturesConfig(): Promise<FeaturesConfigResponse> {
  return fetchApi('/api/config/features');
}

// ============================================
// Align Evals API
// ============================================

export async function alignEvaluate(
  records: EvaluationRecord[],
  humanAnnotations: Record<string, number>,
  judgeConfig: JudgeConfig,
  llmColumns?: string[]
): Promise<AlignEvaluationResponse> {
  return fetchApi('/api/align/evaluate', {
    method: 'POST',
    body: JSON.stringify({
      records,
      human_annotations: humanAnnotations,
      judge_config: judgeConfig,
      llm_columns: llmColumns,
    }),
  });
}

export async function alignAnalyzeMisalignment(
  results: AlignmentResult[],
  judgeConfig: JudgeConfig
): Promise<AlignMisalignmentResponse> {
  return fetchApi('/api/align/analyze-misalignment', {
    method: 'POST',
    body: JSON.stringify({
      results,
      judge_config: judgeConfig,
    }),
  });
}

export async function alignOptimizePrompt(
  results: AlignmentResult[],
  currentConfig: JudgeConfig
): Promise<AlignOptimizeResponse> {
  return fetchApi('/api/align/optimize-prompt', {
    method: 'POST',
    body: JSON.stringify({
      results,
      current_config: currentConfig,
    }),
  });
}

export async function alignSuggestExamples(
  records: EvaluationRecord[],
  humanAnnotations: Record<string, number>,
  strategy: ExampleSelectionStrategy = 'diverse',
  count: number = 4
): Promise<AlignSuggestExamplesResponse> {
  return fetchApi('/api/align/suggest-examples', {
    method: 'POST',
    body: JSON.stringify({
      records,
      human_annotations: humanAnnotations,
      strategy,
      count,
    }),
  });
}

export async function alignGetModels(): Promise<AlignModelsResponse> {
  return fetchApi('/api/align/models');
}

export async function alignSaveConfig(
  name: string,
  config: JudgeConfig,
  metrics?: AlignmentMetrics
): Promise<AlignSaveConfigResponse> {
  return fetchApi('/api/align/save-config', {
    method: 'POST',
    body: JSON.stringify({
      name,
      config,
      metrics,
    }),
  });
}

export async function alignGetConfigs(): Promise<AlignConfigsResponse> {
  return fetchApi('/api/align/configs');
}

export async function alignDeleteConfig(configId: string): Promise<{ success: boolean }> {
  return fetchApi(`/api/align/configs/${configId}`, {
    method: 'DELETE',
  });
}

export async function alignGetDefaults(): Promise<AlignDefaultsResponse> {
  return fetchApi('/api/align/defaults');
}

export async function alignGetStatus(): Promise<AlignStatusResponse> {
  return fetchApi('/api/align/status');
}

// Pattern clustering for Truesight feature
export interface AlignClusterPatternsResponse {
  success: boolean;
  patterns: ErrorPattern[];
  uncategorized: string[];
  learnings: LearningArtifact[];
  pipeline_metadata: PipelineMetadata | null;
  message?: string;
}

export async function alignClusterPatterns(
  annotations: Record<string, AnnotationWithNotes>,
  judgeConfig?: JudgeConfig,
  method: ClusteringMethod = 'llm',
  domainContext?: string
): Promise<AlignClusterPatternsResponse> {
  return fetchApi('/api/align/cluster-patterns', {
    method: 'POST',
    body: JSON.stringify({
      annotations,
      judge_config: judgeConfig,
      method,
      domain_context: domainContext,
    }),
  });
}

// ============================================
// Human Signals Upload API
// ============================================

export interface HumanSignalsUploadResponse {
  success: boolean;
  format: string;
  row_count: number;
  columns: string[];
  data: Record<string, unknown>[];
  message?: string;
  source?: string;
  metric_schema?: SignalsMetricSchema;
  display_config?: SignalsDisplayConfig;
}

/**
 * Upload a human signals CSV file
 */
export async function uploadHumanSignalsFile(file: File): Promise<HumanSignalsUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/human-signals/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Human signals upload failed');
  }

  return response.json();
}

/**
 * Load an example human signals dataset
 */
export async function loadHumanSignalsExampleDataset(
  datasetName: string
): Promise<HumanSignalsUploadResponse> {
  return fetchApi(`/api/human-signals/example/${datasetName}`);
}

/**
 * Human signals database configuration response
 */
export interface HumanSignalsDBConfigResponse {
  success: boolean;
  configured: boolean;
  auto_connect: boolean;
  auto_load: boolean;
  has_query: boolean;
  row_limit: number;
  query_timeout: number;
  connection: {
    host: string;
    port: number;
    database: string;
    schema: string;
    table: string | null;
    ssl_mode: string;
    has_url: boolean;
  } | null;
}

/**
 * Get human signals database configuration
 */
export async function getHumanSignalsDBConfig(): Promise<HumanSignalsDBConfigResponse> {
  return fetchApi('/api/human-signals/db-config');
}

/**
 * Auto-import human signals data from configured database
 */
export async function autoImportHumanSignalsFromDB(): Promise<HumanSignalsUploadResponse> {
  return fetchApi('/api/human-signals/db-import', { method: 'POST' });
}

// ============================================
// Report Generation API
// ============================================

/**
 * Generate a report from evaluation data (non-streaming)
 */
export async function generateReport(request: ReportRequest): Promise<ReportResponse> {
  return fetchApi('/api/reports/generate', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Extract issues preview before report generation
 */
export async function extractIssuesPreview(
  request: Omit<ReportRequest, 'report_type'>
): Promise<ExtractIssuesResponse> {
  return fetchApi('/api/reports/extract-issues', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Get report service status
 */
export async function getReportStatus(): Promise<ReportStatusResponse> {
  return fetchApi('/api/reports/status');
}

// ============================================
// Database Integration API
// ============================================

export interface ConnectResponse {
  success: boolean;
  handle: string;
  message: string;
  version: string | null;
}

export interface TablesListResponse {
  success: boolean;
  tables: TableInfo[];
}

export interface TableSchemaResponse {
  success: boolean;
  columns: ColumnInfo[];
  sample_values: Record<string, unknown[]>;
}

export interface PreviewResponse {
  success: boolean;
  data: Record<string, unknown>[];
  row_count: number;
}

export interface DistinctValuesResponse {
  success: boolean;
  values: string[];
}

export interface DatabaseImportRequest {
  handle: string;
  table: TableIdentifier;
  mappings?: ColumnMapping[] | null;
  filters?: FilterCondition[];
  limit?: number;
  dedupe_on_id?: boolean;
}

export interface QueryImportRequest {
  handle: string;
  query: string;
  limit?: number;
  dedupe_on_id?: boolean;
}

/**
 * Database defaults response from config (YAML > env vars > hardcoded)
 */
export interface DatabaseDefaultsResponse {
  url: string | null;
  host: string | null;
  port: number;
  database: string | null;
  username: string | null;
  has_password: boolean;
  ssl_mode: string;
  table: string | null;
  has_defaults: boolean;
  // Wizard config fields
  tables: string[];
  filters: { column: string; label: string }[];
  column_rename_map: Record<string, string>;
  query: string | null;
  query_timeout: number;
  row_limit: number;
}

/**
 * Get database connection defaults from config
 */
export async function databaseGetDefaults(store?: string): Promise<DatabaseDefaultsResponse> {
  const params = store ? `?store=${encodeURIComponent(store)}` : '';
  return fetchApi(`/api/database/defaults${params}`);
}

/**
 * Connect to a PostgreSQL database and get a connection handle.
 * Pass store so the backend can resolve sentinel passwords from config.
 */
export async function databaseConnect(
  conn: DatabaseConnection,
  store?: string
): Promise<ConnectResponse> {
  const params = store ? `?store=${encodeURIComponent(store)}` : '';
  return fetchApi(`/api/database/connect${params}`, {
    method: 'POST',
    body: JSON.stringify(conn),
  });
}

/**
 * List tables in the connected database
 */
export async function databaseListTables(handle: string): Promise<TablesListResponse> {
  return fetchApi(`/api/database/${handle}/tables`);
}

/**
 * Get schema for a specific table
 */
export async function databaseGetSchema(
  handle: string,
  table: TableIdentifier
): Promise<TableSchemaResponse> {
  const params = new URLSearchParams({
    schema: table.schema_name,
    table: table.name,
  });
  return fetchApi(`/api/database/${handle}/schema?${params}`);
}

/**
 * Get distinct values for a column (for filter dropdowns)
 */
export async function databaseGetDistinctValues(
  handle: string,
  table: TableIdentifier,
  column: string,
  limit: number = 100
): Promise<DistinctValuesResponse> {
  return fetchApi(`/api/database/${handle}/distinct-values`, {
    method: 'POST',
    body: JSON.stringify({ table, column, limit }),
  });
}

/**
 * Preview data (with optional column mappings)
 */
export async function databasePreview(
  handle: string,
  table: TableIdentifier,
  mappings?: ColumnMapping[] | null,
  filters?: FilterCondition[],
  limit: number = 10
): Promise<PreviewResponse> {
  return fetchApi(`/api/database/${handle}/preview`, {
    method: 'POST',
    body: JSON.stringify({ table, mappings: mappings || null, filters, limit }),
  });
}

/**
 * Import data from database (returns same format as CSV upload)
 */
export async function databaseImport(request: DatabaseImportRequest): Promise<UploadResponse> {
  return fetchApi(`/api/database/${request.handle}/import`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Preview results of a SQL query
 */
export async function databaseQueryPreview(
  handle: string,
  query: string,
  limit: number = 10
): Promise<PreviewResponse> {
  return fetchApi(`/api/database/${handle}/query`, {
    method: 'POST',
    body: JSON.stringify({ query, limit }),
  });
}

/**
 * Import data from a SQL query
 */
export async function databaseQueryImport(request: QueryImportRequest): Promise<UploadResponse> {
  return fetchApi(`/api/database/${request.handle}/query-import`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

// ============================================
// Monitoring Upload API
// ============================================

export interface MonitoringUploadResponse {
  success: boolean;
  format: string;
  row_count: number;
  columns: string[];
  metric_columns: string[];
  data: Record<string, unknown>[];
  message?: string;
}

/**
 * Upload a monitoring CSV file
 */
export async function uploadMonitoringFile(file: File): Promise<MonitoringUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/monitoring/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Monitoring upload failed');
  }

  return response.json();
}

/**
 * Load an example monitoring dataset
 */
export async function loadMonitoringExampleDataset(
  datasetName: string
): Promise<MonitoringUploadResponse> {
  return fetchApi(`/api/monitoring/example/${datasetName}`);
}

/**
 * Monitoring database configuration response
 */
export interface MonitoringDBConfigResponse {
  success: boolean;
  configured: boolean;
  auto_connect: boolean;
  auto_load: boolean;
  has_query: boolean;
  row_limit: number;
  query_timeout: number;
  connection: {
    host: string;
    port: number;
    database: string;
    schema: string;
    table: string | null;
    ssl_mode: string;
    has_url: boolean;
  } | null;
  thresholds?: {
    default: { good: number; pass: number };
    per_source?: Record<string, { good: number; pass: number }>;
  };
  anomaly_detection?: {
    enabled: boolean;
    min_data_points: number;
    z_score: {
      enabled: boolean;
      threshold: number;
      severity: string;
      lookback_window: number;
      metrics: string[];
    };
    moving_average: {
      enabled: boolean;
      window_size: number;
      deviation_threshold: number;
      severity: string;
      metrics: string[];
    };
    rate_of_change: {
      enabled: boolean;
      threshold: number;
      severity: string;
      metrics: string[];
    };
  };
}

/**
 * Get monitoring database configuration
 */
export async function getMonitoringDBConfig(): Promise<MonitoringDBConfigResponse> {
  return fetchApi('/api/monitoring/db-config');
}

/**
 * Auto-import monitoring data from configured database
 */
export async function autoImportMonitoringFromDB(): Promise<MonitoringUploadResponse> {
  return fetchApi('/api/monitoring/db-import', { method: 'POST' });
}

// ============================================
// Monitoring Analytics API
// ============================================

export interface MonitoringTrendsResponse {
  success: boolean;
  data: MonitoringTrendData[];
  metrics: string[];
  granularity: string;
}

export interface MonitoringLatencyDistResponse {
  success: boolean;
  histogram: {
    counts: number[];
    edges: number[];
  };
  percentiles: {
    p50: number;
    p95: number;
    p99: number;
  };
  by_group?: Record<
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

export interface MonitoringClassDistResponse {
  success: boolean;
  data: MonitoringClassDistribution[];
  metric: string;
  group_by: string;
}

export interface MonitoringMetricBreakdownResponse {
  success: boolean;
  metrics: Array<{
    name: string;
    pass_rate: number;
    avg: number;
    count: number;
    by_group?: Record<
      string,
      {
        pass_rate: number;
        avg: number;
        count: number;
      }
    >;
  }>;
}

export interface MonitoringCorrelationResponse {
  success: boolean;
  matrix: number[][];
  metrics: string[];
}

// Helper to build query string from monitoring filters
function _monitoringParams(
  filters?: MonitoringFilters,
  extra?: Record<string, string | number | undefined>
): string {
  const params = new URLSearchParams();
  if (filters?.environment) params.append('environment', filters.environment);
  if (filters?.source_name) params.append('source_name', filters.source_name);
  if (filters?.source_component) params.append('source_component', filters.source_component);
  if (filters?.source_type) params.append('source_type', filters.source_type);
  if (filters?.metric_category) params.append('metric_category', filters.metric_category);
  if (filters?.metric_name) params.append('metric_name', filters.metric_name);
  if (filters?.time_start) params.append('time_start', filters.time_start);
  if (filters?.time_end) params.append('time_end', filters.time_end);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined) params.append(k, String(v));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Get monitoring score trends over time (DuckDB-backed)
 */
export async function getMonitoringTrends(
  filters: MonitoringFilters,
  metrics: string[],
  granularity: MonitoringChartGranularity = 'daily'
): Promise<MonitoringTrendsResponse> {
  const qs = _monitoringParams(filters, {
    metrics: metrics.join(','),
    granularity,
  });
  return fetchApi(`/api/monitoring/analytics/trends${qs}`);
}

/**
 * Get latency distribution histogram and percentiles (DuckDB-backed)
 */
export async function getMonitoringLatencyDist(
  filters: MonitoringFilters,
  bins: number = 20,
  groupBy?: string
): Promise<MonitoringLatencyDistResponse> {
  const qs = _monitoringParams(filters, {
    bins,
    group_by: groupBy,
  });
  return fetchApi(`/api/monitoring/analytics/latency-distribution${qs}`);
}

/**
 * Get class-level score distributions (DuckDB-backed)
 */
export async function getMonitoringClassDist(
  filters: MonitoringFilters,
  metric: string,
  groupBy: string
): Promise<MonitoringClassDistResponse> {
  const qs = _monitoringParams(filters, {
    metric,
    group_by: groupBy,
  });
  return fetchApi(`/api/monitoring/analytics/class-distribution${qs}`);
}

/**
 * Get metric pass/fail breakdown (DuckDB-backed)
 */
export async function getMonitoringMetricBreakdown(
  filters: MonitoringFilters,
  metrics: string[],
  groupBy?: string,
  threshold: number = 0.5
): Promise<MonitoringMetricBreakdownResponse> {
  const qs = _monitoringParams(filters, {
    metrics: metrics.join(','),
    group_by: groupBy,
    threshold,
  });
  return fetchApi(`/api/monitoring/analytics/metric-breakdown${qs}`);
}

/**
 * Get metric correlation matrix (DuckDB-backed)
 */
export async function getMonitoringCorrelation(
  filters: MonitoringFilters,
  metrics: string[]
): Promise<MonitoringCorrelationResponse> {
  const qs = _monitoringParams(filters, {
    metrics: metrics.join(','),
  });
  return fetchApi(`/api/monitoring/analytics/correlation${qs}`);
}

// ============================================
// Monitoring Summary KPIs API
// ============================================

export interface MonitoringSummaryResponse {
  success: boolean;
  kpis: {
    total_records: number;
    avg_score: number;
    pass_rate: number;
    p50_latency: number;
    p95_latency: number;
    p99_latency: number;
  };
}

/**
 * Get lightweight summary KPIs for monitoring dashboard (DuckDB-backed)
 */
export async function getMonitoringSummary(
  filters: MonitoringFilters
): Promise<MonitoringSummaryResponse> {
  const qs = _monitoringParams({ ...filters, metric_category: 'SCORE' });
  return fetchApi(`/api/monitoring/analytics/summary${qs}`);
}

// ============================================
// Classification Metrics API
// ============================================

/**
 * Get classification metric breakdown (DuckDB-backed)
 */
export async function getClassificationBreakdown(
  filters: MonitoringFilters,
  metricName?: string,
  groupBy?: string,
  categorySource: 'explanation' | 'actual_output' = 'explanation'
): Promise<ClassificationBreakdownResponse> {
  const qs = _monitoringParams(
    { ...filters, metric_name: metricName || filters.metric_name },
    {
      group_by: groupBy,
      category_source: categorySource,
    }
  );
  return fetchApi(`/api/monitoring/analytics/classification-breakdown${qs}`);
}

/**
 * Get classification metric trends over time (DuckDB-backed)
 */
export async function getClassificationTrends(
  filters: MonitoringFilters,
  metricName: string,
  granularity: MonitoringChartGranularity = 'daily',
  categorySource: 'explanation' | 'actual_output' = 'explanation'
): Promise<ClassificationTrendResponse> {
  const qs = _monitoringParams(
    { ...filters, metric_name: metricName },
    {
      granularity,
      category_source: categorySource,
    }
  );
  return fetchApi(`/api/monitoring/analytics/classification-trends${qs}`);
}

// ============================================
// Analysis Metrics API
// ============================================

/**
 * Get analysis insights (DuckDB-backed)
 */
export async function getAnalysisInsights(
  filters: MonitoringFilters,
  metricName?: string,
  page: number = 1,
  limit: number = 20
): Promise<AnalysisInsightsResponse> {
  const qs = _monitoringParams(
    { ...filters, metric_name: metricName || filters.metric_name },
    { page, limit }
  );
  return fetchApi(`/api/monitoring/analytics/analysis-insights${qs}`);
}

// ============================================
// Evaluation Runner API
// ============================================

/**
 * Get available evaluation metrics from the registry
 */
export async function evalRunnerGetMetrics(): Promise<EvalRunnerMetricsResponse> {
  return fetchApi('/api/eval-runner/metrics');
}

/**
 * Upload a CSV dataset for evaluation
 */
export async function evalRunnerUploadDataset(file: File): Promise<EvalRunnerUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/eval-runner/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Dataset upload failed');
  }

  return response.json();
}

/**
 * Load the built-in example evaluation dataset from the backend
 */
export async function evalRunnerLoadExample(): Promise<EvalRunnerUploadResponse> {
  return fetchApi('/api/eval-runner/example/sample');
}

/**
 * Test agent connection with a sample query
 */
export async function evalRunnerTestConnection(
  agentConfig: EvalRunnerAgentConfig,
  sampleQuery: string = 'Hello, how are you?'
): Promise<EvalRunnerTestConnectionResponse> {
  return fetchApi('/api/eval-runner/test-connection', {
    method: 'POST',
    body: JSON.stringify({
      agent_config: agentConfig,
      sample_query: sampleQuery,
    }),
  });
}

/**
 * Run evaluation synchronously (non-streaming)
 */
export async function evalRunnerRun(
  evaluationName: string,
  data: Record<string, unknown>[],
  columnMapping: EvalRunnerColumnMapping,
  metrics: string[],
  modelName: string = 'gpt-4o',
  llmProvider: LLMProvider = 'openai',
  maxConcurrent: number = 5,
  agentConfig?: EvalRunnerAgentConfig | null,
  thresholds?: Record<string, number> | null
): Promise<EvalRunnerResultResponse> {
  const request: EvalRunnerRunRequest = {
    evaluation_name: evaluationName,
    dataset: {
      columns: columnMapping,
      data,
    },
    agent_config: agentConfig ?? null,
    metrics,
    model_name: modelName,
    llm_provider: llmProvider,
    max_concurrent: maxConcurrent,
    thresholds: thresholds ?? null,
  };

  return fetchApi('/api/eval-runner/run', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * SSE streaming handlers for eval runner
 */
export interface EvalRunnerSSEHandlers {
  onProgress?: (data: {
    current: number;
    total: number;
    metric?: string;
    item_id?: string;
    status: string;
    phase?: string;
    message?: string;
  }) => void;
  onLog?: (data: { timestamp: string; level: string; message: string }) => void;
  onComplete?: (data: { run_id: string; summary: unknown }) => void;
  onError?: (data: { message: string; details?: string }) => void;
  onDone?: () => void;
}

/**
 * Run evaluation with SSE streaming for progress updates
 */
export function evalRunnerRunStream(
  evaluationName: string,
  data: Record<string, unknown>[],
  columnMapping: EvalRunnerColumnMapping,
  metrics: string[],
  modelName: string = 'gpt-4o',
  llmProvider: LLMProvider = 'openai',
  maxConcurrent: number = 5,
  agentConfig?: EvalRunnerAgentConfig | null,
  thresholds?: Record<string, number> | null,
  handlers?: EvalRunnerSSEHandlers
): AbortController {
  const controller = new AbortController();

  const request: EvalRunnerRunRequest = {
    evaluation_name: evaluationName,
    dataset: {
      columns: columnMapping,
      data,
    },
    agent_config: agentConfig ?? null,
    metrics,
    model_name: modelName,
    llm_provider: llmProvider,
    max_concurrent: maxConcurrent,
    thresholds: thresholds ?? null,
  };

  const streamData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/eval-runner/run/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        handlers?.onError?.({ message: error.detail || `API error: ${response.status}` });
        handlers?.onDone?.();
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        handlers?.onError?.({ message: 'No response body' });
        handlers?.onDone?.();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      // Persist across chunks — event/data lines may arrive in different chunks
      // than the blank line terminator
      let currentEvent: string | null = null;
      let currentData = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Parse SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();

          if (trimmedLine.startsWith('event:')) {
            currentEvent = trimmedLine.slice(6).trim();
          } else if (trimmedLine.startsWith('data:')) {
            currentData = trimmedLine.slice(5).trim();
          } else if (trimmedLine === '' && currentEvent) {
            // Blank line = end of SSE event, dispatch it
            try {
              const parsed = currentData ? JSON.parse(currentData) : {};

              switch (currentEvent) {
                case 'progress':
                  handlers?.onProgress?.(parsed);
                  break;
                case 'log':
                  handlers?.onLog?.(parsed);
                  break;
                case 'complete':
                  handlers?.onComplete?.(parsed);
                  break;
                case 'error':
                  handlers?.onError?.(parsed);
                  break;
                case 'done':
                  handlers?.onDone?.();
                  break;
              }
            } catch {
              // Skip malformed JSON
            }

            currentEvent = null;
            currentData = '';
          }
        }
      }

      handlers?.onDone?.();
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        handlers?.onDone?.();
        return;
      }
      handlers?.onError?.({
        message: error instanceof Error ? error.message : 'Stream failed',
      });
      handlers?.onDone?.();
    }
  };

  streamData();
  return controller;
}

// Memory/Graph API — re-exported from plugin module
export {
  getMemoryConfig,
  updateMemoryRule,
  uploadMemoryFile,
  createMemoryRule,
  deleteMemoryRule,
  getMemoryGraph,
  getMemoryGraphSummary,
  searchMemoryGraph,
  getMemoryGraphNeighborhood,
} from './api/memory-api';
export type {
  GraphResponse,
  GraphSearchResponse,
  GraphNeighborhoodResponse,
  GraphSummaryResponse,
} from './api/memory-api';

// Agent Replay API — re-exported from plugin module
export { getReplayStatus, getRecentTraces, getTraceDetail, getStepDetail } from './api/replay-api';

// ============================================
// DuckDB Store API
// ============================================

/**
 * Paginated data response from the store
 */
export interface StoreDataResponse {
  success: boolean;
  data: Record<string, unknown>[];
  total: number;
  page: number;
  page_size: number;
}

/**
 * Fetch paginated data from a DuckDB-backed dataset
 */
export async function getStoreData(
  dataset: 'monitoring' | 'human_signals' | 'eval',
  params?: {
    page?: number;
    page_size?: number;
    sort_by?: string;
    sort_dir?: 'asc' | 'desc';
    environment?: string;
    source_name?: string;
    source_component?: string;
    source_type?: string;
    metric_name?: string;
    metric_category?: string;
    time_start?: string;
    time_end?: string;
    search?: string;
    columns?: string;
  }
): Promise<StoreDataResponse> {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
    }
  }
  const query = qs.toString();
  return fetchApi(`/api/store/data/${dataset}${query ? `?${query}` : ''}`);
}

/**
 * Get sync status for all datasets
 */
export async function getStoreStatus(): Promise<StoreStatusResponse> {
  return fetchApi('/api/store/status');
}

/**
 * Get metadata (columns, filter values, time range) for a dataset
 */
export async function getDatasetMetadata(
  dataset: 'monitoring' | 'human_signals' | 'eval'
): Promise<DatasetMetadataResponse> {
  return fetchApi(`/api/store/metadata/${dataset}`);
}

/**
 * Trigger sync for all datasets
 */
export async function triggerSync(): Promise<{ success: boolean; message: string }> {
  return fetchApi('/api/store/sync', { method: 'POST' });
}

/**
 * Trigger sync for a single dataset
 */
export async function triggerDatasetSync(
  dataset: 'monitoring' | 'human_signals' | 'eval'
): Promise<{ success: boolean; message: string }> {
  return fetchApi(`/api/store/sync/${dataset}`, { method: 'POST' });
}

// ============================================
// Agent KPI API
// ============================================

function _kpiParams(filters?: KpiFilters): string {
  if (!filters) return '';
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export async function getKpiCategories(filters?: KpiFilters): Promise<KpiCategoriesResponse> {
  return fetchApi(`/api/kpi/categories${_kpiParams(filters)}`);
}

export async function getKpiTrends(
  filters?: KpiFilters,
  kpiNames?: string[]
): Promise<KpiTrendsResponse> {
  const qs = new URLSearchParams();
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
    }
  }
  if (kpiNames && kpiNames.length > 0) {
    qs.append('kpi_names', kpiNames.join(','));
  }
  const s = qs.toString();
  return fetchApi(`/api/kpi/trends${s ? `?${s}` : ''}`);
}

export async function getKpiFilters(): Promise<KpiFiltersResponse> {
  return fetchApi('/api/kpi/filters');
}
