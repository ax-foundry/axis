---
icon: custom/yaml
---

# YAML Config Files

AXIS uses YAML files in `custom/config/` to configure database auto-load connections and the theme system. Each file ships as a `.example` template in `backend/config/` that you copy and customize.

---

## Setup

```bash
# Create custom/ directory and copy all .example templates
make setup
```

This creates `custom/config/` and copies each `.example` template from `backend/config/` into it. You can also copy individual templates manually:

```bash
cp backend/config/eval_db.yaml.example custom/config/eval_db.yaml
cp backend/config/monitoring_db.yaml.example custom/config/monitoring_db.yaml
# ... etc.
```

!!! info "Precedence reminder"
    For database configs, YAML takes precedence over environment variables. If a
    YAML file exists and contains a valid config block, the corresponding
    `*_DB_*` env vars are not read. See [Configuration Overview](index.md) for
    the full precedence rules.

---

## Database Config Files

All three database configs (`eval_db.yaml`, `monitoring_db.yaml`, `human_signals_db.yaml`) share the same structure. The only difference is the top-level key name.

### Common Structure

```yaml title="custom/config/<name>_db.yaml"
<name>_db:
  # Master switch
  enabled: true

  # Auto-load behavior
  auto_load: true       # Execute query on app startup
  # auto_connect: true  # Legacy: use table name instead of query

  # Connection -- Option A: full URL (recommended)
  url: "postgresql://user:pass@host:5432/dbname"

  # Connection -- Option B: individual fields
  # host: "db.example.com"
  # port: 5432
  # database: "dbname"
  # username: "axis_reader"
  # password: "secret"
  # ssl_mode: "require"    # disable | prefer | require

  # Split queries (required for DuckDB sync)
  dataset_query: |
    SELECT id AS dataset_id, input AS query, output AS actual_output, ...
    FROM my_records_table
    WHERE created_at > NOW() - INTERVAL '7 days'

  results_query: |
    SELECT record_id AS dataset_id, metric_name, score AS metric_score, ...
    FROM my_metrics_table
    WHERE created_at > NOW() - INTERVAL '7 days'

  # Limits
  query_timeout: 60   # seconds (max 120)
  row_limit: 10000     # max rows (max 50000)

  # Column mappings (optional)
  columns:
    source_column: target_column

  # Performance tuning (optional)
  partition_column: "id"            # Column to split parallel COPY reads
  incremental_column: "created_at"  # Column for watermark-based incremental sync
  refresh_interval_minutes: 0       # Periodic sync interval (0 = disabled)
```

### Field Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `bool` | `false` | Master switch -- must be `true` to activate |
| `auto_load` | `bool` | `false` | Execute the query automatically on app startup |
| `auto_connect` | `bool` | `false` | Legacy mode: auto-connect using `table` name |
| `url` | `str` | -- | Full PostgreSQL URL. Overrides individual host/port/database fields |
| `host` | `str` | -- | Database hostname |
| `port` | `int` | `5432` | Database port |
| `database` | `str` | -- | Database name |
| `username` | `str` | -- | Database user |
| `password` | `str` | -- | Database password |
| `schema` | `str` | `public` | PostgreSQL schema (monitoring and human signals only) |
| `table` | `str` | -- | Table name for legacy `auto_connect` mode |
| `ssl_mode` | `str` | `prefer` | SSL mode: `disable`, `prefer`, or `require` |
| `dataset_query` | `str` | -- | SQL query for the records/dataset table. Must include `dataset_id` |
| `results_query` | `str` | -- | SQL query for the metrics/results table. Must include `dataset_id` |
| `query_timeout` | `int` | `60` | Query timeout in seconds. Clamped to max 120 |
| `row_limit` | `int` | `10000` | Maximum rows returned. Clamped to max 50,000 |
| `columns` | `map` | `{}` | Column name mappings: `source_name: axis_name` |
| `partition_column` | `str` | -- | Column to partition parallel COPY reads on (integer or timestamp) |
| `incremental_column` | `str` | -- | Column used as watermark for incremental sync (e.g., `created_at`) |
| `refresh_interval_minutes` | `int` | `0` | Periodic sync interval in minutes. `0` = disabled |

!!! tip "Environment variable placeholders in URLs"
    Connection URLs support `${VAR}` placeholders for secrets:

    ```yaml
    url: "postgresql://axis_reader:${DB_PASSWORD}@db.example.com:5432/evals"
    ```

    Set `DB_PASSWORD` as an environment variable and the runtime will substitute it.

### Column Mappings

The `columns` map lets you rename your database columns to match the AXIS schema without rewriting your SQL query. The format is `source_column: axis_column`.

=== "Evaluation columns"

    ```yaml
    columns:
      my_id_field: dataset_id
      user_prompt: query
      llm_response: actual_output
      gold_answer: expected_output
      run_name: evaluation_name
      eval_metric: metric_name
      eval_score: metric_score
    ```

    If no `columns` mapping is provided, AXIS auto-normalizes common names:
    `id` / `record_id` to `dataset_id`, `input` / `prompt` to `query`,
    `output` / `response` to `actual_output`, etc.

=== "Monitoring columns"

    ```yaml
    columns:
      record_id: dataset_id
      created_at: timestamp
      user_input: query
      model_response: actual_output
      metric: metric_name
      score: metric_score
      env: environment
      app_name: source_name
      component: source_component
    ```

=== "Human Signals columns"

    ```yaml
    columns:
      id: Case_ID
      thread: Thread_ID
      company: Business
      intervened: Has_Intervention
      intervention: Intervention_Type
      friction: Friction_Point
      mood: Sentiment
      notes: Human_Summary
      result: Final_Outcome
      msg_count: Message_Count
      agent: Agent_Name
      created_at: Timestamp
    ```

---

### Eval DB – `eval_db.yaml`

Loads evaluation data (experiments, metric scores) into the Evaluate and Analytics pages.

```yaml title="custom/config/eval_db.yaml"
eval_db:
  enabled: true
  auto_load: true
  url: "postgresql://axis_reader:${DB_PASSWORD}@db.example.com:5432/evaluations"

  # Feature flag: enable/disable the batch Evaluation Runner
  eval_runner_enabled: true

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

!!! tip "Disabling the Evaluation Runner"
    Set `eval_runner_enabled: false` to hide the batch evaluation wizard from the
    Evaluate page. The Runner tab shows a lock icon and "Disabled by Admin" tooltip.
    This is useful for read-only deployments where users should only view results.

### Monitoring DB – `monitoring_db.yaml`

Loads observability data (time-series metrics, traces) into the Monitoring page.

```yaml title="custom/config/monitoring_db.yaml"
monitoring_db:
  enabled: true
  auto_load: true
  url: "postgresql://axis_reader:${DB_PASSWORD}@db.example.com:5432/monitoring"

  dataset_query: |
    SELECT
      e.id AS dataset_id,
      e.created_at AS timestamp,
      e.input AS query,
      e.output AS actual_output,
      e.environment,
      e.source_name,
      e.source_component,
      e.trace_id,
      e.latency
    FROM evaluation_logs e
    WHERE e.created_at > NOW() - INTERVAL '7 days'

  results_query: |
    SELECT
      m.log_id AS dataset_id,
      m.metric_name,
      m.score AS metric_score,
      m.metric_type,
      m.metric_category,
      m.explanation
    FROM metrics m
    JOIN evaluation_logs e ON e.id = m.log_id
    WHERE e.created_at > NOW() - INTERVAL '7 days'

  # Performance tuning
  partition_column: "id"
  incremental_column: "created_at"
  refresh_interval_minutes: 15

  query_timeout: 60
  row_limit: 10000

  # Anomaly detection (optional)
  anomaly_detection:
    enabled: true
    min_data_points: 5

    # Z-Score: flags points that deviate significantly from the mean
    z_score_enabled: true
    z_score_threshold: 2.0           # standard deviations
    z_score_severity: "warning"      # warning | error
    z_score_lookback_window: 20      # historical points to use
    z_score_metrics: []              # empty = all metrics

    # Moving Average: flags points that deviate from the rolling average
    ma_enabled: true
    ma_window_size: 5
    ma_deviation_threshold: 0.15     # 15% deviation
    ma_severity: "warning"
    ma_metrics: []

    # Rate of Change: flags sudden jumps between consecutive points
    roc_enabled: true
    roc_threshold: 0.3               # 30% change
    roc_severity: "error"
    roc_metrics: []
```

#### Anomaly Detection

The `anomaly_detection` block enables automatic anomaly flagging on monitoring trend data. Three detection methods run independently and produce severity-tagged annotations on trend charts.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `bool` | `false` | Master switch for anomaly detection |
| `min_data_points` | `int` | `5` | Minimum points before detection activates (min 3) |
| `z_score_enabled` | `bool` | `true` | Enable z-score detection |
| `z_score_threshold` | `float` | `2.0` | Standard deviations from mean to flag |
| `z_score_severity` | `str` | `warning` | `warning` or `error` |
| `z_score_lookback_window` | `int` | `20` | Historical window size |
| `z_score_metrics` | `list` | `[]` | Restrict to specific metrics (empty = all) |
| `ma_enabled` | `bool` | `true` | Enable moving average detection |
| `ma_window_size` | `int` | `5` | Rolling window size (min 2) |
| `ma_deviation_threshold` | `float` | `0.15` | Fractional deviation from moving average |
| `ma_severity` | `str` | `warning` | `warning` or `error` |
| `ma_metrics` | `list` | `[]` | Restrict to specific metrics (empty = all) |
| `roc_enabled` | `bool` | `true` | Enable rate-of-change detection |
| `roc_threshold` | `float` | `0.3` | Fractional change between consecutive points |
| `roc_severity` | `str` | `error` | `warning` or `error` |
| `roc_metrics` | `list` | `[]` | Restrict to specific metrics (empty = all) |

### Human Signals DB – `human_signals_db.yaml`

Loads human-in-the-loop signal data into the Human Signals page.

```yaml title="custom/config/human_signals_db.yaml"
human_signals_db:
  enabled: true
  auto_load: true
  url: "postgresql://axis_reader:${DB_PASSWORD}@db.example.com:5432/human_signals"

  dataset_query: |
    SELECT
      c.id AS Case_ID,
      c.thread_id AS Thread_ID,
      c.business_name AS Business,
      c.message_count AS Message_Count,
      c.agent_name AS Agent_Name,
      c.created_at AS Timestamp
    FROM hitl_cases c
    WHERE c.created_at > NOW() - INTERVAL '30 days'

  results_query: |
    SELECT
      r.case_id AS Case_ID,
      r.has_intervention AS Has_Intervention,
      r.intervention_type AS Intervention_Type,
      r.friction_point AS Friction_Point,
      r.sentiment AS Sentiment,
      r.human_summary AS Human_Summary,
      r.final_outcome AS Final_Outcome
    FROM hitl_results r
    JOIN hitl_cases c ON c.id = r.case_id
    WHERE c.created_at > NOW() - INTERVAL '30 days'

  query_timeout: 60
  row_limit: 10000
```

---

## Theme Config – `theme.yaml`

Controls the AXIS color palette, branding assets, and hero image. See the [Theming](theming.md) page for a detailed guide.

```yaml title="custom/config/theme.yaml"
theme:
  # Active palette -- must match a key under 'palettes'
  active: "sage_green"

  palettes:
    sage_green:
      name: "Sage Green"
      primary: "#8B9F4F"
      primaryLight: "#A4B86C"
      primaryDark: "#6B7A3A"
      primarySoft: "#B8C78A"
      primaryPale: "#D4E0B8"
      accentGold: "#D4AF37"
      accentSilver: "#B8C5D3"
      # Branding assets (optional)
      # heroImage: "/api/config/assets/branding/hero.jpg"
      # logoUrl: "/api/config/assets/branding/logo.png"
      # faviconUrl: "/api/config/assets/branding/favicon.ico"
      # appIconUrl: "/api/config/assets/branding/ax-icon.png"
      # Hero title shimmer (optional — both required to activate)
      # shimmerFrom: "#4CD9A0"
      # shimmerTo: "#80D4F0"

    professional_blue:
      name: "Professional Blue"
      primary: "#3D5A80"
      primaryLight: "#5C7AA3"
      primaryDark: "#2B3C73"
      primarySoft: "#8BA4C4"
      primaryPale: "#C5D4E8"
      accentGold: "#D4AF37"
      accentSilver: "#B8C5D3"
```

### Palette Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | `str` | Display name for the palette |
| `primary` | `hex` | Primary brand color |
| `primaryLight` | `hex` | Lighter variant for hover states |
| `primaryDark` | `hex` | Darker variant for headers and emphasis |
| `primarySoft` | `hex` | Soft background highlights |
| `primaryPale` | `hex` | Subtle backgrounds |
| `accentGold` | `hex` | Gold accent for CTAs and highlights |
| `accentSilver` | `hex` | Silver accent for secondary elements |
| `heroImage` | `str` | URL or path to hero background image |
| `logoUrl` | `str` | URL or path to logo image |
| `faviconUrl` | `str` | URL or path to browser tab favicon |
| `appIconUrl` | `str` | URL or path to sidebar app icon |
| `heroContrast` | `float` | CSS contrast filter (1.0 = normal) |
| `heroSaturation` | `float` | CSS saturation filter (1.0 = normal) |
| `heroBrightness` | `float` | CSS brightness filter (1.0 = normal) |
| `heroOpacity` | `float` | Image opacity (1.0 = fully visible) |
| `heroMode` | `str` | Hero section mode: `dark` (default) or `light` |
| `shimmerFrom` | `hex` | Start color of the hero title shimmer gradient (e.g., `#4CD9A0`). Both `shimmerFrom` and `shimmerTo` must be set to activate |
| `shimmerTo` | `hex` | End color of the hero title shimmer gradient (e.g., `#80D4F0`). Both must be set to activate |

---

## DuckDB Config – `duckdb.yaml`

Controls the embedded DuckDB analytics store. See the [DuckDB Configuration](duckdb.md) page for a detailed guide.

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

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `bool` | `true` | Master switch for the DuckDB store |
| `path` | `str` | `data/local_store.duckdb` | DuckDB file path (relative to `backend/`) |
| `sync_mode` | `str` | `"startup"` | Global startup behavior: `"startup"` or `"manual"` |
| `sync_chunk_size` | `int` | `10000` | Rows per chunk during sync |
| `max_sync_rows` | `int` | `2000000` | Safety cap -- sync stops and warns if hit |
| `query_concurrency` | `int` | `8` | Max concurrent DuckDB read threads |
| `sync_workers` | `int` | `1` | Parallel readers per dataset sync. Requires `partition_column` in DB config |

---

## KPI DB – `kpi_db.yaml`

Loads Agent KPI data (operational metrics, trend lines) into the Production dashboard. Unlike the eval/monitoring/human-signals configs, KPI uses a **single query** (no dataset/results split) and adds display-layer configuration for card values, trend lines, and per-agent overrides.

```yaml title="custom/config/kpi_db.yaml"
kpi_db:
  # Master switch
  enabled: true
  auto_load: true

  # Connection -- Option A: full URL (recommended)
  url: "postgresql://axis_reader:${DB_PASSWORD}@db.example.com:5432/kpi_data"

  # Connection -- Option B: individual fields
  # host: "db.example.com"
  # port: 5432
  # database: "kpi_data"
  # username: "axis_reader"
  # password: "secret"
  # ssl_mode: "require"

  # Single query (no dataset/results split)
  query: |
    SELECT
      k.kpi_name,
      k.kpi_category,
      k.numeric_value,
      k.source_name,
      k.environment,
      k.source_type,
      k.recorded_at
    FROM agent_kpi_logs k
    WHERE k.recorded_at > NOW() - INTERVAL '90 days'

  query_timeout: 60
  row_limit: 50000

  # --- Visibility Filters ---
  visible_kpis: []                     # Empty = show all KPIs
  # visible_kpis:
  #   - auto_resolve_rate
  #   - time_to_response
  #   - escalation_rate

  # Per-agent KPI visibility (takes precedence over visible_kpis)
  # visible_kpis_per_source:
  #   alpha_bot:
  #     - auto_resolve_rate
  #     - escalation_rate
  #   beta_bot:
  #     - time_to_response
  #     - correction_rate

  # --- Display Configuration ---
  card_display_value: "latest"         # latest | avg_7d | avg_30d
  trend_lines: ["daily", "avg_7d", "avg_30d"]

  # Category metadata (auto-discovered from kpi_category if omitted)
  categories:
    operational_efficiency:
      display_name: Operational Efficiency
      icon: Zap
    commercial_impact:
      display_name: Commercial Impact
      icon: TrendingUp

  # Per-KPI display overrides
  kpi_overrides:
    auto_resolve_rate:
      display_name: Auto-Resolve Rate
      unit: percent                    # percent | seconds | count | score
      polarity: higher_better          # higher_better | lower_better
      card_display_value: avg_7d       # Override global setting
    time_to_response:
      display_name: Time to Response
      unit: seconds
      polarity: lower_better

  # Per-agent display overrides (resolution: source+kpi > source > global kpi > default)
  # display_per_source:
  #   alpha_bot:
  #     card_display_value: avg_7d
  #     trend_lines: [daily, avg_7d]
  #     kpi_overrides:
  #       auto_resolve_rate:
  #         card_display_value: avg_30d

  # Performance tuning
  # refresh_interval_minutes: 15
  # incremental_column: "recorded_at"
```

### KPI Field Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `bool` | `false` | Master switch -- must be `true` to activate |
| `auto_load` | `bool` | `false` | Execute the query on app startup |
| `url` | `str` | -- | Full PostgreSQL URL (overrides individual fields) |
| `host` | `str` | -- | Database hostname |
| `port` | `int` | `5432` | Database port |
| `database` | `str` | -- | Database name |
| `username` | `str` | -- | Database user |
| `password` | `str` | -- | Database password |
| `ssl_mode` | `str` | `prefer` | SSL mode: `disable`, `prefer`, `require` |
| `query` | `str` | -- | SQL query to load KPI data. Must return `kpi_name`, `numeric_value`, and ideally `kpi_category`, `source_name`, `recorded_at` |
| `query_timeout` | `int` | `60` | Query timeout in seconds (max 120) |
| `row_limit` | `int` | `50000` | Max rows (max 50,000) |
| `visible_kpis` | `list` | `[]` | KPI names to display. Empty = show all |
| `visible_kpis_per_source` | `map` | `{}` | Per-agent KPI visibility overrides |
| `card_display_value` | `str` | `latest` | Main card number: `latest`, `avg_7d`, `avg_30d` |
| `trend_lines` | `list` | `[daily, avg_7d, avg_30d]` | Trend lines on expanded charts |
| `categories` | `map` | `{}` | Category slug → `{display_name, icon}`. Empty = auto-discover from data |
| `kpi_overrides` | `map` | `{}` | Per-KPI display customization (`display_name`, `unit`, `polarity`, etc.) |
| `display_per_source` | `map` | `{}` | Per-agent display overrides with nested `kpi_overrides` |
| `refresh_interval_minutes` | `int` | `0` | Periodic sync interval (0 = disabled) |
| `incremental_column` | `str` | -- | Watermark column for incremental sync |

!!! tip "Display resolution order"
    When the frontend renders a KPI card, it resolves display settings in this order
    (first match wins):

    1. `display_per_source.<agent>.kpi_overrides.<kpi>` -- agent + KPI specific
    2. `display_per_source.<agent>` -- agent-level default
    3. `kpi_overrides.<kpi>` -- global KPI override
    4. Top-level `card_display_value` / `trend_lines` -- global default

---

## Agent Replay DB – `agent_replay_db.yaml`

Connects the Agent Replay search feature to a PostgreSQL lookup table that maps business identifiers (e.g., case references, ticket numbers) to Langfuse trace IDs. This is **optional** — trace ID search works without a database.

```yaml title="custom/config/agent_replay_db.yaml"
agent_replay_db:
  # Master switch
  enabled: true

  # Connection -- Option A: full URL (recommended)
  url: "postgresql://axis_reader:${DB_PASSWORD}@db.example.com:5432/agent_traces"

  # Connection -- Option B: individual fields
  # host: "db.example.com"
  # port: 5432
  # database: "agent_traces"
  # username: "axis_reader"
  # password: "changeme"
  # ssl_mode: "require"

  # Default schema and table
  schema: public
  table: trace_lookup

  # Searchable columns — maps DB column names to display labels.
  # All entries appear in the frontend search dropdown.
  # Omit or leave empty for trace-ID-only search.
  search_columns:
    case_reference: Case Reference
    # business_name: Business Name

  trace_id_column: langfuse_trace_id    # Column containing the Langfuse trace ID
  # agent_name_column: agent_name       # Column with agent name (optional)

  # Per-agent overrides (only override what differs from defaults)
  # agents:
  #   alpha_bot:
  #     table: alpha_bot_cases
  #     search_columns:
  #       case_reference: Case Reference
  #     trace_id_column: langfuse_trace_id
  #   beta_bot:
  #     table: beta_bot_cases
  #     search_columns:
  #       ticket_number: Ticket Number
  #       business_name: Business Name
  #     trace_id_column: langfuse_trace_id

  # Timeouts and pool
  query_timeout: 10
  connect_timeout: 10
  pool_min_size: 0
  pool_max_size: 5
```

### Agent Replay DB Field Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `bool` | `false` | Master switch for the search database |
| `url` | `str` | -- | Full PostgreSQL URL (overrides individual fields) |
| `host` | `str` | -- | Database hostname |
| `port` | `int` | `5432` | Database port |
| `database` | `str` | -- | Database name |
| `username` | `str` | -- | Database user |
| `password` | `str` | -- | Database password |
| `ssl_mode` | `str` | `prefer` | SSL mode: `disable`, `prefer`, `require` |
| `schema` | `str` | `public` | PostgreSQL schema |
| `table` | `str` | `trace_lookup` | Default lookup table name |
| `search_columns` | `map` | `{}` | Maps DB column names to display labels. Each entry appears in the frontend search dropdown. Empty = trace ID only |
| `trace_id_column` | `str` | `langfuse_trace_id` | Column containing the Langfuse trace ID |
| `agent_name_column` | `str` | -- | Column with agent name (optional, enables agent-aware lookup) |
| `agents` | `map` | `{}` | Per-agent overrides for `table`, `search_columns`, `trace_id_column` |
| `query_timeout` | `int` | `10` | Query timeout in seconds (max 30) |
| `connect_timeout` | `int` | `10` | Connection timeout in seconds (max 30) |
| `pool_min_size` | `int` | `0` | Minimum idle connections |
| `pool_max_size` | `int` | `5` | Maximum connections (max 20) |

!!! info "Per-agent overrides"
    When different agents store traces in different tables or use different business
    identifiers, use the `agents` map to override column/table settings per agent.
    Only specify the fields that differ — everything else inherits from the top-level
    defaults.

    Agent names are **canonicalized** (lowercased, hyphens → underscores) to match
    the naming convention used by Langfuse credential discovery.

---

## Agent Replay Config – `agent_replay.yaml`

Non-secret defaults for the Agent Replay plugin. Langfuse credentials are always set via environment variables (see [Environment Variables](environment-variables.md#agent-replay)).

```yaml title="custom/config/agent_replay.yaml"
agent_replay:
  default_limit: 20              # Max recent traces to show (1-100)
  default_days_back: 7           # How far back to look for traces (1-90)
  max_chars: 50000               # Default truncation limit for step content (1-200000)
  search_metadata_key: caseReference  # Langfuse metadata key used for smart search
```

### Field Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `default_limit` | `int` | `20` | Maximum number of recent traces to return per request (1--100) |
| `default_days_back` | `int` | `7` | Default lookback window in days (1--90) |
| `max_chars` | `int` | `50000` | Truncation limit for observation input/output content (1--200,000) |
| `search_metadata_key` | `str` | `caseReference` | Langfuse metadata key used for smart search matching |

!!! info "Langfuse credentials are env-var-only"
    API keys (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, per-agent variants) are never
    stored in YAML. Set them as environment variables or in `backend/.env`.

---

## Signals Metrics Config – `signals_metrics.yaml`

An optional display configuration file for the Human Signals V2 dashboard. It overrides auto-discovered defaults with domain-specific labels, colors, icons, and chart layout preferences. Remove this file to use fully auto-generated configuration.

```yaml title="custom/config/signals_metrics.yaml"
signals_metrics:
  kpi_strip:
    - metric: intervention_type
      signal: is_stp
      label: "STP Rate"
      format: percent
      icon: zap

  chart_sections:
    - title: "Outcome Distribution"
      layout: full          # full | grid_2 | grid_3
      charts:
        - metric: resolution_status
          signal: final_status
          type: stacked_bar  # bar | donut | horizontal_bar | ...
          title: "Resolution Status"

  color_maps:
    intervention_type__intervention_type:
      no_intervention: "#8B9F4F"
      tech_issue: "#C0392B"

  source_filters:
    - field: source_name
      label: "Source"
```

### Field Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `kpi_strip` | `list` | `[]` | KPI cards shown at the top of the dashboard. Each item specifies `metric`, `signal`, `label`, `format` (`percent`, `count`, `number`), and `icon` (Lucide name) |
| `chart_sections` | `list` | `[]` | Groups of charts. Each section has `title`, `layout` (`full`, `grid_2`, `grid_3`), and a `charts` list |
| `chart_sections[].charts[]` | `object` | -- | Chart definition: `metric`, `signal`, `type` (`bar`, `donut`, `horizontal_bar`, `stacked_bar`, `line`), `title` |
| `color_maps` | `map` | `{}` | Custom color assignments for chart values. Key format: `<metric>__<signal>`, value: `{category_value: hex_color}` |
| `source_filters` | `list` | `[]` | Filter dropdowns for the dashboard. Each item: `field` (column name), `label` (display text) |

!!! tip "Auto-discovery vs explicit config"
    When `signals_metrics.yaml` is absent, the Human Signals dashboard auto-discovers
    metrics from the data and generates default KPI strips, chart sections, and color
    maps. Add the YAML file only when you want to customize display names, chart types,
    layouts, or colors.

---

## Memory Config – `memory.yaml`

Controls how the Memory module interprets CSV columns, which fields appear as filters, and how computed views (hard stops, decision quality, conflicts) are derived. The module works out of the box with no config file — every setting has a sensible default matching the standard column names.

```yaml title="custom/config/memory.yaml"
memory:
  # --- Field Role Mappings ---
  # Maps functional roles to your CSV column names.
  # Defaults match the standard column names if omitted.
  field_roles:
    id: id
    name: rule_name
    action: action
    category: risk_category
    group_by: risk_factor
    product: product_type
    quality: decision_quality
    threshold_type: threshold_type
    threshold_value: threshold
    description: outcome_description
    mitigants: mitigants
    status: ingestion_status
    batch: batch_id
    agent: agent_name
    created_at: created_at
    confidence: confidence
    compound_trigger: compound_trigger
    source: source
    source_type: source_type
    historical_exceptions: historical_exceptions
    data_fields: data_fields
    ingestion_error: ingestion_error
    ingested_at: ingested_at

  # Roles that MUST exist in uploaded data (upload fails if missing)
  required_roles: [id, name, action, batch, status]

  # Display labels for roles (auto-titlecased from role name if omitted)
  labels:
    action: Action
    category: Risk Category
    group_by: Risk Factor
    product: Product Type
    quality: Decision Quality
    threshold_type: Threshold
    status: Status
    name: Rule Name
    description: Outcome

  # Roles containing list/array data (parsed from CSV comma-separated strings)
  list_fields: [mitigants, data_fields]

  # Which roles appear as filter dropdowns (order = UI order)
  filter_roles: [action, product, category, threshold_type, status]

  # --- Computed View Config ---
  hard_stops:
    action_value: decline              # Which action value is a "hard stop"
    require_empty_mitigants: true      # Must have zero mitigants to qualify

  quality_values:
    aligned: aligned
    divergent: divergent
    partial: partial

  soft_threshold_value: soft           # threshold_type value for "soft" thresholds

  # --- Action colors (for summary charts) ---
  action_colors:
    decline: "#E74C3C"
    refer: "#F39C12"
    approve_with_conditions: "#3498DB"
    flag_for_review: "#9B59B6"
    verify: "#1ABC9C"
    exclude: "#E67E22"

  # --- Contradictory action pairs (for conflict detection) ---
  contradictory_pairs:
    - [decline, approve_with_conditions]
    - [decline, verify]
    - [exclude, refer]
    - [exclude, approve_with_conditions]
```

### How It Works

The Memory module maps CSV columns to **role names** at import time. Internally, all storage, API responses, and frontend rendering use role names — the raw CSV column names are never exposed past the ingest boundary.

```
CSV Upload → field_roles mapping → Role-keyed storage → API → Frontend
```

This means you can use any CSV column names by adjusting `field_roles`. For example, if your CSV uses `compliance_area` instead of `risk_category`:

```yaml
field_roles:
  category: compliance_area   # Maps "category" role to your column name
```

### Field Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `field_roles` | `map` | Standard column names | Maps each functional role (e.g. `name`, `action`) to your CSV column name |
| `required_roles` | `list` | `[id, name, action, batch, status]` | Roles that must exist in uploaded data. Upload fails with a clear error if missing |
| `labels` | `map` | Titlecased role names | Display labels for each role in the UI (filters, table headers) |
| `list_fields` | `list` | `[mitigants, data_fields]` | Roles containing comma-separated list data |
| `filter_roles` | `list` | `[action, product, category, threshold_type, status]` | Roles shown as filter dropdowns (order = UI order) |
| `hard_stops.action_value` | `str` | `decline` | Action value that identifies hard stop rules |
| `hard_stops.require_empty_mitigants` | `bool` | `true` | Whether hard stops must also have zero mitigants |
| `quality_values.aligned` | `str` | `aligned` | Value in the `quality` role for aligned rules |
| `quality_values.divergent` | `str` | `divergent` | Value in the `quality` role for divergent rules |
| `quality_values.partial` | `str` | `partial` | Value in the `quality` role for partial rules |
| `soft_threshold_value` | `str` | `soft` | Value in `threshold_type` role for soft thresholds |
| `action_colors` | `map` | See example | Color hex codes for each action value in summary charts |
| `contradictory_pairs` | `list` | See example | Pairs of action values that conflict (triggers conflict banner) |

### Config Validation

The loader validates at startup:

- `field_roles` values are unique (no two roles map to the same column)
- All `required_roles` entries are valid role names
- All `list_fields` entries are valid role names
- All `filter_roles` entries are valid role names
- `hard_stops` has required keys with correct types
- `quality_values` has all three keys (`aligned`, `divergent`, `partial`)

Invalid config produces a clear error message in the server log and falls back to defaults.

### Config API

The frontend fetches memory config from `GET /api/config/memory`, which returns the full config including a `config_hash` for cache invalidation. The frontend `useMemoryConfig()` hook caches this with `staleTime: Infinity`.

---

## Related

- [Environment Variables](environment-variables.md) -- env var reference (fallback when YAML is absent)
- [Data Sources](data-sources.md) -- CSV upload vs. Postgres auto-load setup guide
- [Theming](theming.md) -- detailed branding and customization guide
- [Memory Guide](../guides/memory-guide.html) -- user guide for the Memory dashboard
- [Agent Replay Guide](../guides/agent-replay-guide.html) -- user guide for the Agent Replay feature
