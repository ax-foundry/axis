---
icon: custom/database
---

# DuckDB Configuration

The DuckDB embedded analytics store is configured via `custom/config/duckdb.yaml`. This file controls sync behavior, storage location, query concurrency, and parallel read settings.

## Setup

```bash
cp backend/config/duckdb.yaml.example custom/config/duckdb.yaml
```

Or use the project-level setup command which copies all `.example` templates:

```bash
make setup
```

## Config File

```yaml title="custom/config/duckdb.yaml"
duckdb:
  # Enable/disable DuckDB analytics store
  enabled: true

  # Path to the DuckDB database file (relative to backend directory)
  path: "data/local_store.duckdb"

  # Single global startup sync switch:
  # - startup: run startup sync
  # - manual: no startup sync (use /api/store/sync)
  sync_mode: "startup"

  # Number of rows per chunk during Postgres -> DuckDB streaming
  sync_chunk_size: 10000

  # Safety cap: stop sync if this many rows are read (logs warning)
  # Primary volume control should be via YAML query WHERE clauses
  max_sync_rows: 2000000

  # Max concurrent DuckDB read queries (thread pool limit)
  query_concurrency: 8

  # Parallel readers per dataset sync (for COPY-based reads)
  # Requires partition_column in the database config
  sync_workers: 4
```

## Field Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `bool` | `true` | Master switch. Set to `false` to disable DuckDB entirely |
| `path` | `str` | `data/local_store.duckdb` | Path to the DuckDB file, relative to the `backend/` directory |
| `sync_mode` | `str` | `"startup"` | Global startup behavior: `"startup"` or `"manual"` |
| `sync_chunk_size` | `int` | `10000` | Rows per chunk during sync. Larger values use more memory but sync faster |
| `max_sync_rows` | `int` | `2000000` | Safety cap. If hit, sync completes with available rows and sets `truncated: true` |
| `query_concurrency` | `int` | `8` | Maximum concurrent DuckDB read queries via `anyio.CapacityLimiter` |
| `sync_workers` | `int` | `1` | Number of parallel readers per dataset sync. Requires `partition_column` in the database config to take effect |

## How Sync Works

DuckDB acts as a local cache of your PostgreSQL data. All datasets use a **split sync** pattern:

1. Each database config provides two SQL queries: `dataset_query` (records) and `results_query` (metrics)
2. Both queries are read **concurrently** from Postgres using the configured read strategy
3. Each half is written to its own DuckDB internal table (e.g., `monitoring_dataset`, `monitoring_results`)
4. A DuckDB **JOIN view** is created: `CREATE VIEW monitoring_data AS SELECT ... FROM results JOIN dataset ON dataset_id`
5. Metadata (columns, filter values, time range, summary stats) is computed and cached

### Read Strategy (tiered fallback)

The sync engine selects the fastest available read method:

1. **Parallel COPY** — `sync_workers` concurrent `COPY TO` commands, each reading a partition range via `partition_column`. Writes CSV to temp files, loads into DuckDB via `read_csv_auto`. Best for large tables.
2. **Single COPY** — One `COPY TO` for the whole query. Used when `partition_column` or `sync_workers` is not set.
3. **Sequential chunked** — asyncpg cursor reading `sync_chunk_size` rows per fetch. Fallback when the database backend does not support COPY.

### Incremental Sync

When `incremental_column` is configured in the database YAML (e.g., `created_at`), the sync engine can skip unchanged data:

1. Reads stored watermarks (MAX value of `incremental_column` from previous sync)
2. Wraps each query with `WHERE {column} > '{watermark}'`
3. **Appends** new rows to existing DuckDB tables (INSERT INTO, no staging swap)
4. Updates watermarks to the new MAX value

Incremental mode is used automatically when watermarks are available. On failure, watermarks are cleared and the next sync does a full rebuild.

### Periodic Scheduler

Datasets with `refresh_interval_minutes > 0` are automatically synced on a timer:

```yaml title="custom/config/monitoring_db.yaml"
monitoring_db:
  refresh_interval_minutes: 15   # sync every 15 minutes
  incremental_column: created_at  # use incremental mode
```

The scheduler starts after the startup sync completes and runs until shutdown.

### Startup Sync Eligibility

On startup (if `sync_mode: "startup"`), each dataset is synced if:

- `enabled: true` in the database config
- `dataset_query` and `results_query` are both configured
- `auto_load` / `auto_connect` is enabled in its YAML config

!!! tip "Data volume control"
    The `max_sync_rows` field is a **safety net**, not the primary volume control. Use the `query` fields in your database YAML configs to control data volume:

    ```yaml title="custom/config/monitoring_db.yaml"
    monitoring_db:
      results_query: |
        SELECT ...
        FROM metric_results
        WHERE created_at > NOW() - INTERVAL '7 days'
    ```

    The `WHERE` clause is the recommended way to limit how much data is synced.

## Manual Sync

You can trigger a sync manually via the API:

```bash
# Sync all configured datasets
curl -X POST http://localhost:8500/api/store/sync

# Sync a single dataset
curl -X POST http://localhost:8500/api/store/sync/monitoring

# Force full rebuild (ignore watermarks)
curl -X POST "http://localhost:8500/api/store/sync/monitoring?full=true"

# Reset watermarks (next sync will do full rebuild)
curl -X POST http://localhost:8500/api/store/sync/monitoring/reset-watermark

# Check sync status (includes watermarks and refresh intervals)
curl http://localhost:8500/api/store/status
```

## Storage Location

The DuckDB file is created at the configured `path` (default: `backend/data/local_store.duckdb`). The parent directory is created automatically if it doesn't exist.

!!! info "Docker deployments"
    Mount a persistent volume at `backend/data/` to preserve the DuckDB file across container restarts. This avoids re-syncing on every deployment.

## Disabling DuckDB

Set `enabled: false` to disable the DuckDB store entirely. The backend will still function -- monitoring and analytics endpoints will fall back to processing data from POST request bodies (the pre-DuckDB behavior).

```yaml
duckdb:
  enabled: false
```

## Database Config: Split Queries

Each database YAML now uses **split queries** instead of a single `query` field:

```yaml title="custom/config/monitoring_db.yaml"
monitoring_db:
  enabled: true
  auto_load: true
  url: "postgresql://user:pass@host:5432/db"

  # Split queries (required for sync)
  dataset_query: |
    SELECT
      id AS dataset_id,
      input AS query,
      output AS actual_output,
      created_at AS timestamp,
      environment,
      source_name,
      trace_id,
      latency
    FROM traces

  results_query: |
    SELECT
      trace_id AS dataset_id,
      metric_name,
      score AS metric_score,
      metric_category,
      explanation
    FROM metric_results

  # Performance tuning (optional)
  partition_column: "id"            # Column to split parallel COPY reads
  incremental_column: "created_at"  # Column for watermark-based incremental sync
  refresh_interval_minutes: 15      # Periodic sync interval (0 = disabled)
  query_timeout: 120                # Max seconds per query
```

### New Database Config Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dataset_query` | `str` | -- | SQL query for the records/dataset table. Must include `dataset_id` |
| `results_query` | `str` | -- | SQL query for the metrics/results table. Must include `dataset_id` |
| `partition_column` | `str` | `null` | Column to partition parallel COPY reads on (integer or timestamp) |
| `incremental_column` | `str` | `null` | Column used as watermark for incremental sync (e.g., `created_at`) |
| `refresh_interval_minutes` | `int` | `0` | Periodic sync interval in minutes. `0` = disabled |

Both `dataset_query` and `results_query` must be configured for sync to work. They must share a `dataset_id` column for the JOIN view.

## Related

- [YAML Configs](yaml-configs.md) -- Database connection configs that define what data is synced
- [DuckDB Architecture](../architecture/duckdb-store.md) -- Technical deep-dive into the sync engine and store
- [Data Sources](data-sources.md) -- CSV upload vs. Postgres auto-load setup guide
- [DuckDB Sync Runbook](../deployment/duckdb-sync-runbook.md) -- Production sync patterns
