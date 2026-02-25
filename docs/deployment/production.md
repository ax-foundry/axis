---
icon: custom/deployment
---

# Production Deployment

This guide covers the recommended setup for running AXIS in a production environment. The core pattern is: **build container images, place a reverse proxy in front, and configure environment variables for production.**

---

## Production Architecture

```mermaid
flowchart TD
    Client[Browser] -->|HTTPS| LB[Load Balancer / Reverse Proxy]
    LB -->|/| FE[Frontend :3500]
    LB -->|/api/*| BE[Backend :8500]
    BE --> PG[(PostgreSQL)]
    PG -->|Split sync| SE[Sync Engine]
    SE --> DUCK[(DuckDB<br/>Analytics Store)]
    BE --> DUCK
    BE --> GDB[(FalkorDB)]
    BE --> LLM[LLM Provider API]
```

The reverse proxy handles TLS termination, gzip compression, and routes traffic to the appropriate service based on path prefix. The sync engine reads from PostgreSQL and writes to a local DuckDB file that serves all analytics queries.

---

## Recommended Pattern: Vercel + GCP

For most teams, a strong default is:

- **Frontend on Vercel** (Next.js hosting, previews, CDN edge delivery)
- **Backend on GCP Cloud Run** (containerized FastAPI API)

Benefits:

- Independent deploy/release cadence for frontend and backend
- Frontend previews without redeploying backend
- Managed autoscaling for the API

Key requirements:

- Set `NEXT_PUBLIC_API_URL` in Vercel to your Cloud Run URL
- Set backend `FRONTEND_URL` (and optionally `FRONTEND_URLS`) to your Vercel origins
- If using FalkorDB, host it where Cloud Run can reach it (private network/VPC as needed)

---

## Reverse Proxy Setup

Any reverse proxy works (Nginx, Caddy, Traefik, AWS ALB, Cloudflare Tunnel). Below are examples for the two most common choices.

=== "Nginx"

    ```nginx title="nginx.conf"
    upstream frontend {
        server frontend:3500;
    }

    upstream backend {
        server backend:8500;
    }

    server {
        listen 443 ssl http2;
        server_name axis.your-domain.com;

        ssl_certificate     /etc/ssl/certs/axis.pem;
        ssl_certificate_key /etc/ssl/private/axis.key;

        # Compression
        gzip on;
        gzip_types text/plain application/json application/javascript text/css;

        # Frontend
        location / {
            proxy_pass http://frontend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Backend API
        location /api/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # SSE support (AI Copilot streaming)
            proxy_buffering off;
            proxy_cache off;
            proxy_read_timeout 300s;
        }

        # Health check pass-through
        location /health {
            proxy_pass http://backend/health;
        }
    }
    ```

=== "Caddy"

    ```caddyfile title="Caddyfile"
    axis.your-domain.com {
        # Frontend
        reverse_proxy / frontend:3500

        # Backend API
        reverse_proxy /api/* backend:8500
        reverse_proxy /health backend:8500
        reverse_proxy /docs backend:8500
        reverse_proxy /openapi.json backend:8500
    }
    ```

    Caddy handles TLS certificates automatically via Let's Encrypt.

!!! tip "SSE endpoints"
    The AI Copilot uses Server-Sent Events for streaming responses. Make sure your proxy has `proxy_buffering off` (Nginx) or equivalent to avoid buffering SSE chunks.

---

## Environment Configuration

### Frontend

The frontend has a single required variable. It is set at **build time** because Next.js inlines `NEXT_PUBLIC_*` values into the JavaScript bundle.

```env title="Frontend environment"
NEXT_PUBLIC_API_URL=https://api.your-domain.com
```

!!! warning "Build-time variable"
    `NEXT_PUBLIC_API_URL` is embedded during `npm run build`. If you change the backend URL, you must rebuild the frontend image.

### Backend

```env title="Backend environment"
# Server
HOST=0.0.0.0
# Cloud Run sets PORT automatically; keep default 8500 for local containers
PORT=8500
DEBUG=false

# CORS -- must include your production frontend origin
FRONTEND_URL=https://axis.your-domain.com
# Optional additional origins (comma-separated), useful for preview/staging domains
FRONTEND_URLS=https://axis.your-domain.com,https://preview-your-team.vercel.app

# AI keys (required for Copilot and LLM judge features)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
LLM_MODEL_NAME=gpt-4o-mini

# Database (if using PostgreSQL auto-load)
EVAL_DB_URL=postgresql://user:pass@db-host:5432/axis_eval
MONITORING_DB_URL=postgresql://user:pass@db-host:5432/axis_monitoring
HUMAN_SIGNALS_DB_URL=postgresql://user:pass@db-host:5432/axis_human_signals

# Graph DB (if using Memory -> Knowledge Graph)
GRAPH_DB_HOST=falkordb.internal
GRAPH_DB_PORT=6379
GRAPH_DB_NAME=knowledge_graph
GRAPH_DB_PASSWORD=...
```

See the [Environment Variables](../configuration/environment-variables.md) reference for the complete list.

---

## Health Checks

The backend exposes two health endpoints:

### `GET /` -- Simple ping

Returns the service name and version. Useful for basic liveness probes.

```json
{
  "status": "healthy",
  "service": "AXIS API",
  "version": "0.1.0"
}
```

### `GET /health` -- Component health

Returns the status of internal components. Use this for readiness probes.

```json
{
  "status": "healthy",
  "components": {
    "api": "up",
    "data_processor": "up"
  }
}
```

### Wiring Health Checks

=== "Docker Compose"

    ```yaml
    services:
      backend:
        healthcheck:
          test: ["CMD", "curl", "-f", "http://localhost:8500/health"]
          interval: 30s
          timeout: 10s
          retries: 3
          start_period: 15s
    ```

=== "Kubernetes"

    ```yaml
    livenessProbe:
      httpGet:
        path: /
        port: 8500
      initialDelaySeconds: 10
      periodSeconds: 30

    readinessProbe:
      httpGet:
        path: /health
        port: 8500
      initialDelaySeconds: 5
      periodSeconds: 10
    ```

=== "AWS ECS"

    ```json
    {
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8500/health || exit 1"],
        "interval": 30,
        "timeout": 10,
        "retries": 3,
        "startPeriod": 15
      }
    }
    ```

---

## Uvicorn Configuration

In production, run Uvicorn **without** `--reload` and with multiple workers:

```bash
uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8500 \
  --workers 4 \
  --log-level info \
  --access-log
```

| Flag | Dev | Prod |
|------|-----|------|
| `--reload` | Yes | **No** |
| `--workers` | 1 (default) | 2--4 (1 per CPU core) |
| `--log-level` | `debug` | `info` or `warning` |
| `--access-log` | Optional | Recommended |

!!! note "Worker count"
    Each Uvicorn worker is an independent process. Start with `--workers 2` and increase based on load. If you run behind a process manager like Gunicorn, use its worker model instead:

    ```bash
    gunicorn app.main:app \
      -w 4 \
      -k uvicorn.workers.UvicornWorker \
      --bind 0.0.0.0:8500
    ```

---

## Database Configuration in Production

AXIS supports three database connections (evaluation, monitoring, human signals). Each can be configured via YAML files or environment variables.

### Option 1 -- Environment variables

Set connection URLs directly in your deployment environment:

```env
EVAL_DB_URL=postgresql://user:pass@db-host:5432/axis_eval
EVAL_DB_AUTO_LOAD=true
EVAL_DB_QUERY=SELECT * FROM evaluations WHERE created_at > NOW() - INTERVAL '30 days'
```

### Option 2 -- YAML config files

Bake YAML files into the image or mount them at runtime:

```yaml title="custom/config/eval_db.yaml"
eval_db:
  enabled: true
  auto_load: true
  url: "postgresql://axis_user:${DB_PASSWORD}@db-host:5432/axis_eval"
  ssl_mode: require

  dataset_query: |
    SELECT id AS dataset_id, experiment_name AS evaluation_name,
           input AS query, output AS actual_output, expected AS expected_output
    FROM evaluations
    WHERE created_at > NOW() - INTERVAL '30 days'

  results_query: |
    SELECT eval_id AS dataset_id, metric_name, score AS metric_score
    FROM metrics
    WHERE created_at > NOW() - INTERVAL '30 days'

  query_timeout: 60
  row_limit: 50000
```

### Providing YAML files to containers

Set `AXIS_CUSTOM_DIR` so `resolve_config_path()` finds your files inside the container. See [Customization > Deployment Strategies](../configuration/customization.md) for full examples.

=== "Bake into image"

    Add the custom directory during the Docker build:

    ```dockerfile
    COPY custom/ /app/custom/
    ENV AXIS_CUSTOM_DIR=/app/custom
    ```

=== "Volume mount"

    Mount at runtime via Compose or CLI:

    ```yaml
    environment:
      - AXIS_CUSTOM_DIR=/app/custom
    volumes:
      - ./custom:/app/custom:ro
    ```

=== "Kubernetes ConfigMap"

    ```yaml
    env:
      - name: AXIS_CUSTOM_DIR
        value: /app/custom
    volumeMounts:
      - name: axis-config
        mountPath: /app/custom/config
        readOnly: true
    volumes:
      - name: axis-config
        configMap:
          name: axis-db-configs
    ```

!!! info "YAML takes precedence"
    When a YAML config file exists, the corresponding environment variables are ignored entirely. See [Configuration > YAML Configs](../configuration/yaml-configs.md) for details.

---

## DuckDB Storage

The backend uses an embedded DuckDB file as an analytics cache. In containerized deployments, mount a persistent volume so the DuckDB file survives container restarts:

```yaml title="docker-compose.yml"
services:
  backend:
    volumes:
      - axis-data:/app/data
volumes:
  axis-data:
```

Configure DuckDB via `custom/config/duckdb.yaml`:

```yaml
duckdb:
  enabled: true
  path: "data/local_store.duckdb"
  sync_mode: "startup"
  sync_workers: 4
```

For production sync patterns (incremental sync, periodic scheduler, watermark management), see the [DuckDB Sync Runbook](duckdb-sync-runbook.md).

---

## Scaling Considerations

### Frontend

The Next.js standalone build is stateless. Scale horizontally by running multiple replicas behind a load balancer. No session affinity is required.

### Backend

The backend maintains a local DuckDB file for analytics queries. When scaling:

- **Single replica (recommended)**: The DuckDB file is local to the process. A single replica with multiple Uvicorn workers shares the same DuckDB file. The sync engine uses OS file locks to coordinate writes.
- **Multiple replicas**: Each replica manages its own DuckDB file and sync cycle. All replicas read from the same Postgres source, so data is eventually consistent. This is acceptable for read-heavy workloads.
- **CSV upload mode**: Data is held in memory per worker. Uploads only affect the replica that received the request. Acceptable for single-user or demo deployments.

### Resource Estimates

| Service | CPU | Memory | Notes |
|---------|-----|--------|-------|
| Frontend | 0.25 vCPU | 256 MB | Static assets, minimal server logic |
| Backend (per worker) | 0.5 vCPU | 512 MB--1 GB | Scales with dataset size; DuckDB sync and Pandas are memory-bound |

---

## Related

- [Docker](docker.md) -- image building and Compose reference
- [DuckDB Sync Runbook](duckdb-sync-runbook.md) -- one-time backfill + daily scheduled sync
- [Security](security.md) -- secrets, CORS, and hardening
- [Environment Variables](../configuration/environment-variables.md) -- complete env var reference
- [Data Sources](../configuration/data-sources.md) -- CSV vs. database ingestion patterns
