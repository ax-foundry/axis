---
icon: material/account-group
---

# Multi-Agent Teams

AXIS supports multi-agent deployments where several AI agents share a single AXIS instance. Each agent can have its own identity, credentials, KPI display preferences, and trace lookup configuration. This page consolidates the per-agent settings that are spread across multiple config files.

---

## Overview

When your platform runs multiple agents (e.g., one for customer support, another for order processing), AXIS lets you:

- **Show each agent's identity** — name, avatar, role, and biography in the UI
- **Connect separate Langfuse projects** — per-agent API keys for Agent Replay
- **Customize KPI display** — different visible KPIs, card values, and trend lines per agent
- **Search different DB tables** — per-agent trace lookup tables for the Replay search feature
- **Filter dashboards** — the SourceSelector bar lets users switch between agents

All per-agent configuration is **optional**. Without it, AXIS treats all data uniformly.

---

## 1. Agent Registry — `agents.yaml`

The agent registry defines who your agents are. Each entry maps to a `source_name` value in your monitoring, KPI, or signals data.

```yaml title="custom/config/agents.yaml"
agents:
  - name: alpha_bot             # Must match source_name in data
    label: "Alpha Bot"
    role: "Customer Support"
    avatar: "/agents/alpha_bot.png"
    description: "Handles inbound customer requests"
    biography: |
      ## About Alpha Bot
      Alpha Bot processes inbound customer requests using a multi-step
      reasoning pipeline with tool access.
    active: true
    trace_names:              # Langfuse trace aliases
      - "alpha_bot-gpt4"
      - "alpha_bot-production"

  - name: beta_bot
    label: "Beta Bot"
    role: "Order Processing"
    avatar: "/agents/beta_bot.png"
    description: "Manages order workflows end to end"
    active: true
    trace_names:
      - "beta_bot-v2"
```

### Key fields

| Field | Purpose |
|-------|---------|
| `name` | Must **exactly match** the `source_name` column in your data |
| `trace_names` | Langfuse trace names that should map to this agent (useful when trace names differ from `name`) |
| `active` | Set to `false` to hide the agent from the SourceSelector |

See [Customization > Agents](customization.md#agents) for the full field reference.

---

## 2. Per-Agent Langfuse Credentials

By default, Agent Replay uses the global `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY`. When agents live in **separate Langfuse projects**, provide per-agent credentials using this naming pattern:

```env title="backend/.env"
# Global fallback
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com

# Per-agent overrides
LANGFUSE_ALPHA_BOT_PUBLIC_KEY=pk-lf-alpha-...
LANGFUSE_ALPHA_BOT_SECRET_KEY=sk-lf-alpha-...

LANGFUSE_BETA_BOT_PUBLIC_KEY=pk-lf-beta-...
LANGFUSE_BETA_BOT_SECRET_KEY=sk-lf-beta-...
```

Agent names in env vars are **canonicalized**: uppercased, hyphens converted to underscores. So `my-agent` becomes `LANGFUSE_MY_AGENT_PUBLIC_KEY`.

AXIS discovers these automatically at startup — no YAML entry needed.

---

## 3. Per-Agent KPI Display — `kpi_db.yaml`

The KPI dashboard can show different metrics and display styles per agent.

### Visibility overrides

Control which KPIs appear when a specific agent is selected:

```yaml title="custom/config/kpi_db.yaml"
kpi_db:
  # Global: show these KPIs for all agents
  visible_kpis:
    - auto_resolve_rate
    - escalation_rate
    - time_to_response

  # Per-agent: override when an agent is selected
  visible_kpis_per_source:
    alpha_bot:
      - auto_resolve_rate
      - escalation_rate
      - actionable_output_rate
    beta_bot:
      - time_to_response
      - correction_rate
      - resolution_accuracy
```

### Display overrides

Customize card values and trend lines per agent:

```yaml title="custom/config/kpi_db.yaml"
kpi_db:
  # Global defaults
  card_display_value: "latest"
  trend_lines: ["daily", "avg_7d", "avg_30d"]

  # Per-agent display overrides
  display_per_source:
    alpha_bot:
      card_display_value: avg_7d
      trend_lines: [daily, avg_7d]
      kpi_overrides:
        auto_resolve_rate:
          card_display_value: avg_30d
    beta_bot:
      card_display_value: latest
```

**Resolution order** (first match wins):

1. `display_per_source.<agent>.kpi_overrides.<kpi>` — agent + KPI specific
2. `display_per_source.<agent>` — agent-level default
3. `kpi_overrides.<kpi>` — global KPI override
4. Top-level `card_display_value` / `trend_lines` — global default

See [YAML Configs > KPI DB](yaml-configs.md#kpi-db-kpi_dbyaml) for the full reference.

---

## 4. Per-Agent Trace Lookup — `agent_replay_db.yaml`

When different agents store their trace mappings in different database tables (or use different business identifiers), configure per-agent overrides:

```yaml title="custom/config/agent_replay_db.yaml"
agent_replay_db:
  enabled: true
  url: "postgresql://axis_reader:${DB_PASSWORD}@db.example.com:5432/traces"

  # Defaults (used when no agent override matches)
  schema: public
  table: trace_lookup
  search_column: case_reference
  search_column_label: Case Reference
  trace_id_column: langfuse_trace_id

  # Per-agent overrides
  agents:
    alpha_bot:
      table: alpha_bot_cases
      search_column: case_reference
      search_column_label: Case Reference
    beta_bot:
      table: beta_bot_orders
      search_column: ticket_number
      search_column_label: Ticket Number
      trace_id_column: trace_id
```

Only specify the fields that differ — everything else inherits from the top-level defaults. Agent names are canonicalized (lowercased, hyphens → underscores).

See [YAML Configs > Agent Replay DB](yaml-configs.md#agent-replay-db-agent_replay_dbyaml) for the full reference.

---

## 5. How Agent Filtering Works

Across the AXIS UI, the **SourceSelector** bar lets users pick an agent. When an agent is selected:

| Module | What happens |
|--------|-------------|
| **Production / KPIs** | Filters KPI data by `source_name`, applies `visible_kpis_per_source` and `display_per_source` overrides |
| **Monitoring** | Filters time-series by `source_name` |
| **Human Signals** | Filters signals by `source_name` |
| **Agent Replay** | Uses per-agent Langfuse credentials and per-agent search DB table/columns |
| **Memory** | Filters extracted rules by `agent_name` |

The `source_name` value in your data **must exactly match** the `name` field in `agents.yaml`.

---

## Minimal Example

A two-agent setup with separate Langfuse projects and custom KPI display:

```yaml title="custom/config/agents.yaml"
agents:
  - name: alpha_bot
    label: "Alpha Bot"
    role: "Customer Support"
    avatar: "/agents/alpha_bot.png"
  - name: beta_bot
    label: "Beta Bot"
    role: "Order Processing"
    avatar: "/agents/beta_bot.png"
```

```env title="backend/.env"
LANGFUSE_ALPHA_BOT_PUBLIC_KEY=pk-lf-...
LANGFUSE_ALPHA_BOT_SECRET_KEY=sk-lf-...
LANGFUSE_BETA_BOT_PUBLIC_KEY=pk-lf-...
LANGFUSE_BETA_BOT_SECRET_KEY=sk-lf-...
AGENT_REPLAY_ENABLED=true
```

```yaml title="custom/config/kpi_db.yaml"
kpi_db:
  enabled: true
  auto_load: true
  url: "postgresql://..."
  query: "SELECT ... FROM agent_kpi_logs ..."
  visible_kpis_per_source:
    alpha_bot: [auto_resolve_rate, escalation_rate]
    beta_bot: [time_to_response, resolution_accuracy]
```

---

## Related

- [Customization > Agents](customization.md#agents) — agent registry field reference
- [YAML Configs > KPI DB](yaml-configs.md#kpi-db-kpi_dbyaml) — KPI database and display config
- [YAML Configs > Agent Replay DB](yaml-configs.md#agent-replay-db-agent_replay_dbyaml) — trace lookup DB config
- [Environment Variables > Agent Replay](environment-variables.md#agent-replay) — Langfuse credential env vars
- [Agent Replay Guide](../guides/agent-replay-guide.html) — user guide for the Replay feature
