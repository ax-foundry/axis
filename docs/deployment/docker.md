---
icon: custom/docker
---

# Docker

AXIS includes Dockerfiles for both services and a `docker-compose.yml` at the repository root for one-command orchestration.

---

## Prerequisites

- [Docker Engine](https://docs.docker.com/engine/install/) 20.10+ (or Docker Desktop)
- [Docker Compose](https://docs.docker.com/compose/install/) v2+

---

## Quick Start with Docker Compose

From the repository root:

```bash
# Create a root-level .env (used by docker-compose.yml)
cat > .env <<'EOF'
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
DB_PASSWORD=your_db_password
EOF

# Start services (frontend, backend, falkordb)
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | [http://localhost:3500](http://localhost:3500) |
| Backend | [http://localhost:8500](http://localhost:8500) |
| API Docs | [http://localhost:8500/docs](http://localhost:8500/docs) |
| FalkorDB | `localhost:6379` |

Press ++ctrl+c++ to stop both services.

---

## docker-compose.yml Reference

The default Compose file ships configured for **development** (hot-reload, volume mounts):

```yaml title="docker-compose.yml"
services:
  falkordb:
    image: falkordb/falkordb:latest
    ports:
      - "6379:6379"
    volumes:
      - ./data/falkordb:/var/lib/falkordb/data

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3500:3500"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8500
    volumes:
      - ./frontend:/app
      - /app/node_modules
      - /app/.next
    depends_on:
      - backend
    command: npm run dev

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8500:8500"
    environment:
      - HOST=0.0.0.0
      - PORT=8500
      - DEBUG=true
      - FRONTEND_URL=http://localhost:3500
      - GRAPH_DB_HOST=${GRAPH_DB_HOST:-falkordb}
      - GRAPH_DB_PORT=${GRAPH_DB_PORT:-6379}
      - GRAPH_DB_NAME=${GRAPH_DB_NAME:-knowledge_graph}
      - GRAPH_DB_PASSWORD=${GRAPH_DB_PASSWORD:-}
    env_file:
      - .env
    volumes:
      - ./backend:/app
      - ./data:/app/data
    command: uvicorn app.main:app --host 0.0.0.0 --port 8500 --reload
    depends_on:
      - falkordb

volumes:
  node_modules:
```

### Key Points

| Setting | Purpose |
|---------|---------|
| `NEXT_PUBLIC_API_URL` | Tells the frontend where the backend lives |
| `FRONTEND_URL` | Primary frontend origin allowed by backend CORS |
| `FRONTEND_URLS` | Optional comma-separated additional CORS origins (e.g. preview URLs) |
| `GRAPH_DB_*` | Connects backend graph endpoints to FalkorDB |
| `env_file: [.env]` | Injects backend secrets (API keys, DB credentials) |
| `depends_on` | Ensures service startup order (`frontend -> backend`, `backend -> falkordb`) |
| Volume mounts | Enable hot-reload during development |

---

## Environment Variables in Docker

Environment variables can be provided in three ways:

=== "Inline in Compose"

    ```yaml
    environment:
      - DEBUG=true
      - FRONTEND_URL=http://localhost:3500
    ```

=== "env_file"

    ```yaml
    env_file:
      - .env
    ```

    The `.env` file should live at the repository root (next to `docker-compose.yml`). It is git-ignored by default.

=== "Shell export"

    ```bash
    export OPENAI_API_KEY=sk-...
    docker compose up
    ```

    Docker Compose automatically interpolates host environment variables into the Compose file.

!!! warning "Never bake secrets into an image"
    Do not use `ENV` in a Dockerfile for API keys or passwords. Pass them at runtime via `environment` or `env_file` in Compose, or via your orchestrator's secrets manager.

---

## Building Production Images

The Dockerfiles support multi-stage builds. To build production-optimized images:

### Frontend

The frontend Dockerfile has four stages: `base`, `deps`, `builder`, and `runner`. The final `runner` stage produces a minimal image with only the standalone Next.js output.

```bash
docker build \
  --target runner \
  -t axis-frontend:latest \
  ./frontend
```

The production image runs as a non-root user (`nextjs`, UID 1001) and serves the standalone bundle via `node server.js`.

### Backend

```bash
docker build \
  -t axis-backend:latest \
  ./backend
```

The backend image runs as a non-root user (`appuser`, UID 1000). The default command is already production-oriented (no hot-reload) and is compatible with platforms like Cloud Run using `${PORT}`:

```bash
docker run -p 8500:8500 \
  -e PORT=8500 \
  -e DEBUG=false \
  -e FRONTEND_URL=https://your-frontend.example.com \
  -e FRONTEND_URLS=https://your-frontend.example.com,https://preview-your-team.vercel.app \
  --env-file .env \
  axis-backend:latest
```

---

## Production Compose Override

For production, create a `docker-compose.prod.yml` override that removes volume mounts and dev commands:

```yaml title="docker-compose.prod.yml"
services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      target: runner
    volumes: []  # No source mounts in production
    command: ["node", "server.js"]
    environment:
      - NEXT_PUBLIC_API_URL=https://api.your-domain.com

  backend:
    volumes: []  # No source mounts in production
    environment:
      - DEBUG=false
      - FRONTEND_URL=https://your-domain.com
      - FRONTEND_URLS=https://your-domain.com,https://preview-your-team.vercel.app
      - PORT=8500
```

Run with both files:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

---

## Useful Commands

```bash
# Rebuild images after dependency changes
docker compose build --no-cache

# View logs
docker compose logs -f backend
docker compose logs -f frontend

# Run a one-off command in the backend container
docker compose exec backend python -m pytest

# Tear down containers and volumes
docker compose down -v
```

---

## Related

- [Production](production.md) -- reverse proxy, health checks, and scaling
- [Security](security.md) -- secrets management and hardening
- [Environment Variables](../configuration/environment-variables.md) -- full env var reference
