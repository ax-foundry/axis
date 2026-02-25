---
icon: custom/rest-api
---

# API Client

!!! note "Hand-written reference"
    This page is manually maintained. See [`frontend/src/lib/api.ts`](https://github.com/ax-foundry/axis/blob/master/frontend/src/lib/api.ts) for the definitive source.

The API client provides typed functions for all backend endpoints. It is built on the browser `fetch` API with a centralized `fetchApi<T>()` helper.

## Base Configuration

```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8500';
```

## Core Helper

### `fetchApi<T>(endpoint, options?)`

Generic typed fetch wrapper. Prepends `API_BASE_URL`, sets `Content-Type: application/json`, and maps error responses to `Error` objects.

```typescript
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T>
```

## Data Endpoints

| Function | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| `uploadFile(file)` | POST | `/api/data/upload` | Upload a CSV file (multipart/form-data) |
| `loadExampleDataset(name)` | GET | `/api/data/example/{name}` | Load a built-in example dataset |
| `getEvalDBConfig()` | GET | `/api/data/eval-db-config` | Get eval database configuration |
| `autoImportEvalFromDB()` | POST | `/api/data/eval-db-import` | Auto-import from configured eval DB |

## Analytics Endpoints

| Function | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| `getSummaryStats(data)` | POST | `/api/analytics/summary` | Compute metric summaries |
| `getDistribution(data, metric, bins?)` | POST | `/api/analytics/distribution` | Score distribution + histogram |
| `getComparison(data, groupBy, metrics?)` | POST | `/api/analytics/comparison` | Group-by comparison |
| `getCorrelation(data, metrics?)` | POST | `/api/analytics/correlation` | Correlation matrix |
| `getRadarData(data, metrics, groupBy?)` | POST | `/api/analytics/radar` | Radar chart traces |
| `getScatterData(data, x, y, colorBy?)` | POST | `/api/analytics/scatter` | Scatter plot data |

## AI Endpoints

| Function | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| `chat(messages, dataContext?)` | POST | `/api/ai/chat` | AI copilot chat |
| `analyzeData(data, focus?)` | POST | `/api/ai/analyze` | Automated data analysis |
| `getAIStatus()` | GET | `/api/ai/status` | AI service status |

## Store Endpoints (DuckDB Analytics)

| Function | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| `syncStore(dataset?)` | POST | `/api/store/sync` | Sync all or single dataset. `?full=true` forces rebuild |
| `syncStoreDataset(dataset)` | POST | `/api/store/sync/{dataset}` | Sync a single dataset |
| `resetStoreWatermark(dataset)` | POST | `/api/store/sync/{dataset}/reset-watermark` | Clear watermarks for next full rebuild |
| `getStoreStatus()` | GET | `/api/store/status` | Per-table sync status, watermarks, refresh intervals |
| `getStoreMetadata(dataset)` | GET | `/api/store/metadata/{dataset}` | Columns, time range, filter values, summary stats |
| `getStoreData(dataset, params?)` | GET | `/api/store/data/{dataset}` | Paginated data with filters, sorting, search |

## Monitoring Endpoints

| Function | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| `uploadMonitoringFile(file)` | POST | `/api/monitoring/upload` | Upload monitoring CSV |
| `loadMonitoringExampleDataset(name)` | GET | `/api/monitoring/example/{name}` | Load example monitoring data |
| `getMonitoringDBConfig()` | GET | `/api/monitoring/db-config` | Get monitoring DB config |
| `autoImportMonitoringFromDB()` | POST | `/api/monitoring/db-import` | Auto-import from monitoring DB |

## Monitoring Analytics Endpoints

| Function | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| `getMonitoringSummary(filters?)` | GET | `/api/monitoring/analytics/summary` | Lightweight KPIs (total, avg score, pass rate, latency) |
| `getMonitoringTrends(filters?, metrics?, granularity?)` | GET | `/api/monitoring/analytics/trends` | Time-series trends |
| `getMonitoringLatencyDist(filters?, bins?, groupBy?)` | GET | `/api/monitoring/analytics/latency-distribution` | Latency histogram |
| `getMonitoringClassDist(filters?, metric?, groupBy?)` | GET | `/api/monitoring/analytics/class-distribution` | Class-level distributions |
| `getMonitoringMetricBreakdown(filters?, metrics?, groupBy?, threshold?)` | GET | `/api/monitoring/analytics/metric-breakdown` | Pass/fail breakdown |
| `getMonitoringCorrelation(filters?, metrics?)` | GET | `/api/monitoring/analytics/correlation` | Metric correlation matrix |
| `getClassificationBreakdown(filters?, metric?, groupBy?)` | GET | `/api/monitoring/analytics/classification-breakdown` | Classification counts |
| `getClassificationTrends(filters?, metric?, granularity?)` | GET | `/api/monitoring/analytics/classification-trends` | Classification over time |
| `getAnalysisInsights(filters?, page?, pageSize?)` | GET | `/api/monitoring/analytics/analysis-insights` | Paginated ANALYSIS metric records |

## Human Signals Endpoints

| Function | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| `uploadHumanSignalsFile(file)` | POST | `/api/human-signals/upload` | Upload human signals CSV |
| `loadHumanSignalsExampleDataset(name)` | GET | `/api/human-signals/example/{name}` | Load example human signals data |
| `getHumanSignalsDBConfig()` | GET | `/api/human-signals/db-config` | Get human signals DB config |
| `autoImportHumanSignalsFromDB()` | POST | `/api/human-signals/db-import` | Auto-import from human signals DB |

## Memory Endpoints

| Function | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| `uploadMemoryFile(file)` | POST | `/api/memory/upload` | Upload memory rules CSV |
| `updateMemoryRule(id, updates)` | PUT | `/api/memory/rules/{id}` | Update a memory rule |
| `createMemoryRule(data)` | POST | `/api/memory/rules` | Create a new rule |
| `deleteMemoryRule(id)` | DELETE | `/api/memory/rules/{id}` | Delete a rule |

## Knowledge Graph Endpoints

| Function | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| `getMemoryGraph(filters?)` | GET | `/api/memory/graph` | Get graph nodes and edges |
| `getMemoryGraphSummary()` | GET | `/api/memory/graph/summary` | Graph statistics |
| `searchMemoryGraph(query)` | GET | `/api/memory/graph/search` | Search graph nodes |
| `getMemoryGraphNeighborhood(nodeId, depth?)` | GET | `/api/memory/graph/neighborhood` | Node neighborhood |

## Database Endpoints

| Function | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| `databaseGetDefaults()` | GET | `/api/database/defaults` | Get server-side DB defaults |
| `databaseConnect(conn)` | POST | `/api/database/connect` | Connect and get handle |
| `databaseListTables(handle)` | GET | `/api/database/{handle}/tables` | List tables |
| `databaseGetSchema(handle, table)` | GET | `/api/database/{handle}/schema` | Get table schema |
| `databaseGetDistinctValues(handle, table, column)` | POST | `/api/database/{handle}/distinct-values` | Distinct column values |
| `databasePreview(handle, table, mappings, filters?)` | POST | `/api/database/{handle}/preview` | Preview mapped data |
| `databaseImport(request)` | POST | `/api/database/{handle}/import` | Import data |

## Eval Runner Endpoints

| Function | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| `evalRunnerGetMetrics()` | GET | `/api/eval-runner/metrics` | Available evaluation metrics |
| `evalRunnerUploadDataset(file)` | POST | `/api/eval-runner/upload` | Upload dataset for evaluation |
| `evalRunnerTestConnection(config, query?)` | POST | `/api/eval-runner/test-connection` | Test agent connection |
| `evalRunnerRun(...)` | POST | `/api/eval-runner/run` | Run evaluation (sync) |
| `evalRunnerRunStream(...)` | POST | `/api/eval-runner/run/stream` | Run evaluation (SSE stream) |

## Align Endpoints

| Function | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| `alignEvaluate(records, annotations, config, cols?)` | POST | `/api/align/evaluate` | Run alignment evaluation |
| `alignAnalyzeMisalignment(results, config)` | POST | `/api/align/analyze-misalignment` | Analyze misalignment |
| `alignOptimizePrompt(results, config)` | POST | `/api/align/optimize-prompt` | Optimize judge prompt |
| `alignSuggestExamples(records, annotations, strategy?, count?)` | POST | `/api/align/suggest-examples` | Suggest calibration examples |
| `alignGetModels()` | GET | `/api/align/models` | Available LLM models |
| `alignSaveConfig(name, config, metrics?)` | POST | `/api/align/save-config` | Save judge config |
| `alignGetConfigs()` | GET | `/api/align/configs` | List saved configs |
| `alignDeleteConfig(id)` | DELETE | `/api/align/configs/{id}` | Delete a config |
| `alignGetDefaults()` | GET | `/api/align/defaults` | Default judge settings |
| `alignGetStatus()` | GET | `/api/align/status` | Alignment service status |
| `alignClusterPatterns(annotations, config?, method?, domainContext?)` | POST | `/api/align/cluster-patterns` | Discover error patterns and learning insights via EvidencePipeline. Optional `domainContext` string provides domain-aware analysis |

## Report Endpoints

| Function | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| `generateReport(request)` | POST | `/api/reports/generate` | Generate evaluation report (non-streaming). Response includes optional `insights` field |
| `createReportStream(request, handlers)` | POST | `/api/reports/generate/stream` | Stream report generation via SSE. Handlers: `onThought`, `onInsights`, `onResponse`, `onError`, `onDone` |
| `extractIssuesPreview(request)` | POST | `/api/reports/extract-issues` | Preview extracted issues |
| `getReportStatus()` | GET | `/api/reports/status` | Report service status |

The `createReportStream` function returns an `AbortController` for cancellation. The `onInsights` handler receives an `InsightResult` object with structured cross-metric patterns and learning artifacts.
