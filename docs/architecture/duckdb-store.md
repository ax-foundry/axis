---
icon: custom/database
---

# DuckDB Analytics Store

AXIS uses an embedded **DuckDB** database as a local analytics engine. Data is synced from external PostgreSQL sources into DuckDB, where all analytics queries run. This architecture eliminates large data transfers between frontend and backend and enables sub-second aggregation queries on millions of rows.

## Architecture

```mermaid
graph TB
    subgraph Sources ["External PostgreSQL"]
        PG_MON[(monitoring DB)]
        PG_FB[(human signals DB)]
        PG_EVAL[(eval DB)]
    end

    subgraph SyncEngine ["Sync Engine"]
        SPLIT["Split read<br/>(dataset + results)"]
        COPY["Parallel COPY export<br/>(or chunked fallback)"]
        NORM["Column normalization<br/>(per-dataset)"]
        STAGE["Staging table write"]
        SWAP["Atomic swap / Append<br/>(full or incremental)"]
    end

    subgraph DuckDB ["DuckDB (data/local_store.duckdb)"]
        T_MON_D[monitoring_dataset]
        T_MON_R[monitoring_results]
        T_MON[monitoring_data<br/>JOIN view]
        T_FB_D[human_signals_dataset]
        T_FB_R[human_signals_results]
        T_FB_RAW[human_signals_raw<br/>JOIN view]
        T_FB_CASES[human_signals_cases<br/>derived]
        T_EVAL_D[eval_dataset]
        T_EVAL_R[eval_results]
        T_EVAL[eval_data<br/>JOIN view]
        T_META[_store_metadata<br/>metadata + KV + watermarks]
    end

    subgraph API ["Analytics Endpoints"]
        EP_SUMMARY["/monitoring/analytics/summary"]
        EP_TRENDS["/monitoring/analytics/trends"]
        EP_BREAKDOWN["/monitoring/analytics/metric-breakdown"]
        EP_CLASS["/monitoring/analytics/classification-*"]
        EP_ANALYSIS["/monitoring/analytics/analysis-insights"]
        EP_STORE["/store/status, /data, /metadata"]
    end

    PG_MON --> SPLIT
    PG_FB --> SPLIT
    PG_EVAL --> SPLIT
    SPLIT --> COPY --> NORM --> STAGE --> SWAP
    SWAP --> T_MON_D
    SWAP --> T_MON_R
    SWAP --> T_FB_D
    SWAP --> T_FB_R
    SWAP --> T_EVAL_D
    SWAP --> T_EVAL_R
    T_MON_D -.->|"JOIN view"| T_MON
    T_MON_R -.->|"JOIN view"| T_MON
    T_FB_D -.->|"JOIN view"| T_FB_RAW
    T_FB_R -.->|"JOIN view"| T_FB_RAW
    T_EVAL_D -.->|"JOIN view"| T_EVAL
    T_EVAL_R -.->|"JOIN view"| T_EVAL
    T_FB_RAW -.->|"derived at sync time"| T_FB_CASES
    T_FB_RAW -.-> T_META

    T_MON --> EP_SUMMARY
    T_MON --> EP_TRENDS
    T_MON --> EP_BREAKDOWN
    T_MON --> EP_CLASS
    T_MON --> EP_ANALYSIS
    T_MON --> EP_STORE
    T_EVAL --> EP_STORE
    T_FB_CASES --> EP_STORE
```

## Key Design Decisions

### Split Sync (Dataset + Results)

All datasets use a **two-table split** sync pattern. Each source database is expected to provide two queries:

- `dataset_query` — fetches the "records" side (dataset_id, query, actual_output, metadata)
- `results_query` — fetches the "metrics" side (dataset_id, metric_name, metric_score, ...)

The two tables sync **concurrently** via `asyncio.gather`, then a DuckDB **JOIN view** is created:

```sql
CREATE VIEW monitoring_data AS
  SELECT r.*, d.query, d.actual_output, ...
  FROM monitoring_results r
  JOIN monitoring_dataset d ON r.dataset_id = d.dataset_id
```

Benefits:

- **Concurrent reads**: Both halves of the data load in parallel from Postgres
- **Reduced redundancy**: Dataset columns (query text, outputs) are stored once, not repeated per metric row
- **Incremental-friendly**: Each sub-table has its own watermark — only new rows are appended

### Incremental Sync

When an `incremental_column` is configured (e.g., `created_at`), the sync engine can operate in incremental mode:

1. Check if both sub-tables exist and have stored watermarks
2. Wrap each query with `WHERE {column} > '{watermark}'`
3. **Append** new rows to existing tables (INSERT INTO, no staging swap)
4. Update watermarks to the new MAX value
5. Recompute metadata

If incremental sync fails, watermarks are automatically cleared and the next sync falls back to a full rebuild.

!!! tip "Force full rebuild"
    Pass `?full=true` to any sync endpoint to skip incremental mode and force a staging + swap rebuild.

### Full Rebuild (Fallback)

When incremental is not available (first sync, no watermarks, no `incremental_column` configured, or `?full=true`), the engine does a complete staging + atomic swap:

```sql
BEGIN TRANSACTION;
DROP TABLE IF EXISTS monitoring_results;
ALTER TABLE monitoring_results_staging RENAME TO monitoring_results;
COMMIT;
```

Readers always see either the previous complete table or the new complete table -- never partial data.

### Read Strategies (Tiered Fallback)

The sync engine tries three read strategies in order:

1. **Parallel COPY export** — `sync_workers` concurrent Postgres `COPY TO` commands, each handling a partition range. Writes CSV files to a temp directory, then loads into DuckDB via `read_csv_auto`. Fastest for large tables.
2. **Single COPY export** — One `COPY TO` command for the whole query. Used when `partition_column` is not configured or `sync_workers = 1`.
3. **Sequential chunked read** — asyncpg cursor reading `sync_chunk_size` rows per fetch. Fallback when the database backend does not support COPY.

### Non-blocking I/O

All DuckDB operations are synchronous (DuckDB does not have an async API). To avoid blocking the FastAPI event loop:

- Analytics endpoints are `async def` and dispatch DuckDB reads via `await anyio.to_thread.run_sync(query_fn, limiter=query_limiter)`
- A shared `anyio.CapacityLimiter` (default 8 concurrent) bounds the number of simultaneous DuckDB read threads
- Sync writes also use `anyio.to_thread.run_sync()` per chunk
- Postgres reads happen **outside** the DuckDB write lock; the lock is held only for the brief staging/append phase

### Leader-Only Sync

For multi-worker deployments (multiple uvicorn workers sharing the same DuckDB file), an OS-level file lock (`fcntl.flock`) ensures only one worker runs the sync at a time. The lock is non-blocking: workers that fail to acquire it skip the sync silently.

!!! warning "Multi-host deployments"
    OS file locks only coordinate processes on the **same host**. For multi-host deployments, the DuckDB file must live on shared storage (e.g., a shared Docker volume), or use a single-writer deployment pattern.

### Periodic Sync Scheduler

The backend includes a built-in periodic sync scheduler that runs as a background task. For each dataset with `refresh_interval_minutes > 0`, the scheduler:

1. Waits for the startup sync to complete (if `sync_mode: "startup"`)
2. Sleeps until the next dataset is due
3. Syncs all due datasets concurrently
4. Uses incremental mode when watermarks are available

The scheduler runs until the application shuts down (cancelled via lifespan cleanup).

## Data Flow

### Sync Lifecycle

1. **Startup**: `lifespan` handler in `main.py` initializes the DuckDB store, loads cached metadata from disk, rebuilds `human_signals_cases` if needed, and fires a background `sync_with_lock()` task (if `sync_mode: "startup"`)
2. **Periodic scheduler starts**: Waits for startup sync to finish, then enters the periodic loop
3. **Split read**: For each dataset, `dataset_query` and `results_query` are read concurrently from Postgres
4. **Read strategy selection**: Parallel COPY → single COPY → sequential chunked (tiered fallback)
5. **Column normalization**: Per-dataset column normalization (rename, type coercion) runs on each chunk
6. **DuckDB write**: Full rebuild (staging + swap) or incremental (INSERT INTO) based on watermark state
7. **JOIN view creation**: On full sync, a DuckDB view is created joining the two sub-tables
8. **Metadata compute**: Row count, column info, filter values, time range, and summary stats are computed and persisted to `_store_metadata`
9. **Watermark update**: MAX value of the `incremental_column` is stored per sub-table
10. **Derived tables** (human signals only): `human_signals_cases` and `human_signals_metric_schema` are rebuilt from `human_signals_raw`

### DuckDB Tables

| Table | Type | Source | Description |
|-------|------|--------|-------------|
| `monitoring_dataset` | Internal table | `monitoring_db.yaml` `dataset_query` | Dataset records (query, output, metadata) |
| `monitoring_results` | Internal table | `monitoring_db.yaml` `results_query` | Metric results (scores, categories) |
| `monitoring_data` | JOIN view | Auto-generated | `monitoring_results JOIN monitoring_dataset` |
| `human_signals_dataset` | Internal table | `human_signals_db.yaml` `dataset_query` | Human signals dataset records |
| `human_signals_results` | Internal table | `human_signals_db.yaml` `results_query` | Human signals metric results |
| `human_signals_raw` | JOIN view | Auto-generated | `human_signals_results JOIN human_signals_dataset` |
| `human_signals_cases` | Derived table | Built from `human_signals_raw` | Aggregated cases with flattened signals |
| `eval_dataset` | Internal table | `eval_db.yaml` `dataset_query` | Evaluation dataset records |
| `eval_results` | Internal table | `eval_db.yaml` `results_query` | Evaluation metric results |
| `eval_data` | JOIN view | Auto-generated | `eval_results JOIN eval_dataset` |
| `_store_metadata` | Internal table | Sync engine | Persisted metadata, KV pairs, watermarks, sync IDs |

!!! info "Staging tables are invisible"
    Tables like `monitoring_results_staging` exist only during sync. The `ALLOWED_TABLES` set in `duckdb_store.py` ensures only the API-visible tables are exposed via endpoints.

### Human Signals Derived Tables

Human signals data goes through a two-stage sync:

1. **Stage 1**: Raw rows are normalized and stored via the `human_signals_dataset` + `human_signals_results` split, joined as `human_signals_raw`
2. **Stage 2**: `human_signals_service.py` functions (`build_metric_schema()`, `aggregate_cases()`) run against `human_signals_raw` to produce:
    - `human_signals_cases` table (pre-aggregated, flattened signals)
    - `human_signals_metric_schema` JSON blob in `_store_metadata`

A `sync_id` (UUID) tags both tables. On startup, if the IDs don't match (crash between Stage 1 and Stage 2), the derived tables are automatically rebuilt.

## Services

### `duckdb_store.py` -- DuckDBStore

The core connection manager and query executor:

| Method | Purpose |
|--------|---------|
| `query_df(sql, params)` | Read-only query returning a DataFrame (cursor per call for thread safety) |
| `query_list(sql, params)` | Read-only query returning `list[dict]` |
| `query_value(sql, params)` | Read-only query returning a single scalar |
| `has_table(table_name)` | Check if a non-staging table exists (allowlist-validated) |
| `get_metadata(table_name)` | Return cached metadata (hot cache first, DuckDB fallback) |
| `ensure_ready(table_name)` | Raise 503/404 if table is not ready for queries |
| `get_sync_status(table_name)` | Return per-table sync status |
| `get_kv(key)` / `set_kv(key, value)` | Key-value storage in `_store_metadata` |
| `get_watermark(table)` / `set_watermark(table, val)` | Incremental sync watermark management |
| `clear_watermark(table)` | Clear watermark — forces full rebuild on next sync |

Staging and write methods are synchronous and designed to be called via `anyio.to_thread.run_sync()`:

| Method | Purpose |
|--------|---------|
| `_init_staging(table)` | Drop existing staging table |
| `_write_chunk(table, df, is_first)` | Write DataFrame to staging |
| `_write_csv_to_staging(table, path)` | Create staging from CSV via `read_csv_auto` |
| `_swap_staging(table)` | Atomic DROP + RENAME in transaction |
| `_append_chunk(table, df)` | INSERT INTO existing table (incremental) |
| `_append_csv(table, path)` | INSERT INTO from CSV file (incremental) |
| `_write_derived_table(table, df)` | CREATE OR REPLACE for derived tables |
| `_create_view(name, sql)` | Create or replace a DuckDB view |

### `sync_engine.py` -- Sync Orchestration

| Function | Purpose |
|----------|---------|
| `sync_dataset(config, table, store)` | Sync one dataset via split path: two internal tables → JOIN view |
| `sync_all(store)` | Sync all configured datasets concurrently |
| `sync_single(dataset, store)` | Sync a named dataset by key |
| `sync_with_lock(store, reason, force_full)` | Acquire OS file lock, then `sync_all()` |
| `periodic_sync_loop(store)` | Background loop: sleep until next due dataset, sync, repeat |
| `_sync_split(config, table, store, force_full)` | Orchestrate split sync with incremental/full decision |
| `_sync_internal_table(config, table, store, append_mode)` | Sync one sub-table (full or incremental) |
| `_build_join_view(store, view, dataset_tbl, results_tbl)` | Create DuckDB JOIN view from two sub-tables |
| `_build_human_signals_derived_tables(store, sync_id)` | Build `human_signals_cases` + metric schema from `human_signals_raw` |
| `_parallel_copy_read(...)` | N parallel COPY reads partitioned by column range |
| `_chunked_read(...)` | Async generator yielding DataFrame chunks from cursor |

### `store.py` -- Store Router

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/store/sync` | POST | Trigger sync for all datasets. `?full=true` forces full rebuild |
| `/api/store/sync/{dataset}` | POST | Sync single dataset (monitoring, human_signals, eval). `?full=true` forces full rebuild |
| `/api/store/sync/{dataset}/reset-watermark` | POST | Clear watermarks — next sync does full rebuild |
| `/api/store/status` | GET | Per-table sync status: state, rows, last sync, watermarks, refresh interval |
| `/api/store/metadata/{dataset}` | GET | Columns, time range, pre-computed filter values, summary stats |
| `/api/store/data/{dataset}` | GET | Paginated data with filters, sorting, column projection, search |

### `monitoring_analytics.py` -- Analytics Router

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/monitoring/analytics/summary` | GET | Lightweight KPIs (total, avg score, pass rate, latency percentiles). Uses metadata cache fast path when unfiltered |
| `/api/monitoring/analytics/trends` | GET | Time-series trends bucketed by granularity (hourly/daily/weekly) |
| `/api/monitoring/analytics/metric-breakdown` | GET | Pass rate and average per metric, with optional group-by |
| `/api/monitoring/analytics/latency-distribution` | GET | Latency histogram with percentiles and optional group-by |
| `/api/monitoring/analytics/class-distribution` | GET | Score distributions grouped by model/environment/evaluation |
| `/api/monitoring/analytics/correlation` | GET | Correlation matrix between metrics |
| `/api/monitoring/analytics/classification-breakdown` | GET | Category value counts for CLASSIFICATION metrics |
| `/api/monitoring/analytics/classification-trends` | GET | Time-series for CLASSIFICATION metric categories |
| `/api/monitoring/analytics/analysis-insights` | GET | Paginated ANALYSIS metric records with signals |

## Metadata Persistence

Metadata is computed at sync time and persisted in a `_store_metadata` DuckDB table. An in-memory hot cache serves reads without hitting disk:

- **Startup**: `load_metadata_from_db()` populates the hot cache from DuckDB
- **After sync**: `_compute_and_persist_metadata()` refreshes both DuckDB and the hot cache
- **Multi-worker**: Any worker can read metadata from DuckDB, even if it didn't run the sync

Cached metadata per table includes:

| Field | Description |
|-------|-------------|
| `row_count` | Total rows in the table |
| `columns` | Column names and DuckDB types |
| `filter_values` | Distinct values for low-cardinality fields (max 200 per field) |
| `time_range` | `{min, max}` of the `timestamp` column |
| `summary_stats` | Pre-aggregated KPIs: total_records, avg_score, pass_rate, p50/p95/p99 latency (monitoring_data only) |

The `summary_stats` field enables the `/summary` endpoint to return instant responses without querying the table when no filters are applied.

## Watermark Management

Watermarks are stored in the `_store_metadata` KV table with keys like `_watermark_monitoring_dataset`. Each sub-table has its own watermark.

| Operation | Endpoint / Action |
|-----------|-------------------|
| **View watermarks** | `GET /api/store/status` — includes watermarks per sub-table |
| **Reset watermarks** | `POST /api/store/sync/{dataset}/reset-watermark` — clears both sub-table watermarks |
| **Force full rebuild** | `POST /api/store/sync/{dataset}?full=true` — ignores watermarks for this sync |
| **Auto-clear on failure** | If incremental sync fails, watermarks are automatically cleared |

## Configuration

See [DuckDB Configuration](../configuration/duckdb.md) for the full YAML reference.

```yaml title="custom/config/duckdb.yaml"
duckdb:
  enabled: true
  path: "data/local_store.duckdb"
  sync_mode: "startup"
  sync_chunk_size: 10000
  max_sync_rows: 2000000
  query_concurrency: 8
  sync_workers: 4
```

```yaml title="custom/config/monitoring_db.yaml (split queries + incremental)"
monitoring_db:
  enabled: true
  auto_load: true
  url: "postgresql://user:pass@host:5432/db"
  dataset_query: |
    SELECT id AS dataset_id, input AS query, output AS actual_output, ...
    FROM traces
  results_query: |
    SELECT trace_id AS dataset_id, metric_name, score AS metric_score, ...
    FROM metric_results
  partition_column: "id"
  incremental_column: "created_at"
  refresh_interval_minutes: 15
```

## Sync Status States

| State | Meaning |
|-------|---------|
| `not_synced` | No sync has been attempted for this table |
| `syncing` | Sync is currently in progress |
| `ready` | Data is available for queries |
| `error` | Last sync failed (error message available) |

Additional status fields:

| Field | Description |
|-------|-------------|
| `sync_type` | `"full"` or `"incremental"` — which mode the last sync used |
| `last_incremental` | Timestamp of last incremental sync (if applicable) |
| `incremental_rows` | Number of new rows added in the last incremental sync |
| `truncated` | `true` if the sync hit `max_sync_rows` — analytics run on partial data |
| `watermarks` | Per-sub-table watermark values (shown in `/api/store/status`) |
| `refresh_interval_minutes` | Configured periodic refresh interval |
| `incremental_column` | Column used for watermark-based incremental sync |
