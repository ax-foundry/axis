---
icon: custom/rest-api
---

# REST API

AXIS uses FastAPI which auto-generates OpenAPI documentation. When the backend is running, access the interactive docs at:

- **Swagger UI**: [http://localhost:8500/docs](http://localhost:8500/docs)
- **ReDoc**: [http://localhost:8500/redoc](http://localhost:8500/redoc)

## Endpoint Groups

| Tag | Prefix | Description |
|-----|--------|-------------|
| `config` | `/api/config` | Theme configuration and app settings |
| `data` | `/api/data` | CSV upload, format detection, data processing |
| `analytics` | `/api/analytics` | Statistical aggregations, charts, KPIs |
| `ai` | `/api/ai` | AI Copilot with streaming SSE responses |
| `align` | `/api/align` | Calibration and alignment workflows |
| `reports` | `/api/reports` | Report generation and issue extraction |
| `database` | `/api/database` | PostgreSQL connection, schema browsing, import |
| `human-signals` | `/api/human-signals` | Human signals upload and processing |
| `monitoring` | `/api/monitoring` | Monitoring data upload and management |
| `monitoring-analytics` | `/api/monitoring/analytics` | Summary KPIs, trends, breakdowns, latency, classification, correlation, analysis |
| `eval-runner` | `/api/eval-runner` | Batch evaluation execution via Axion |
| `memory` | `/api/memory` | Decision memory, rules, hard stops, batches |
| `graph` | `/api/memory/graph` | Knowledge graph queries and visualization |
| `kpi` | `/api/kpi` | Agent KPI categories, trends, and filter values for the Production dashboard |
| `agent-replay` | `/api/agent-replay` | Langfuse trace replay: search, detail, node inspection, reviews |
| `store` | `/api/store` | DuckDB analytics store: sync, status, metadata, paginated data, watermark management |

## Health Checks

```bash
# Simple health check
curl http://localhost:8500/

# Detailed health check
curl http://localhost:8500/health
```

## Authentication

AXIS does not currently implement authentication. Secure access at the network level using a reverse proxy or firewall rules.

## Response Format

Most endpoints return a consistent shape:

=== "Success"

    ```json
    {
      "success": true,
      "data": { ... },
      "message": "Optional message"
    }
    ```

=== "Error"

    ```json
    {
      "detail": "Description of what went wrong"
    }
    ```

## Streaming (SSE)

Several endpoints use Server-Sent Events for real-time streaming:

### AI Copilot SSE

The copilot endpoint (`POST /api/ai/copilot/stream`) streams thoughts and responses:

```
event: thought
data: {"content": "Analyzing the data..."}

event: response
data: {"result": "Here are the findings..."}

event: done
data:
```

### Report Generation SSE

The report endpoint (`POST /api/reports/generate/stream`) streams progress, structured insights, and the final report:

```
event: thought
data: {"content": "Extracting issues from evaluation data..."}

event: thought
data: {"content": "Analyzing patterns across metrics..."}

event: insights
data: {"patterns": [...], "learnings": [...], "total_issues_analyzed": 42, "pipeline_metadata": {...}}

event: response
data: {"success": true, "report_text": "...", "issues_analyzed": 42, "metrics_covered": [...], "insights": {...}}

event: done
data:
```

The `insights` event delivers structured cross-metric pattern analysis before the final report. If insight extraction fails, the event is skipped and the report still completes successfully.

!!! tip "Reverse proxy configuration"
    If using Nginx, disable proxy buffering for SSE paths (`/api/ai/`, `/api/reports/`) to ensure events stream correctly. See the [production deployment guide](../deployment/production.md) for details.

## Key Endpoint Details

### Config Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config/theme` | GET | Active palette, all palettes, and branding text |
| `/api/config/visibility` | GET | Visibility config for KPIs, monitoring metrics, signals |
| `/api/config/agents` | GET | Agent registry (name, label, role, avatar, trace_names) |
| `/api/config/features` | GET | Feature flags (`eval_runner_enabled`, `copilot_enabled`) |
| `/api/config/plugins` | GET | All discovered plugins with enabled/disabled status |
| `/api/config/memory` | GET | Memory module config (deprecated — use `/api/memory/config`) |

### Data Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/data/upload` | POST | Upload and process a CSV file |
| `/api/data/detect-format` | POST | Detect CSV format without full processing |
| `/api/data/convert-tree` | POST | Convert tree format data to wide format for analytics |
| `/api/data/prepare-analytics` | POST | Prepare uploaded data for analytics visualization |
| `/api/data/example/{dataset_name}` | GET | Load a built-in example dataset |
| `/api/data/eval-db-config` | GET | Get the evaluation database auto-load configuration |
| `/api/data/eval-db-import` | POST | Auto-import evaluation data from the configured database |

### Analytics Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analytics/summary` | POST | Calculate summary statistics for metrics |
| `/api/analytics/distribution` | POST | Distribution data for a specific metric. `metric`, `bins` (default 20) |
| `/api/analytics/comparison` | POST | Compare metrics across groups. `group_by`, `metrics` |
| `/api/analytics/correlation` | POST | Correlation matrix between selected metrics |
| `/api/analytics/radar` | POST | Radar chart data for multi-metric comparison |
| `/api/analytics/scatter` | POST | Scatter plot data. `x_metric`, `y_metric`, `color_by` |

### AI Copilot Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/chat` | POST | Chat with the AI copilot |
| `/api/ai/query` | POST | Query evaluation data using natural language |
| `/api/ai/analyze` | POST | Generate automated analysis of evaluation data |
| `/api/ai/status` | GET | Check AI service status and configuration |
| `/api/ai/copilot/stream` | POST | Stream copilot responses with real-time thoughts (SSE) |
| `/api/ai/copilot/chat` | POST | Non-streaming copilot endpoint for simple requests |
| `/api/ai/copilot/skills` | GET | List available copilot skills/tools |

### Calibration (Align) Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/align/evaluate` | POST | Run LLM judge evaluation on a dataset |
| `/api/align/metrics` | POST | Calculate alignment metrics (Cohen's Kappa, confusion matrix) |
| `/api/align/analyze-misalignment` | POST | Analyze patterns in misaligned cases |
| `/api/align/optimize-prompt` | POST | Generate an optimized judge prompt from misalignment patterns |
| `/api/align/suggest-examples` | POST | Suggest few-shot examples from annotated data |
| `/api/align/cluster-patterns` | POST | Discover error patterns and learning insights from annotations using the EvidencePipeline. Accepts optional `domain_context` for domain-aware analysis |
| `/api/align/models` | GET | List available LLM models |
| `/api/align/save-config` | POST | Save a judge configuration |
| `/api/align/configs` | GET | List all saved judge configurations |
| `/api/align/configs/{config_id}` | GET | Get a specific saved configuration |
| `/api/align/configs/{config_id}` | DELETE | Delete a saved configuration |
| `/api/align/defaults` | GET | Default prompt templates and evaluation criteria |
| `/api/align/status` | GET | Align service status and configured providers |

### Report Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/reports/generate/stream` | POST | Stream report generation with real-time thoughts, structured insights, and final report (SSE). Runs issue extraction, then LLM report and InsightExtractor pattern analysis concurrently |
| `/api/reports/generate` | POST | Non-streaming report generation with optional structured insights |
| `/api/reports/extract-issues` | POST | Extract issues without LLM generation (preview before report) |
| `/api/reports/status` | GET | Report generation service status |

Both generate endpoints validate the specific requested LLM `provider` (not just "any provider configured") and return a clear error if the requested provider is not available.

### Database Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/database/defaults` | GET | Default connection values from YAML config or env vars. `store` param: `data`, `monitoring`, `human_signals` |
| `/api/database/connect` | POST | Test connection and return a handle (15-min TTL) |
| `/api/database/{handle}/tables` | GET | List available tables in the connected database |
| `/api/database/{handle}/schema` | GET | Column schema and sample values for a table |
| `/api/database/{handle}/distinct-values` | POST | Distinct values for a column (for filter dropdowns) |
| `/api/database/{handle}/preview` | POST | Preview data with optional column mappings |
| `/api/database/{handle}/query` | POST | Preview results of a SQL query |
| `/api/database/{handle}/query-import` | POST | Import data from a SQL query |
| `/api/database/{handle}/import` | POST | Import data from a table into AXIS |
| `/api/database/{handle}` | DELETE | Disconnect and invalidate a connection handle |
| `/api/database/stats` | GET | Connection pool statistics |

### Eval Runner Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/eval-runner/metrics` | GET | All available evaluation metrics |
| `/api/eval-runner/example/sample` | GET | Load the built-in example evaluation dataset |
| `/api/eval-runner/upload` | POST | Upload a CSV dataset for evaluation |
| `/api/eval-runner/test-connection` | POST | Test agent connection with a sample query |
| `/api/eval-runner/run` | POST | Run evaluation synchronously and return results |
| `/api/eval-runner/run/stream` | POST | Run evaluation with SSE streaming progress updates |
| `/api/eval-runner/export/{run_id}/csv` | GET | Export evaluation results as CSV |
| `/api/eval-runner/export/{run_id}/json` | GET | Export evaluation results as JSON |

Requires `eval_runner_enabled: true` in `eval_db.yaml`.

### Human Signals Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/human-signals/upload` | POST | Upload and process a human signals CSV file |
| `/api/human-signals/example/{dataset_name}` | GET | Load an example human signals dataset |
| `/api/human-signals/db-config` | GET | Human signals database auto-load configuration |
| `/api/human-signals/db-import` | POST | Auto-import human signals data from the configured database |
| `/api/human-signals/cases` | GET | Query pre-aggregated cases from DuckDB. `page`, `page_size` |
| `/api/human-signals/metric-schema` | GET | Human signals metric schema from DuckDB metadata |

### Monitoring Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/monitoring/upload` | POST | Upload and process a monitoring CSV file |
| `/api/monitoring/example/{dataset_name}` | GET | Load an example monitoring dataset |
| `/api/monitoring/db-config` | GET | Monitoring database auto-load configuration |
| `/api/monitoring/db-import` | POST | Auto-import monitoring data from the configured database |

### Memory Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/memory/config` | GET | Memory module configuration (field roles, labels, filters) |
| `/api/memory/summary` | GET | Aggregate summary: counts, action distribution, product distribution |
| `/api/memory/rules` | GET | Filterable list of all extracted rules |
| `/api/memory/rules/quality` | GET | Rules split by decision quality (aligned, divergent, partial) |
| `/api/memory/rules/soft-thresholds` | GET | Rules with soft thresholds |
| `/api/memory/hard-stops` | GET | Unmitigated decline rules (hard stops) |
| `/api/memory/batches` | GET | Pipeline batch history |
| `/api/memory/trace` | GET | Decision trace path for a single rule |
| `/api/memory/conflicts` | GET | Contradictory actions within the same risk factor |
| `/api/memory/status-counts` | GET | Count rules by ingestion status |
| `/api/memory/upload` | POST | Upload a CSV file containing rule extractions |
| `/api/memory/rules` | POST | Create a new rule |
| `/api/memory/rules/{rule_id}` | PUT | Update an extracted rule |
| `/api/memory/rules/{rule_id}` | DELETE | Delete a rule |

### Knowledge Graph Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/memory/graph/status` | GET | FalkorDB connection health |
| `/api/memory/graph/summary` | GET | Graph summary statistics (node/edge counts) |
| `/api/memory/graph/` | GET | Full graph or filtered subset. `limit`, `risk_factor`, `product_type`, `action`, `node_type` |
| `/api/memory/graph/search` | GET | Search nodes by name (case-insensitive substring) |
| `/api/memory/graph/neighborhood` | GET | Neighborhood subgraph around a specific node. `node_id`, `depth` |

### Store Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/store/sync` | POST | Sync all datasets. `?full=true` forces full rebuild |
| `/api/store/sync/{dataset}` | POST | Sync single dataset (monitoring, human_signals, eval) |
| `/api/store/sync/{dataset}/reset-watermark` | POST | Clear watermarks — next sync does full rebuild |
| `/api/store/status` | GET | Per-table sync status with watermarks and refresh intervals |
| `/api/store/metadata/{dataset}` | GET | Columns, time range, filter values, summary stats |
| `/api/store/data/{dataset}` | GET | Paginated data with filters, sorting, column projection, search |

### Monitoring Analytics Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/monitoring/analytics/summary` | GET | Lightweight KPIs (total, avg score, pass rate, latency p50/p95/p99) |
| `/api/monitoring/analytics/trends` | GET | Time-series by granularity (hourly/daily/weekly) |
| `/api/monitoring/analytics/metric-breakdown` | GET | Pass rate and average per metric with optional group-by |
| `/api/monitoring/analytics/latency-distribution` | GET | Histogram with percentiles and optional group-by |
| `/api/monitoring/analytics/class-distribution` | GET | Score distributions grouped by dimension |
| `/api/monitoring/analytics/correlation` | GET | Correlation matrix between metrics |
| `/api/monitoring/analytics/classification-breakdown` | GET | Category value counts for CLASSIFICATION metrics |
| `/api/monitoring/analytics/classification-trends` | GET | Time-series for CLASSIFICATION categories |
| `/api/monitoring/analytics/analysis-insights` | GET | Paginated ANALYSIS metric records with signals |

All monitoring analytics endpoints accept common filter parameters: `environment`, `source_name`, `source_component`, `source_type`, `metric_name`, `metric_category`, `time_start`, `time_end`.

### KPI Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/kpi/categories` | GET | Category panels with KPI cards, sparklines, and trend directions |
| `/api/kpi/trends` | GET | Trend data for expanded panels (lazy-loaded). `kpi_names` is comma-separated |
| `/api/kpi/filters` | GET | Available filter values for dropdowns |

KPI endpoints accept filter parameters: `source_name`, `kpi_category`, `environment`, `source_type`, `time_start`, `time_end`.

### Agent Replay Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agent-replay/status` | GET | Replay service status (Langfuse connectivity, search DB availability) |
| `/api/agent-replay/agents` | GET | List of configured agents (discovered from `LANGFUSE_*` env vars) |
| `/api/agent-replay/search` | GET | Search traces by ID or business field. `search_by`: `trace_id` or `field` |
| `/api/agent-replay/traces` | GET | List recent traces with optional `name`, `tags`, `agent` filters |
| `/api/agent-replay/traces/{trace_id}` | GET | Full trace detail with observation tree |
| `/api/agent-replay/traces/{trace_id}/nodes/{node_id}` | GET | Single observation node detail (input, output, metadata) |
| `/api/agent-replay/traces/{trace_id}/steps/{index}` | GET | Step detail by index |
| `/api/agent-replay/reviews` | POST | Submit a review (verdict, failure step, rationale) |
| `/api/agent-replay/traces/{trace_id}/reviews` | GET | Retrieve reviews for a trace |
| `/api/agent-replay/datasets` | GET | List available Langfuse datasets |

All Agent Replay endpoints require `AGENT_REPLAY_ENABLED=true`. The optional `agent` query parameter selects per-agent Langfuse credentials and search DB overrides.
