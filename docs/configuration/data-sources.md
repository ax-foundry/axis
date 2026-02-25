---
icon: custom/data-sources
---

# Data Sources

AXIS supports two data ingestion patterns: **CSV upload** through the UI (the default) and **Postgres auto-load** via YAML configuration. You can use both at the same time -- each AXIS page (Evaluate, Monitoring, Human Signals) has its own data pipeline.

---

## At a Glance

| | CSV Upload | Postgres Auto-Load |
|---|---|---|
| **Setup effort** | None | YAML config file per database |
| **Data freshness** | Manual -- upload when ready | Automatic on startup + periodic incremental sync |
| **Best for** | Quick exploration, demos, ad-hoc analysis | Production pipelines, recurring data |
| **Pages supported** | Evaluate, Monitoring, Human Signals | Evaluate, Monitoring, Human Signals |
| **Analytics engine** | In-memory (per session) | DuckDB embedded store (persistent) |

---

## Option 1: CSV Upload (Default)

CSV upload requires no configuration. Start the backend and frontend, then drag-and-drop a CSV file through the UI.

### How it works

1. Navigate to the target page (Evaluate, Monitoring, or Human Signals).
2. Use the upload area to select or drag a CSV file.
3. AXIS parses, validates, and normalizes the columns automatically.
4. Data is held in memory for the duration of the session.

### Column normalization

AXIS auto-maps common column name variations to its internal schema. For example:

| Your column name | AXIS maps it to |
|------------------|-----------------|
| `id`, `record_id` | `dataset_id` |
| `input`, `prompt`, `question` | `query` |
| `output`, `response`, `completion` | `actual_output` |
| `expected`, `ground_truth`, `reference` | `expected_output` |
| `time`, `created_at` | `timestamp` |
| `model`, `agent` | `model_name` |
| `score`, `metric_value` | `metric_score` |
| `metric` | `metric_name` |

!!! tip "No pre-processing needed"
    In most cases you can export directly from your evaluation framework or
    observability tool and upload without renaming columns.

---

## Option 2: Postgres Auto-Load

Postgres auto-load executes SQL queries on app startup, syncs data into a local DuckDB analytics store, and populates the dashboard automatically. Each page has its own YAML config file with **split queries** — one for the dataset/records table and one for the metrics/results table.

| Page | Config file | Top-level key |
|------|------------|---------------|
| Evaluate / Analytics | `custom/config/eval_db.yaml` | `eval_db` |
| Monitoring | `custom/config/monitoring_db.yaml` | `monitoring_db` |
| Human Signals | `custom/config/human_signals_db.yaml` | `human_signals_db` |
| Production / KPIs | `custom/config/kpi_db.yaml` | `kpi_db` |

### Step 1 -- Copy the template

```bash
# Copy the template you need from backend/config/ to custom/config/
cp backend/config/eval_db.yaml.example custom/config/eval_db.yaml        # for Evaluate
cp backend/config/monitoring_db.yaml.example custom/config/monitoring_db.yaml  # for Monitoring
cp backend/config/human_signals_db.yaml.example custom/config/human_signals_db.yaml  # for Human Signals
```

Or run `make setup` to copy all templates at once.

### Step 2 -- Configure the connection

Open the YAML file and set your connection details. You have two options:

=== "Full URL (recommended)"

    ```yaml
    eval_db:
      enabled: true
      auto_load: true
      url: "postgresql://axis_reader:${DB_PASSWORD}@db.example.com:5432/evaluations"
    ```

    Set `DB_PASSWORD` as an environment variable to avoid storing secrets in the YAML file.

=== "Individual fields"

    ```yaml
    eval_db:
      enabled: true
      auto_load: true
      host: "db.example.com"
      port: 5432
      database: "evaluations"
      username: "axis_reader"
      password: "your_password_here"
      ssl_mode: "require"
    ```

### Step 3 -- Write split queries

Each config uses two SQL queries: `dataset_query` (records/traces) and `results_query` (metrics/scores). Both must include a `dataset_id` column — AXIS joins them in DuckDB.

=== "Using SQL aliases"

    ```yaml
    eval_db:
      enabled: true
      auto_load: true
      url: "postgresql://axis_reader:${DB_PASSWORD}@db.example.com:5432/evals"

      dataset_query: |
        SELECT
          e.id AS dataset_id,
          e.experiment_name AS evaluation_name,
          e.input AS query,
          e.output AS actual_output,
          e.expected AS expected_output,
          e.metadata AS data_metadata
        FROM evaluations e
        WHERE e.created_at > NOW() - INTERVAL '7 days'

      results_query: |
        SELECT
          m.eval_id AS dataset_id,
          m.metric_name,
          m.score AS metric_score
        FROM metrics m
        JOIN evaluations e ON e.id = m.eval_id
        WHERE e.created_at > NOW() - INTERVAL '7 days'

      query_timeout: 60
      row_limit: 10000
    ```

=== "Using column mappings"

    ```yaml
    eval_db:
      enabled: true
      auto_load: true
      url: "postgresql://axis_reader:${DB_PASSWORD}@db.example.com:5432/evals"
      columns:
        my_id_field: dataset_id
        user_prompt: query
        llm_response: actual_output
        gold_answer: expected_output
        run_name: evaluation_name
        eval_metric: metric_name
        eval_score: metric_score

      dataset_query: "SELECT * FROM my_evaluations WHERE created_at > NOW() - INTERVAL '7 days'"
      results_query: "SELECT * FROM my_metrics WHERE created_at > NOW() - INTERVAL '7 days'"

      query_timeout: 60
      row_limit: 10000
    ```

!!! tip "Both queries must include `dataset_id`"
    The `dataset_query` and `results_query` are joined on `dataset_id` in DuckDB. Make sure both queries alias or include a column named `dataset_id`.

### Step 4 -- Restart the backend

```bash
# If using make
make backend

# Or directly
cd backend && uvicorn app.main:app --reload --port 8500
```

On startup you will see a log line confirming the auto-load:

```
INFO: Loaded eval DB config from custom/config/eval_db.yaml
```

!!! warning "Safety limits"
    AXIS enforces hard caps on query execution:

    - `query_timeout`: clamped to a maximum of **120 seconds**
    - `row_limit`: clamped to a maximum of **50,000 rows**

    Values above these caps are silently reduced to the maximum.

---

## Monitoring Data Formats

The Monitoring module accepts two CSV formats. AXIS auto-detects which format you're using.

### Long Format (recommended for production)

Each row represents a **single metric observation**. Used when metrics are stored in a normalized database schema.

```csv
dataset_id,query,actual_output,metric_name,metric_score,timestamp,environment,source_name
01KFX...,What is...,The answer...,Faithfulness,0.85,2024-01-15T10:30:00,production,alpha_bot
01KFX...,What is...,The answer...,Relevance,0.92,2024-01-15T10:30:00,production,alpha_bot
```

Key columns: `metric_name` (name of the metric) and `metric_score` (numeric score value).

### Wide Format

Each row contains **all metrics as separate columns**. Common when exporting from evaluation runs.

```csv
dataset_id,query,actual_output,faithfulness_score,relevance_score,timestamp
01KFX...,What is...,The answer...,0.85,0.92,2024-01-15T10:30:00
```

Columns ending in `_score` are auto-detected as metrics.

!!! tip "Format detection logic"
    If the data contains both `metric_name` and `metric_score` columns, AXIS uses
    long format. Otherwise, it scans for columns ending in `_score` (wide format).

---

## Metric Categories

The `metric_category` column in monitoring data controls how metrics are displayed in the Monitoring dashboard. Three categories are supported:

| Category | Description | Example values | UI rendering |
|----------|-------------|----------------|-------------|
| `SCORE` | Numeric scores (default) | `0.85`, `0.92` | Time-series charts, pass/fail thresholds, sparklines |
| `CLASSIFICATION` | Categorical labels | `"POSITIVE"`, `"HALLUCINATION"` | Category breakdowns, stacked bar charts, distribution panels |
| `ANALYSIS` | Structured insights/reasoning | `{"issues": [...]}` | Detail views with formatted JSON, paginated insights table |

### How to use

Add `metric_category` to your monitoring data or SQL query:

=== "CSV"

    ```csv
    dataset_id,metric_name,metric_score,metric_category
    01KFX...,Faithfulness,0.85,SCORE
    01KFX...,Sentiment,POSITIVE,CLASSIFICATION
    01KFX...,QualityAnalysis,"{""issues"": []}",ANALYSIS
    ```

=== "SQL (long format)"

    ```sql
    SELECT
      e.id AS dataset_id,
      m.metric_name,
      m.score AS metric_score,
      m.category AS metric_category    -- SCORE, CLASSIFICATION, or ANALYSIS
    FROM metrics m
    JOIN evaluations e ON e.id = m.eval_id
    ```

If `metric_category` is omitted, all metrics default to `SCORE`.

!!! info "Monitoring tabs"
    The Monitoring page shows separate tabs for each category type:

    - **Score** tab — numeric metric trends, pass rates, latency distribution
    - **Classification** tab — category value counts and trends (only appears when CLASSIFICATION metrics exist)
    - **Analysis** tab — paginated structured insights (only appears when ANALYSIS metrics exist)

---

## Mixing Both Approaches

You can auto-load data from Postgres for one page and use CSV upload for another. For example:

- **Monitoring**: auto-load from your observability database via `monitoring_db.yaml`
- **Evaluate**: upload experiment CSVs manually through the UI
- **Human Signals**: auto-load HITL cases from your support database via `human_signals_db.yaml`

Each page's data source is independent.

---

## DuckDB Analytics Store

When using Postgres auto-load, data is synced into an embedded **DuckDB analytics store** that acts as a local cache. This provides fast analytical queries without hitting your source database on every request.

### How it works

1. On startup, each configured database runs its `dataset_query` and `results_query` concurrently against Postgres
2. Results are written to internal DuckDB tables (e.g., `monitoring_dataset`, `monitoring_results`)
3. A JOIN view is created (e.g., `monitoring_data`) that combines both tables on `dataset_id`
4. Subsequent API requests read from DuckDB, not Postgres

### Incremental sync

Add `incremental_column` to your YAML config to enable watermark-based incremental sync — only new rows are appended on each refresh:

```yaml
monitoring_db:
  incremental_column: created_at
  refresh_interval_minutes: 15   # auto-sync every 15 minutes
```

### Learn more

- [DuckDB Configuration](duckdb.md) -- store settings, sync workers, concurrency
- [DuckDB Architecture](../architecture/duckdb-store.md) -- technical deep-dive into the sync engine
- [DuckDB Sync Runbook](../deployment/duckdb-sync-runbook.md) -- production sync patterns

---

## Env-Var Fallback

If you prefer environment variables over YAML files, you can configure database connections entirely through `backend/.env`. However, YAML files offer additional features not available via env vars:

| Feature | YAML | Env vars |
|---------|------|----------|
| Split queries | `dataset_query` + `results_query` | Not available |
| Column mappings | `columns` map | Not available |
| Incremental sync | `incremental_column` field | Not available |
| Periodic refresh | `refresh_interval_minutes` | Not available |
| Row limit / timeout | Per-file | Per-database (eval only) |
| Auto-load with query | All three databases | Eval DB only |

!!! note
    If a YAML file exists for a database, its env vars are ignored entirely.
    Delete or rename the YAML file to fall back to env vars.

See [Environment Variables](environment-variables.md) for the complete env var reference and [YAML Configs](yaml-configs.md) for the full YAML schema.

---

## Troubleshooting

??? question "My data does not appear after startup"
    Check the backend logs for connection errors. Common issues:

    - `enabled: false` -- the master switch is off
    - `auto_load: false` -- the data is configured but not loading automatically
    - Incorrect `url` or host/port/database values
    - Firewall blocking the database port
    - `${DB_PASSWORD}` placeholder without the env var set

??? question "Columns are not mapping correctly"
    - Verify your `columns` mapping in the YAML matches your actual database column names
    - Alternatively, use `AS` aliases in your SQL query to rename columns
    - Check the AXIS schema for the target column names in [YAML Configs](yaml-configs.md)

??? question "Query is timing out"
    - Increase `query_timeout` (max 120 seconds)
    - Add a `WHERE` clause to limit the date range
    - Reduce `row_limit` to fetch fewer rows
    - Ensure the database has appropriate indexes on filtered columns
    - Add `partition_column` to enable parallel COPY reads for large tables

??? question "DuckDB sync is slow or stuck"
    - Check sync status: `curl http://localhost:8500/api/store/status`
    - Force a full rebuild: `curl -X POST http://localhost:8500/api/store/sync/monitoring?full=true`
    - Reset watermarks: `curl -X POST http://localhost:8500/api/store/sync/monitoring/reset-watermark`
    - See the [DuckDB Sync Runbook](../deployment/duckdb-sync-runbook.md) for troubleshooting details
