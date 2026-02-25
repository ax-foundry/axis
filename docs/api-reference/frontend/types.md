---
icon: custom/data-formats
---

# TypeScript Types

!!! note "Hand-written reference"
    This page is manually maintained. See [`frontend/src/types/index.ts`](https://github.com/ax-foundry/axis/blob/master/frontend/src/types/index.ts) for the definitive source.

All types are defined in a single file and imported via `@/types`.

## Constants

### Columns

Column name constants shared with the Python backend:

```typescript
export const Columns = {
  ID: 'id',
  EXPERIMENT_NAME: 'evaluation_name',
  QUERY: 'query',
  ACTUAL_OUTPUT: 'actual_output',
  EXPECTED_OUTPUT: 'expected_output',
  METRIC_NAME: 'metric_name',
  METRIC_SCORE: 'metric_score',
  WEIGHT: 'weight',
  METRIC_TYPE: 'metric_type',
  PARENT: 'parent',
} as const;
```

### Thresholds

Score thresholds for pass/fail and color coding:

```typescript
export const Thresholds = {
  PASSING_RATE: 0.5,
  GREEN_THRESHOLD: 0.7,
  RED_THRESHOLD: 0.3,
} as const;
```

### UIConfig

```typescript
export const UIConfig = {
  ITEMS_PER_PAGE: 3,
  CONTENT_TRUNC_LENGTH: 200,
} as const;
```

### ChartColors

Color palette for multi-series charts:

```typescript
export const ChartColors = [
  '#8B9F4F', '#A4B86C', '#6B7A3A', '#B8C78A',
  '#D4AF37', '#B8C5D3', '#D4E0B8', '#1f77b4',
  '#ff7f0e', '#2ca02c',
];
```

---

## Evaluation Types

### DataFormat

```typescript
type DataFormat =
  | 'tree_format'
  | 'flat_format'
  | 'simple_judgment'
  | 'fresh_annotation'
  | 'unknown';
```

### EvaluationRecord

Core record type for evaluation data. Varies by format but always has ID, query, and output:

```typescript
interface EvaluationRecord {
  [Columns.ID]: string;
  [Columns.QUERY]: string;
  [Columns.ACTUAL_OUTPUT]: string;
  [key: string]: unknown;
}
```

### MetricSummary

```typescript
interface MetricSummary {
  metric: string;
  count: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  median: number;
  pass_rate: number;
}
```

### ComparisonRow

Used in the Compare view for side-by-side model comparison:

```typescript
interface ComparisonRow {
  id: string;
  query: string;
  actualOutput: string;
  experimentName?: string;
  metrics: Record<string, number>;
  overallScore: number;
  metadata?: Record<string, unknown>;
}
```

---

## Monitoring Types

### MonitoringRecord

Supports both long format (metric_name + metric_score) and wide format (dynamic `*_score` columns):

```typescript
interface MonitoringRecord {
  dataset_id: string;
  timestamp: string;
  query?: string;
  actual_output?: string;

  // Long format
  metric_name?: string;
  metric_score?: number;
  metric_type?: string;
  metric_category?: MetricCategory;

  // Source metadata
  environment?: string;
  source_name?: string;
  source_component?: string;
  source_type?: string;

  // Observability
  trace_id?: string;
  latency?: number;

  // Wide format: dynamic columns
  [metricName: string]: unknown;
}
```

### MetricCategory

```typescript
type MetricCategory = 'SCORE' | 'ANALYSIS' | 'CLASSIFICATION';
```

| Category | Description | Example |
|----------|-------------|---------|
| `SCORE` | Numeric value (0-1) for charts and thresholds | `0.85` |
| `ANALYSIS` | Structured insights/reasoning (JSON) | `{"issues": [...]}` |
| `CLASSIFICATION` | Categorical label for breakdowns | `"POSITIVE"` |

### MonitoringGroupBy

```typescript
type MonitoringGroupBy =
  | 'environment'
  | 'source_name'
  | 'source_component'
  | 'source_type'
  | 'evaluation_name'
  | null;
```

---

## Signals Types

### SignalsMetricSchema

Describes the metrics available in a signals dataset (V2 format):

```typescript
interface SignalsMetricSchema {
  [metricName: string]: {
    signals: string[];
    signal_types: Record<string, string>;
  };
}
```

### SignalsDisplayConfig

Display overrides from `custom/config/signals_metrics.yaml`:

```typescript
interface SignalsDisplayConfig {
  [metricName: string]: {
    label?: string;
    description?: string;
    chart_type?: string;
    signals?: Record<string, { label?: string; format?: string }>;
  };
}
```

---

## Memory Types

### MemoryRuleRecord

```typescript
interface MemoryRuleRecord {
  rule_id: string;
  rule_text: string;
  category: string;
  severity: string;
  batch_id: string;
  is_hard_stop: boolean;
  confidence: number;
  source_context?: string;
  created_at?: string;
}
```

---

## Graph Types

### GraphNode / GraphEdge / GraphData

```typescript
interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
}

interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  properties: Record<string, unknown>;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
```

---

## Calibration (Align) Types

### LearningArtifact

Actionable learning insight produced by the EvidencePipeline during pattern clustering:

```typescript
interface LearningArtifact {
  insight: string;
  recommended_action: string;
  supporting_evidence: string[];
  counterexamples: string[];
  confidence: number;
  scope: string;
  metadata: Record<string, unknown>;
}
```

### PipelineMetadata

Metadata about the pattern discovery pipeline execution:

```typescript
interface PipelineMetadata {
  clustering_method: string;
  num_clusters: number;
  total_annotations: number;
  silhouette_score: number | null;
  processing_time_seconds: number | null;
}
```

---

## Report Insight Types

### InsightPattern

A structured cross-metric pattern discovered by the InsightExtractor:

```typescript
interface InsightPattern {
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
```

| Field | Description |
|-------|-------------|
| `category` | Pattern category name (e.g., "Hallucination", "Context Gaps") |
| `is_cross_metric` | Whether this pattern spans multiple metrics |
| `confidence` | Confidence score (0-1), or `null` if not computed |
| `distinct_test_cases` | Number of unique test cases exhibiting this pattern |
| `metrics_involved` | Which evaluation metrics this pattern affects |

### InsightResult

Container for all insights from a report generation run:

```typescript
interface InsightResult {
  patterns: InsightPattern[];
  learnings: LearningArtifact[];
  total_issues_analyzed: number;
  pipeline_metadata: PipelineMetadata | null;
}
```

### ReportResponse

Response from the report generation endpoint:

```typescript
interface ReportResponse {
  success: boolean;
  report_text: string;
  issues_analyzed: number;
  metrics_covered: string[];
  insights?: InsightResult | null;
}
```

### SSEEventType

Event types used in Server-Sent Event streams:

```typescript
type SSEEventType = 'thought' | 'response' | 'insights' | 'error' | 'done' | 'ping';
```

---

## Theme Types

### ThemeConfigResponse

```typescript
interface ThemeConfigResponse {
  active: string;
  palettes: Record<string, ThemePalette>;
  hero: ThemeHero;
  branding: ThemeBranding;
}
```
