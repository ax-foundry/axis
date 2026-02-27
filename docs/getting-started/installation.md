---
icon: custom/installation
---

# Installation

This page covers prerequisites, dependency installation, and environment file setup for **local development**. For containerized deployment, see the [Docker guide](../deployment/docker.md).

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 20+ | Frontend runtime |
| **Python** | 3.12+ | Backend runtime |
| **npm** | (bundled with Node) | Frontend package manager |
| **pip** | (bundled with Python) | Backend package manager |
| **make** | any | Task runner (Makefile) |

!!! tip "Version check"
    Verify your versions before proceeding:

    ```bash
    node --version   # v20.x.x
    python --version # 3.12.x
    make --version
    ```

---

## Install Dependencies

### One-command install (recommended)

From the repository root:

```bash
make install
```

This runs `pip install -e ".[dev,graph]"` in `backend/` and `npm install` in `frontend/`, plus installs pre-commit hooks.

### Manual install

If you prefer to install each service separately:

=== "Backend"

    ```bash
    cd backend
    pip install -e .               # runtime only
    pip install -e ".[dev]"        # + linters & tests
    pip install -e ".[dev,graph]"  # full development with graph features
    ```

=== "Frontend"

    ```bash
    cd frontend
    npm install
    ```

---

## Environment Files

AXIS uses `.env` files for configuration. These files are git-ignored and must be created manually.

### Backend: `backend/.env`

Create `backend/.env` with your server settings and optional API keys:

```env title="backend/.env"
# Server (required)
HOST=127.0.0.1
PORT=8500
DEBUG=true
FRONTEND_URL=http://localhost:3500

# AI / Copilot (optional)
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
LLM_MODEL_NAME=gpt-4
```

!!! warning "Keep secrets out of version control"
    Never commit `.env` files. The `.gitignore` already excludes them, but take care not to paste keys into tracked files.

### Frontend: `frontend/.env.local`

Create `frontend/.env.local` with the backend URL:

```env title="frontend/.env.local"
NEXT_PUBLIC_API_URL=http://localhost:8500
```

!!! info
    Only `NEXT_PUBLIC_*` variables are exposed to the browser. Do not place secrets in this file.

---

## Docker Alternative

If you prefer containers over a local install, use Docker Compose.

### Prerequisites

- Docker Desktop

### Configuration

Create a root-level `.env` file. The `docker-compose.yml` passes this into the backend container:

```env title=".env (repo root)"
OPENAI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
DB_PASSWORD=your_db_password
# Optional: override local graph connection values
# GRAPH_DB_HOST=falkordb
# GRAPH_DB_PORT=6379
```

### Run

```bash
docker compose up --build
```

Frontend and backend start on the same ports (frontend on 3500, backend on 8500).
The default Compose stack also starts a local FalkorDB container on port 6379 for graph features.

---

## Next Step

Once dependencies are installed and environment files are in place, proceed to the [First Run](first-run.md) guide.
