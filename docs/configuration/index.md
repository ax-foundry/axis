---
icon: custom/overview
---

# Configuration

AXIS is configured through a layered system of YAML files, environment variables, and sensible defaults. This section covers every configuration surface in the platform.

---

## Configuration Sources

AXIS reads configuration from three layers, evaluated in a specific order:

| Layer | Location | Purpose |
|-------|----------|---------|
| **Defaults** | `backend/app/config.py` | Hardcoded fallbacks for every setting |
| **Environment variables** | `backend/.env` | Server, AI, database, and theme overrides |
| **YAML config files** | `custom/config/*.yaml` | Database auto-load and theme palettes |

### Precedence Rules

The resolution order depends on the configuration category:

=== "Database configs"

    YAML files take precedence over environment variables. If a YAML file exists
    and contains a valid configuration block, environment variables for that
    database are ignored entirely.

    ```
    YAML file (highest) --> env vars --> defaults (lowest)
    ```

    For example, if `custom/config/eval_db.yaml` exists with `eval_db.enabled: true`,
    then `EVAL_DB_HOST`, `EVAL_DB_URL`, etc. in `.env` are not read.

=== "Theme config"

    The YAML file is loaded first, then individual `AXIS_THEME_*` environment
    variables override specific values within the active palette. This allows
    you to define a full palette in YAML and tweak one color via an env var.

    ```
    defaults --> YAML file (base) --> env vars (override individual values)
    ```

!!! warning "YAML files must be created manually"
    The `backend/config/` directory ships with `.example` templates only. Run
    `make setup` to create the `custom/` directory and copy all templates:

    ```bash
    make setup
    ```

    Or copy them individually:

    ```bash
    cp backend/config/eval_db.yaml.example custom/config/eval_db.yaml
    cp backend/config/monitoring_db.yaml.example custom/config/monitoring_db.yaml
    cp backend/config/human_signals_db.yaml.example custom/config/human_signals_db.yaml
    cp backend/config/kpi_db.yaml.example custom/config/kpi_db.yaml
    cp backend/config/agent_replay_db.yaml.example custom/config/agent_replay_db.yaml
    cp backend/config/theme.yaml.example custom/config/theme.yaml
    cp backend/config/agents.yaml.example custom/config/agents.yaml
    cp backend/config/signals_metrics.yaml.example custom/config/signals_metrics.yaml
    cp backend/config/duckdb.yaml.example custom/config/duckdb.yaml
    cp backend/config/memory.yaml.example custom/config/memory.yaml
    ```

---

## Quick Reference

| What you want to configure | Where to look |
|----------------------------|---------------|
| Server host, port, CORS | [Environment Variables](environment-variables.md) |
| OpenAI / Anthropic API keys | [Environment Variables](environment-variables.md) |
| Database auto-load (eval, monitoring, human signals, KPI) | [YAML Configs](yaml-configs.md) |
| CSV upload vs. Postgres ingestion | [Data Sources](data-sources.md) |
| Colors, logo, hero image, favicon | [Theming](theming.md) |
| App name, tagline, branding text | [Customization](customization.md#branding) |
| Agent registry (names, avatars) | [Customization](customization.md#agents) |
| Agent Replay (Langfuse, search DB) | [YAML Configs](yaml-configs.md#agent-replay-db-agent_replay_dbyaml) |
| Multi-agent teams (per-agent overrides) | [Multi-Agent Teams](multi-agent.md) |
| KPI display (card values, trend lines) | [YAML Configs](yaml-configs.md#kpi-db-kpi_dbyaml) |
| Signals dashboard layout | [Customization](customization.md#signals-display-config) |
| DuckDB analytics store | [DuckDB](duckdb.md) |
| Memory module field mappings | [YAML Configs](yaml-configs.md#memory-config-memoryyaml) |
| Frontend API URL | [Environment Variables](environment-variables.md) |

---

## File Layout

```
backend/
  .env                              # Environment variables (git-ignored)
  config/
    eval_db.yaml.example            # Evaluation DB template (tracked)
    monitoring_db.yaml.example      # Monitoring DB template (tracked)
    human_signals_db.yaml.example   # Human Signals DB template (tracked)
    kpi_db.yaml.example             # KPI DB template (tracked)
    agent_replay_db.yaml.example    # Agent Replay search DB template (tracked)
    theme.yaml.example              # Theme + branding template (tracked)
    agents.yaml.example             # Agent registry template (tracked)
    signals_metrics.yaml.example    # Signals dashboard template (tracked)
    duckdb.yaml.example             # DuckDB store template (tracked)
    memory.yaml.example             # Memory module template (tracked)
custom/                             # All site-specific files (git-ignored)
  config/
    eval_db.yaml                    # Your eval DB config
    monitoring_db.yaml              # Your monitoring DB config
    human_signals_db.yaml           # Your human signals DB config
    kpi_db.yaml                     # Your KPI DB config
    agent_replay_db.yaml            # Your replay DB config
    theme.yaml                      # Your theme config
    agents.yaml                     # Your agents config
    signals_metrics.yaml            # Your signals config
    duckdb.yaml                     # Your DuckDB config
    memory.yaml                     # Your memory config
  agents/                           # Agent avatar images
  branding/                         # Logo, hero, favicon, app icon
frontend/
  .env.local                        # Frontend env vars (git-ignored)
```

---

## Next Steps

<div class="grid cards" markdown>

-   :material-key-variant:{ .lg .middle } **Environment Variables**

    ---

    Complete reference for backend and frontend env vars.

    [:octicons-arrow-right-24: Environment Variables](environment-variables.md)

-   :material-file-cog:{ .lg .middle } **YAML Configs**

    ---

    Database auto-load and theme YAML file reference.

    [:octicons-arrow-right-24: YAML Configs](yaml-configs.md)

-   :material-database:{ .lg .middle } **Data Sources**

    ---

    CSV upload vs. Postgres auto-load ingestion patterns.

    [:octicons-arrow-right-24: Data Sources](data-sources.md)

-   :material-palette:{ .lg .middle } **Theming**

    ---

    Color palettes, logos, and hero images.

    [:octicons-arrow-right-24: Theming](theming.md)

-   :material-tag-text:{ .lg .middle } **Customization**

    ---

    White-label branding, agent registry, and signals layout.

    [:octicons-arrow-right-24: Customization](customization.md)

-   :material-account-group:{ .lg .middle } **Multi-Agent Teams**

    ---

    Per-agent credentials, KPI display, and trace lookup overrides.

    [:octicons-arrow-right-24: Multi-Agent Teams](multi-agent.md)

</div>
