# custom/ - Site-Specific Configuration

This directory holds all deployment-specific files for your AXIS instance. Everything here is **gitignored** (except this README) so you can safely customize without affecting the upstream repo.

## Directory Structure

```
custom/
├── README.md        # This file (tracked in git)
├── config/          # YAML configuration files
├── branding/        # Hero images, logos, favicons
└── agents/          # Agent avatar images
```

## Quick Start

```bash
make setup   # Creates custom/ and copies .example templates
```

This copies every `backend/config/*.yaml.example` template into `custom/config/` with the `.example` suffix stripped, and creates symlinks so the frontend can serve branding and agent images.

## Config Files

| File | Purpose |
|------|---------|
| `theme.yaml` | Color palettes, branding text, hero image settings |
| `agents.yaml` | Agent registry (name, label, role, avatar) |
| `signals_metrics.yaml` | Human Signals display config (KPIs, charts, colors) |
| `eval_db.yaml` | Evaluation database connection |
| `monitoring_db.yaml` | Monitoring database connection |
| `human_signals_db.yaml` | Human signals database connection |
| `kpi_db.yaml` | KPI database connection |
| `duckdb.yaml` | DuckDB embedded store settings |
| `memory.yaml` | Memory/rule-extraction display config |
| `agent_replay.yaml` | Agent replay (Langfuse) settings |
| `agent_replay_db.yaml` | Agent replay lookup database connection |

Each file has a corresponding `.example` template in `backend/config/` documenting all available keys.

## Load Order

The backend resolves configuration in this order:

1. **YAML file** in `custom/config/` (if present)
2. **Environment variables** (override YAML values)
3. **Hardcoded defaults** in `backend/app/config.py`

## AXIS_CUSTOM_DIR

Override the location of this directory with the `AXIS_CUSTOM_DIR` environment variable:

```bash
# Local development (default)
AXIS_CUSTOM_DIR=./custom

# Docker
AXIS_CUSTOM_DIR=/app/custom

# Shared volume
AXIS_CUSTOM_DIR=/mnt/axis-config
```

## Image Paths

- **Branding**: Place images in `custom/branding/`, reference as `/branding/<filename>` in `theme.yaml`
- **Agents**: Place avatars in `custom/agents/`, reference as `/agents/<filename>` in `agents.yaml`

Branding images get a 1-year immutable cache header. Use filename changes (not overwrites) when updating assets.

## Symlinks

On macOS/Linux, `make setup` creates symlinks:

```
frontend/public/branding -> ../../custom/branding
frontend/public/agents   -> ../../custom/agents
```

On Windows, use `--no-symlinks` to copy files instead:

```bash
scripts/setup-config.sh --no-symlinks
```
