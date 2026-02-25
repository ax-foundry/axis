---
icon: custom/customization
---

# Customization

AXIS is designed to be cloned, branded, and deployed as your own AI evaluation platform. All site-specific configuration lives in the gitignored `custom/` directory — your customizations never pollute the repo.

---

## Quick Start

```bash
# Create custom/ directory and copy all .example templates
make setup
```

This creates the `custom/` directory structure and copies `.example` templates from `backend/config/` into `custom/config/` with sensible defaults. It also creates symlinks for frontend assets (`custom/branding/`, `custom/agents/`). The app runs out of the box without editing anything.

!!! tip "Already have config files?"
    `make setup` is safe to re-run. It skips any files that already exist.

---

## What Can Be Customized

| Aspect | Config File | Section |
|--------|-------------|---------|
| App name, tagline, subtitle | `theme.yaml` | [Branding](#branding) |
| Color palette, hero image | `theme.yaml` | [Theming](theming.md) |
| Agent registry (names, avatars) | `agents.yaml` | [Agents](#agents) |
| Signals dashboard layout | `signals_metrics.yaml` | [Signals Display](#signals-display-config) |
| Evaluation DB connection | `eval_db.yaml` | [YAML Configs](yaml-configs.md#eval-db-eval_dbyaml) |
| Monitoring DB connection | `monitoring_db.yaml` | [YAML Configs](yaml-configs.md#monitoring-db-monitoring_dbyaml) |
| Human Signals DB connection | `human_signals_db.yaml` | [YAML Configs](yaml-configs.md#human-signals-db-human_signals_dbyaml) |
| KPI DB connection + display | `kpi_db.yaml` | [YAML Configs](yaml-configs.md#kpi-db-kpi_dbyaml) |
| Agent Replay search DB | `agent_replay_db.yaml` | [YAML Configs](yaml-configs.md#agent-replay-db-agent_replay_dbyaml) |
| Multi-agent teams | `agents.yaml` + per-agent overrides | [Multi-Agent](multi-agent.md) |

All config files follow the same pattern:

1. A `.example` template is tracked in git at `backend/config/`
2. `make setup` copies it to `custom/config/` as an active `.yaml` file (gitignored)
3. Edit the `.yaml` file in `custom/config/` to customize
4. Restart the backend to apply changes

---

## Config Load Order

AXIS resolves configuration in this order:

```
YAML file  →  Environment variables  →  Hardcoded defaults
 (highest)                                (lowest)
```

For theme settings specifically, YAML is loaded first as a base, then `AXIS_THEME_*` env vars override individual values. This lets you define a full palette in YAML and tweak one color at deploy time.

---

## Config Strategy for Custom Deployments

In the upstream AXIS repo, the entire `custom/` directory is **gitignored** — only `.example` templates in `backend/config/` are tracked. This prevents proprietary connection strings, agent names, and branding from leaking into the open-source repo.

When you fork or clone AXIS for your own product, you have three options for managing config:

### Option A: Commit configs directly (recommended for private repos)

If your fork is a **private repository**, remove the `custom/` directory from `.gitignore` and commit it. This is the simplest approach for internal teams.

```bash
# In your fork's .gitignore, comment out or remove:
# custom/

# Then commit your configs
git add custom/
git commit -m "Add project config files"
```

### Option B: Keep gitignored, inject at deploy time

Keep configs out of git and provide them through your deployment pipeline. Good for production environments with secrets management.

=== "Docker"

    Mount the entire `custom/` directory or individual config files. The `AXIS_CUSTOM_DIR` env var controls where the backend looks for configs:

    ```yaml
    services:
      backend:
        environment:
          AXIS_CUSTOM_DIR: /app/custom
        volumes:
          - ./my-configs:/app/custom/config
    ```

=== "Environment Variables"

    Override individual settings without YAML files at all:

    ```bash
    AXIS_THEME_ACTIVE=my_palette
    EVAL_DB_HOST=db.internal
    EVAL_DB_NAME=evaluations
    ```

=== "Kubernetes"

    Use ConfigMaps or Secrets, mounting into the custom config directory:

    ```yaml
    env:
      - name: AXIS_CUSTOM_DIR
        value: /app/custom
    volumeMounts:
      - name: axis-config
        mountPath: /app/custom/config
    ```

### Option C: Separate config repository

Some teams maintain a **private config repo** that gets merged or copied into the deployment artifact at build time. This keeps configs versioned without modifying the AXIS fork.

See [Repository Model](../development/repository-model.md) for the full recommended 3-repo split (framework + use-case + deploy/platform).

```bash
# At build/deploy time
cp -r ../axis-config/custom/ custom/
```

!!! tip "Which option should I pick?"
    - **Solo / small team, private repo** → Option A (commit directly)
    - **Production with CI/CD and secrets** → Option B (inject at deploy)
    - **Multiple environments or strict separation** → Option C (config repo)

---

## Branding

The `branding` section in `theme.yaml` controls text shown throughout the application — the landing page, sidebar, and exported reports.

!!! tip "Production best practice for image URLs"
    In production, prefer backend asset proxy URLs:
    - `/api/config/assets/branding/<file>`
    - `/api/config/assets/agents/<file>`

    This keeps frontend deploys independent from use-case asset files (Repo B). Plain `/branding/*` and `/agents/*` paths are mainly a local-dev convenience when assets are present in the frontend workspace.

```yaml title="custom/config/theme.yaml"
theme:
  branding:
    app_name: "MyProduct"
    tagline: "AI Quality Platform"
    subtitle: "The AI Evaluation Studio"
    description: "Intelligent Evaluation & Analytics"
    report_footer: "Report generated by MyProduct"
    docs_url: "https://docs.myproduct.com/"
    footer_name: "MyProduct Inc."
    footer_icon: "/api/config/assets/branding/my-footer-icon.png"

  active: "sage_green"
  palettes:
    # ... palette definitions
```

### Branding Fields

| Field | Default | Where it appears |
|-------|---------|-----------------|
| `app_name` | `AXIS` | Landing page title, sidebar brand name, image alt text |
| `tagline` | `AI Evaluation Platform` | Landing page badge above the title |
| `subtitle` | `The AI Evaluation Studio` | Landing page subtitle (gradient text) |
| `description` | `Agent X-ray Interface & Statistics` | Landing page acronym line |
| `report_footer` | `Report generated by AXIS AI Evaluation Platform` | Exported comparison reports |
| `docs_url` | `https://ax-foundry.github.io/axis/` | Documentation link in the UI |
| `footer_name` | (falls back to `app_name`) | Footer brand name in the UI |
| `footer_icon` | -- | Optional footer icon image path or URL |

### Frontend Usage

In frontend code, branding is accessed via the `useBranding()` hook:

```tsx
import { useBranding } from '@/lib/theme';

function MyComponent() {
  const branding = useBranding();
  return <h1>{branding.app_name}</h1>;
}
```

!!! warning "Never hardcode branding strings"
    Always use `useBranding()` instead of writing `"AXIS"` directly in components.
    This ensures white-labeled deployments show the correct text everywhere.

---

## Agents

The agent registry defines the AI agents shown in the SourceSelector bar and throughout the dashboard. Each agent maps to a `source_name` value in your monitoring or signals data.

### Configuration

```yaml title="custom/config/agents.yaml"
agents:
  - name: my_agent        # Must match source_name in data
    label: "My Agent"      # Display name in the UI
    role: "Assistant"      # Short description shown under the name
    avatar: "/api/config/assets/agents/my_agent.png"  # Production-recommended path
    description: "Handles customer onboarding"
    biography: "My Agent was built to streamline..."
    active: true
    trace_names:           # Langfuse trace name aliases
      - "my_agent_v1"
      - "my-agent-production"
```

### Agent Fields

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | Yes | -- | Must exactly match the `source_name` value in your data |
| `label` | Yes | -- | Display name shown in the SourceSelector and dashboards |
| `role` | No | -- | Short role description shown below the agent name |
| `avatar` | No | -- | Path to avatar image (relative to web root; place files in `custom/agents/`). Supports PNG, JPG, ICO, SVG |
| `description` | No | -- | Short description shown in agent cards |
| `biography` | No | -- | Longer biography text shown in the "Meet the Team" modal on the landing page |
| `active` | No | `true` | Whether the agent is active. Inactive agents are hidden from the SourceSelector |
| `trace_names` | No | `[]` | List of Langfuse trace name aliases. Used by Agent Replay to match traces to this agent when the trace name differs from `name` |

### Avatar Images

Place agent avatar images in `custom/agents/`:

```
custom/agents/
  my_agent.png     → accessible at /agents/my_agent.png
  other_agent.ico  → accessible at /agents/other_agent.ico
```

`make setup` creates a symlink so that files in `custom/agents/` are served by Next.js at `/agents/`. The `custom/` directory is gitignored (avatars are site-specific).

For production deployments with separate frontend/backend hosting, prefer:

```yaml
avatar: "/api/config/assets/agents/my_agent.png"
```

This serves assets from the backend (using `AXIS_CUSTOM_DIR`) and avoids coupling frontend builds to branding/avatar file injection.

!!! tip "Fallback behavior"
    If an agent from the data doesn't have a matching entry in `agents.yaml`,
    it still appears in the SourceSelector with a generic bot icon and the
    raw `source_name` as the label.

### Frontend Usage

Agent configs are loaded from the backend API at startup. In code:

```tsx
import { getAgentConfig, getAgentRegistry } from '@/config/agents';

// Look up a specific agent
const agent = getAgentConfig('my_agent');

// Get all registered agents
const allAgents = getAgentRegistry();
```

---

## Signals Display Config

The `signals_metrics.yaml` file controls how the Human Signals V2 dashboard renders KPIs, charts, and colors. It overrides auto-discovered defaults with domain-specific preferences.

!!! info "Optional file"
    If this file doesn't exist, the Signals dashboard auto-generates a layout
    from the data schema. The config file lets you customize what's highlighted.

```yaml title="custom/config/signals_metrics.yaml"
signals_metrics:
  # KPI strip at the top of the dashboard
  kpi_strip:
    - metric: intervention_type
      signal: is_stp
      label: "STP Rate"
      format: percent
      icon: zap
      highlight: true
    - aggregate: total_cases
      label: "Total Cases"
      icon: database

  # Chart sections with layout control
  chart_sections:
    - title: "Outcome Distribution"
      layout: full              # full | grid_2 | grid_3
      charts:
        - metric: resolution_status
          signal: final_status
          type: stacked_bar     # bar | donut | horizontal_bar | stacked_bar | ranked_list | single_stat
          title: "Resolution Status"

    - title: "Category Analysis"
      layout: grid_2
      charts:
        - metric: escalation_type
          signal: escalation_type
          type: donut
          title: "Escalation Breakdown"
        - metric: failed_step
          signal: failed_step
          type: horizontal_bar
          title: "Top Failure Modes"

  # Map signal values to specific colors
  color_maps:
    resolution_status__final_status:
      approved: "#8B9F4F"
      declined: "#E74C3C"
      blocked: "#C0392B"

  # Source filter dropdowns
  source_filters:
    - field: source_name
      label: "Source"
    - field: environment
      label: "Environment"
```

### KPI Strip Fields

| Field | Description |
|-------|-------------|
| `metric` | Metric name from data (paired with `signal`) |
| `signal` | Signal key within the metric |
| `aggregate` | Built-in aggregate: `avg_message_count`, `total_cases` |
| `label` | Display label |
| `format` | `percent` or `number` |
| `icon` | Lucide icon name (e.g., `zap`, `target`, `database`) |
| `highlight` | `true` to visually emphasize this KPI |

### Chart Types

| Type | Best for |
|------|----------|
| `bar` | Comparing counts across categories |
| `stacked_bar` | Showing composition over categories |
| `horizontal_bar` | Ranked lists with long labels |
| `donut` | Proportional breakdowns |
| `ranked_list` | Top-N lists (e.g., feature requests) |
| `single_stat` | Single boolean/count metric |

---

## White-Label Checklist

When deploying AXIS as a branded product:

- [ ] Run `make setup` to create the `custom/` directory and config files
- [ ] Edit `custom/config/theme.yaml` — set branding text and create a custom color palette
- [ ] Edit `custom/config/agents.yaml` — register your agents with names, roles, and avatars
- [ ] Place branding images in `custom/branding/` (served via `/api/config/assets/branding/`) and agent avatars in `custom/agents/`
- [ ] Edit `custom/config/signals_metrics.yaml` — customize the Signals dashboard layout (if using)
- [ ] Configure database connections in `custom/config/*_db.yaml` files (if using auto-load)
- [ ] Set `AXIS_THEME_ACTIVE` to your custom palette name
- [ ] Restart the backend and verify the UI reflects your branding

---

## File Layout

```
backend/
  config/
    theme.yaml.example              # Template (tracked in git)
    agents.yaml.example             # Template (tracked in git)
    signals_metrics.yaml.example    # Template (tracked in git)
    eval_db.yaml.example            # Template (tracked in git)
    monitoring_db.yaml.example      # Template (tracked in git)
    human_signals_db.yaml.example   # Template (tracked in git)
    kpi_db.yaml.example             # Template (tracked in git)
    agent_replay_db.yaml.example    # Template (tracked in git)
    duckdb.yaml.example             # Template (tracked in git)
    memory.yaml.example             # Template (tracked in git)
custom/                             # All site-specific files (gitignored)
  config/
    theme.yaml                      # Your theme config
    agents.yaml                     # Your agents config
    signals_metrics.yaml            # Your signals config
    eval_db.yaml                    # Your eval DB config
    monitoring_db.yaml              # Your monitoring DB config
    human_signals_db.yaml           # Your human signals DB config
    kpi_db.yaml                     # Your KPI DB config
    agent_replay_db.yaml            # Your replay DB config
    duckdb.yaml                     # Your DuckDB config
    memory.yaml                     # Your memory config
  agents/                           # Agent avatar images
    alpha_bot.png
  branding/                         # Logo, hero, favicon, app icon
    hero.jpg
    logo.svg
```

---

## Related

- [Theming](theming.md) — detailed color palette and hero image configuration
- [YAML Configs](yaml-configs.md) — database auto-load configuration
- [Environment Variables](environment-variables.md) — env var reference and overrides
