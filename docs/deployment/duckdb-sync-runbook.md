---
icon: custom/sync
---

# DuckDB Sync Runbook

This runbook covers production-friendly patterns for loading data from PostgreSQL into DuckDB:

1. Configure split queries (dataset + results)
2. Run an initial one-time backfill
3. Enable incremental sync with periodic scheduling
4. Manage watermarks and force rebuilds when needed

---

## Recommended Pattern

- Keep PostgreSQL as source of truth
- Treat DuckDB as an analytics cache
- Use **split queries** (`dataset_query` + `results_query`) for each data source
- Enable **incremental sync** via `incremental_column` for low-latency refreshes
- Use the **periodic scheduler** (`refresh_interval_minutes`) for automatic sync
- Reserve `?full=true` for schema changes or data corrections

---

## 1) Configure Split Queries

Each database config now uses two queries instead of one. The sync engine reads both concurrently and joins them as a DuckDB view.

```yaml title="custom/config/monitoring_db.yaml"
monitoring_db:
  enabled: true
  auto_load: true
  url: "postgresql://axis_reader:${DB_PASSWORD}@prod-db.internal:5432/observability"

  dataset_query: |
    SELECT
      trace_id AS dataset_id,
      timestamp,
      prompt AS query,
      completion AS actual_output,
      deployment_env AS environment,
      service_name AS source_name,
      component_name AS source_component,
      response_time_ms AS latency
    FROM llm_traces
    ORDER BY timestamp DESC

  results_query: |
    SELECT
      trace_id AS dataset_id,
      metric_name,
      metric_value AS metric_score,
      metric_category,
      explanation
    FROM llm_metric_results
    ORDER BY created_at DESC

  # Performance tuning
  partition_column: "id"            # Enables parallel COPY reads
  incremental_column: "created_at"  # Enables watermark-based incremental sync
  refresh_interval_minutes: 15      # Auto-sync every 15 minutes
  query_timeout: 120
```

!!! tip "Both queries must include `dataset_id`"
    The `dataset_query` and `results_query` are joined on `dataset_id` in DuckDB. Make sure both queries alias or include a column named `dataset_id`.

---

## 2) Run Initial One-Time Backfill

Trigger the first sync to populate DuckDB:

```bash
curl -X POST "https://YOUR_BACKEND_DOMAIN/api/store/sync/monitoring"
```

Poll status:

```bash
curl "https://YOUR_BACKEND_DOMAIN/api/store/status"
```

Wait for `monitoring_data.state` to become `ready`. The first sync always does a **full rebuild** (staging + atomic swap) since no watermarks exist yet.

---

## 3) Enable Incremental Sync

After the initial backfill, subsequent syncs use incremental mode automatically when `incremental_column` is configured:

- The sync engine reads the stored watermark (MAX value of `incremental_column` from the previous sync)
- Each query is wrapped with `WHERE {column} > '{watermark}'`
- New rows are **appended** to existing DuckDB tables (INSERT INTO, no staging swap)
- Watermarks are updated to the new MAX value

### Verify Incremental Mode

Check the status endpoint to see watermarks and sync type:

```bash
curl "https://YOUR_BACKEND_DOMAIN/api/store/status" | jq '.datasets.monitoring_data'
```

Expected output:

```json
{
  "state": "ready",
  "rows": 150000,
  "sync_type": "incremental",
  "last_incremental": "2026-02-13T10:15:00+00:00",
  "incremental_rows": 1200,
  "watermarks": {
    "monitoring_dataset": "2026-02-13T10:00:00",
    "monitoring_results": "2026-02-13T10:00:00"
  },
  "refresh_interval_minutes": 15,
  "incremental_column": "created_at"
}
```

---

## 4) Periodic Sync (Built-in Scheduler)

If `refresh_interval_minutes > 0` is set in the database config, the backend automatically schedules periodic syncs:

1. The scheduler starts after the startup sync completes
2. It sleeps until the next dataset is due
3. Syncs all due datasets concurrently using incremental mode
4. Repeats until the application shuts down

No external scheduler (Cloud Scheduler, cron) is needed for this pattern.

### Recommended Production Config

```yaml title="custom/config/monitoring_db.yaml"
monitoring_db:
  refresh_interval_minutes: 15
  incremental_column: created_at
```

```yaml title="custom/config/duckdb.yaml"
duckdb:
  sync_mode: "startup"      # Initial full sync on boot
  sync_workers: 4            # Parallel COPY readers
```

---

## 5) External Scheduling (Alternative)

If you prefer external scheduling over the built-in scheduler (e.g., for centralized job management), set `refresh_interval_minutes: 0` and trigger syncs via API.

### Cloud Scheduler (GCP)

```bash
gcloud scheduler jobs create http axis-monitoring-sync-daily \
  --location=us-central1 \
  --schedule="*/15 * * * *" \
  --uri="https://YOUR_CLOUD_RUN_URL/api/store/sync/monitoring" \
  --http-method=POST \
  --oidc-service-account-email="scheduler-invoker@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --oidc-token-audience="https://YOUR_CLOUD_RUN_URL" \
  --time-zone="Etc/UTC"
```

Grant invoker permission:

```bash
gcloud run services add-iam-policy-binding YOUR_SERVICE_NAME \
  --region=us-central1 \
  --member="serviceAccount:scheduler-invoker@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

---

## 6) Watermark Management

### View Watermarks

```bash
curl "https://YOUR_BACKEND_DOMAIN/api/store/status"
```

Each dataset shows per-sub-table watermarks (e.g., `monitoring_dataset`, `monitoring_results`).

### Reset Watermarks

Force the next sync to do a full rebuild by clearing watermarks:

```bash
curl -X POST "https://YOUR_BACKEND_DOMAIN/api/store/sync/monitoring/reset-watermark"
```

### Force Full Rebuild

Skip incremental mode for a single sync run:

```bash
curl -X POST "https://YOUR_BACKEND_DOMAIN/api/store/sync/monitoring?full=true"
```

### When to Force a Full Rebuild

- After schema changes in the source database
- After data corrections or backfills in Postgres
- If incremental sync produces unexpected results
- When watermarks become stale (e.g., after a long outage)

!!! info "Auto-recovery on failure"
    If an incremental sync fails, watermarks are automatically cleared. The next sync will do a full rebuild without manual intervention.

---

## 7) Operational Checks

After each sync run:

- `GET /api/store/status` to verify `state=ready`
- Check `sync_type` — should be `"incremental"` for regular refreshes
- Check `incremental_rows` — should be > 0 if source data is changing
- Alert on repeated `error` state or timeouts

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `sync_type: "full"` every time | No `incremental_column` or watermarks cleared | Add `incremental_column` to DB config |
| `incremental_rows: 0` | No new data since last sync | Expected if source is quiet |
| `state: "error"` | Query timeout or connection failure | Check `query_timeout`, source DB health |
| `truncated: true` | Hit `max_sync_rows` cap | Use WHERE clauses to limit volume, or increase cap |
| Slow sync | Large tables without COPY | Add `partition_column` and increase `sync_workers` |

If the query still times out at 120s:

- Reduce the time window in your WHERE clause (e.g., 7 days instead of 30)
- Add indexes on source Postgres (`timestamp`, join/filter columns)
- Add `partition_column` to enable parallel COPY reads
- Simplify joins or precompute a materialized view
