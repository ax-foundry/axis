---
icon: custom/env-vars
---

# Environment Variables

AXIS reads environment variables from `.env` files using [Pydantic Settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/). Variable names are **case-insensitive** -- `HOST` and `host` both work.

---

## Backend -- `backend/.env`

### Server

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `HOST` | `str` | `127.0.0.1` | Bind address for the FastAPI server |
| `PORT` | `int` | `8500` | Bind port for the FastAPI server |
| `DEBUG` | `bool` | `true` | Enable debug mode (auto-reload, verbose logs) |
| `APP_NAME` | `str` | `AXIS` | Application name shown in API docs |
| `FRONTEND_URL` | `str` | `http://localhost:3500` | Primary allowed CORS origin for the frontend |
| `FRONTEND_URLS` | `str` | -- | Optional comma-separated additional CORS origins |
| `COPILOT_ENABLED` | `bool` | `true` | Enable the AI Copilot sidebar in the frontend |
| `AXIS_PLUGINS_ENABLED` | `str` | `*` | Comma-separated plugin names to enable, or `*` for all. Empty string disables all |

### AI / LLM

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `OPENAI_API_KEY` | `str` | -- | OpenAI API key for LLM judge and Copilot |
| `ANTHROPIC_API_KEY` | `str` | -- | Anthropic API key for Claude-based judge |
| `GATEWAY_API_KEY` | `str` | -- | API key for gateway or platform auth |
| `AI_TOOLKIT_URL` | `str` | -- | URL of AI Toolkit server |
| `LLM_MODEL_NAME` | `str` | `gpt-4` | Default language model name |
| `EMBEDDING_MODEL_NAME` | `str` | `text-embedding-ada-002` | Default embedding model name |
| `OPENAI_API_BASE` | `str` | -- | Base URL for OpenAI-compatible APIs (e.g. Azure, vLLM) |

!!! tip "Using Azure OpenAI or a local model"
    Set `OPENAI_API_BASE` to point at your Azure endpoint or a local
    vLLM / Ollama server. Combined with `LLM_MODEL_NAME`, this lets you
    use any OpenAI-compatible API without code changes.

### Evaluation Database

These are the env-var equivalents of `eval_db.yaml`. If the YAML file exists, these are ignored.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `EVAL_DB_URL` | `str` | -- | Full PostgreSQL connection URL (overrides individual fields) |
| `EVAL_DB_HOST` | `str` | -- | Database host |
| `EVAL_DB_PORT` | `int` | `5432` | Database port |
| `EVAL_DB_NAME` | `str` | -- | Database name |
| `EVAL_DB_USER` | `str` | -- | Database username |
| `EVAL_DB_PASSWORD` | `str` | -- | Database password |
| `EVAL_DB_SSL_MODE` | `str` | `prefer` | SSL mode: `disable`, `prefer`, `require` |
| `EVAL_DB_AUTO_LOAD` | `bool` | `false` | Auto-load evaluation data on startup |
| `EVAL_DB_DATASET_QUERY` | `str` | -- | SQL query for the evaluation dataset table |
| `EVAL_DB_RESULTS_QUERY` | `str` | -- | SQL query for the evaluation results table |
| `EVAL_DB_QUERY_TIMEOUT` | `int` | `60` | Query timeout in seconds (max 120) |
| `EVAL_DB_ROW_LIMIT` | `int` | `10000` | Max rows to load (max 50,000) |

### Monitoring Database

These are the env-var equivalents of `monitoring_db.yaml`. If the YAML file exists, these are ignored.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MONITORING_DB_URL` | `str` | -- | Full PostgreSQL connection URL |
| `MONITORING_DB_HOST` | `str` | -- | Database host |
| `MONITORING_DB_PORT` | `int` | `5432` | Database port |
| `MONITORING_DB_NAME` | `str` | -- | Database name |
| `MONITORING_DB_USER` | `str` | -- | Database username |
| `MONITORING_DB_PASSWORD` | `str` | -- | Database password |
| `MONITORING_DB_SCHEMA` | `str` | `public` | Database schema |
| `MONITORING_DB_TABLE` | `str` | -- | Table name (legacy auto-connect) |
| `MONITORING_DB_SSL_MODE` | `str` | `prefer` | SSL mode |
| `MONITORING_DB_AUTO_CONNECT` | `bool` | `false` | Auto-connect on page load |

### Human Signals Database

These are the env-var equivalents of `human_signals_db.yaml`. If the YAML file exists, these are ignored.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `HUMAN_SIGNALS_DB_URL` | `str` | -- | Full PostgreSQL connection URL |
| `HUMAN_SIGNALS_DB_HOST` | `str` | -- | Database host |
| `HUMAN_SIGNALS_DB_PORT` | `int` | `5432` | Database port |
| `HUMAN_SIGNALS_DB_NAME` | `str` | -- | Database name |
| `HUMAN_SIGNALS_DB_USER` | `str` | -- | Database username |
| `HUMAN_SIGNALS_DB_PASSWORD` | `str` | -- | Database password |
| `HUMAN_SIGNALS_DB_SCHEMA` | `str` | `public` | Database schema |
| `HUMAN_SIGNALS_DB_TABLE` | `str` | -- | Table name (legacy auto-connect) |
| `HUMAN_SIGNALS_DB_SSL_MODE` | `str` | `prefer` | SSL mode |
| `HUMAN_SIGNALS_DB_AUTO_CONNECT` | `bool` | `false` | Auto-connect on page load |

### KPI Database

These are the env-var equivalents of `kpi_db.yaml`. If the YAML file exists, these are ignored.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `KPI_DB_URL` | `str` | -- | Full PostgreSQL connection URL (overrides individual fields) |
| `KPI_DB_HOST` | `str` | -- | Database host |
| `KPI_DB_PORT` | `int` | `5432` | Database port |
| `KPI_DB_NAME` | `str` | -- | Database name |
| `KPI_DB_USER` | `str` | -- | Database username |
| `KPI_DB_PASSWORD` | `str` | -- | Database password |
| `KPI_DB_SSL_MODE` | `str` | `prefer` | SSL mode: `disable`, `prefer`, `require` |
| `KPI_DB_AUTO_LOAD` | `bool` | `false` | Auto-load KPI data on startup |

!!! info "Display config is YAML-only"
    KPI display settings (`visible_kpis`, `card_display_value`, `kpi_overrides`,
    `categories`, etc.) are only configurable via the YAML file. See
    [kpi_db.yaml](yaml-configs.md#kpi-db-kpi_dbyaml) for the full reference.

### Agent Replay

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `AGENT_REPLAY_ENABLED` | `bool` | `false` | Master switch for the Agent Replay feature |
| `LANGFUSE_PUBLIC_KEY` | `str` | -- | Default Langfuse public API key |
| `LANGFUSE_SECRET_KEY` | `str` | -- | Default Langfuse secret API key |
| `LANGFUSE_HOST` | `str` | `https://cloud.langfuse.com` | Langfuse server URL |

Per-agent Langfuse credentials use the pattern `LANGFUSE_{AGENT}_PUBLIC_KEY` and `LANGFUSE_{AGENT}_SECRET_KEY`:

```env
# Agent-specific Langfuse credentials
LANGFUSE_ALPHA_BOT_PUBLIC_KEY=pk-lf-...
LANGFUSE_ALPHA_BOT_SECRET_KEY=sk-lf-...
LANGFUSE_BETA_BOT_PUBLIC_KEY=pk-lf-...
LANGFUSE_BETA_BOT_SECRET_KEY=sk-lf-...
```

Agent names are canonicalized: lowercased with hyphens converted to underscores.

### Agent Replay Search Database

These are the env-var equivalents of `agent_replay_db.yaml`. If the YAML file exists, these are ignored.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `AGENT_REPLAY_DB_ENABLED` | `bool` | `false` | Enable the search database |
| `AGENT_REPLAY_DB_URL` | `str` | -- | Full PostgreSQL connection URL |
| `AGENT_REPLAY_DB_HOST` | `str` | -- | Database host |
| `AGENT_REPLAY_DB_PORT` | `int` | `5432` | Database port |
| `AGENT_REPLAY_DB_NAME` | `str` | -- | Database name |
| `AGENT_REPLAY_DB_USER` | `str` | -- | Database username |
| `AGENT_REPLAY_DB_PASSWORD` | `str` | -- | Database password |
| `AGENT_REPLAY_DB_SSL_MODE` | `str` | `prefer` | SSL mode |
| `AGENT_REPLAY_DB_SCHEMA` | `str` | `public` | Database schema |
| `AGENT_REPLAY_DB_TABLE` | `str` | `trace_lookup` | Lookup table name |
| `AGENT_REPLAY_DB_SEARCH_COLUMN` | `str` | _(empty)_ | Column to match search queries. Empty = trace ID only. Sets a single-entry `search_columns` dict |
| `AGENT_REPLAY_DB_SEARCH_COLUMN_LABEL` | `str` | _(empty)_ | Display label for the search column in the UI |
| `AGENT_REPLAY_DB_TRACE_ID_COLUMN` | `str` | `langfuse_trace_id` | Column with Langfuse trace IDs |
| `AGENT_REPLAY_DB_AGENT_NAME_COLUMN` | `str` | -- | Column with agent names (optional) |
| `AGENT_REPLAY_DB_QUERY_TIMEOUT` | `int` | `10` | Query timeout in seconds (max 30) |
| `AGENT_REPLAY_DB_CONNECT_TIMEOUT` | `int` | `10` | Connection timeout in seconds (max 30) |
| `AGENT_REPLAY_DB_POOL_MIN_SIZE` | `int` | `0` | Min idle connections |
| `AGENT_REPLAY_DB_POOL_MAX_SIZE` | `int` | `5` | Max connections (max 20) |

### Graph Database (FalkorDB)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `GRAPH_DB_HOST` | `str` | `localhost` | FalkorDB host |
| `GRAPH_DB_PORT` | `int` | `6379` | FalkorDB port |
| `GRAPH_DB_NAME` | `str` | `knowledge_graph` | Graph name inside FalkorDB |
| `GRAPH_DB_PASSWORD` | `str` | -- | FalkorDB password |

### Theme

Environment-level theme overrides. These are applied **on top of** the YAML theme config, allowing you to tweak individual values without editing the YAML file.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `AXIS_THEME_ACTIVE` | `str` | -- | Active palette name (e.g. `sage_green`, `professional_blue`) |
| `AXIS_THEME_PRIMARY` | `str` | -- | Primary color hex |
| `AXIS_THEME_PRIMARY_LIGHT` | `str` | -- | Primary light color hex |
| `AXIS_THEME_PRIMARY_DARK` | `str` | -- | Primary dark color hex |
| `AXIS_THEME_PRIMARY_SOFT` | `str` | -- | Primary soft color hex |
| `AXIS_THEME_PRIMARY_PALE` | `str` | -- | Primary pale color hex |
| `AXIS_THEME_ACCENT_GOLD` | `str` | -- | Accent gold color hex |
| `AXIS_THEME_ACCENT_SILVER` | `str` | -- | Accent silver color hex |
| `AXIS_THEME_HERO_IMAGE` | `str` | -- | URL or path to hero background image |
| `AXIS_THEME_LOGO_URL` | `str` | -- | URL or path to logo image |
| `AXIS_THEME_FAVICON_URL` | `str` | -- | URL or path to favicon |
| `AXIS_THEME_APP_ICON_URL` | `str` | -- | URL or path to app icon (sidebar) |
| `AXIS_THEME_HERO_CONTRAST` | `float` | -- | Hero image contrast filter (1.0 = normal) |
| `AXIS_THEME_HERO_SATURATION` | `float` | -- | Hero image saturation filter (1.0 = normal) |
| `AXIS_THEME_HERO_BRIGHTNESS` | `float` | -- | Hero image brightness filter (1.0 = normal) |
| `AXIS_THEME_HERO_OPACITY` | `float` | -- | Hero image opacity (1.0 = fully visible) |
| `AXIS_THEME_HERO_MODE` | `str` | -- | Hero section mode: `dark` (default) or `light` |

!!! info "Shimmer colors are YAML-only"
    The title shimmer gradient (`shimmerFrom`, `shimmerTo`) is configured
    exclusively in `theme.yaml`. There are no `AXIS_THEME_SHIMMER_*` env vars.
    See [Theming > Title Shimmer Effect](theming.md#title-shimmer-effect).

---

## Frontend -- `frontend/.env.local`

The Next.js frontend only exposes variables prefixed with `NEXT_PUBLIC_` to the browser bundle.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `str` | `http://localhost:8500` | Backend API base URL |

!!! warning "No secrets in frontend env"
    `NEXT_PUBLIC_*` variables are embedded into the JavaScript bundle at build
    time and are visible to anyone using the browser. Never place API keys,
    passwords, or other credentials in `frontend/.env.local`.

---

## Minimal Working Example

A backend `.env` file that gets you started with CSV upload mode (no databases):

```env title="backend/.env"
HOST=127.0.0.1
PORT=8500
DEBUG=true
FRONTEND_URL=http://localhost:3500
# Optional extra origins (comma-separated)
FRONTEND_URLS=http://localhost:3500,http://127.0.0.1:3500
```

Add AI keys when you want to use the Copilot or LLM judge:

```env title="backend/.env (with AI)"
HOST=127.0.0.1
PORT=8500
DEBUG=true
FRONTEND_URL=http://localhost:3500
FRONTEND_URLS=http://localhost:3500,http://127.0.0.1:3500

OPENAI_API_KEY=sk-...
LLM_MODEL_NAME=gpt-4o-mini
```

---

## Related

- [YAML Configs](yaml-configs.md) -- database and theme YAML files (override env vars for DB configs)
- [Data Sources](data-sources.md) -- choosing between CSV upload and Postgres auto-load
- [Theming](theming.md) -- detailed guide to color palettes and branding assets
