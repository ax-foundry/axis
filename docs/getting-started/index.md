---
icon: custom/overview
---

# Getting Started

AXIS is a monorepo containing a **Next.js 14** frontend and a **FastAPI** backend for AI evaluation dashboards. The two services communicate over HTTP and can run locally for development or be deployed as containers in production.

## Local Development

For local development, both services run on your machine:

| Service | URL | Port |
|---------|-----|------|
| Frontend | [http://localhost:3500](http://localhost:3500) | 3500 |
| Backend  | [http://localhost:8500](http://localhost:8500) | 8500 |
| API Docs | [http://localhost:8500/docs](http://localhost:8500/docs) | 8500 |

## Production Deployment

In production, AXIS runs as Docker containers behind a reverse proxy. The URLs are determined by your infrastructure:

| Service | Typical Setup |
|---------|---------------|
| Frontend | `https://your-domain.com` (served by Next.js standalone) |
| Backend  | `https://your-domain.com/api` or `https://api.your-domain.com` |
| Database | PostgreSQL + DuckDB (analytics cache) |

See the [Deployment guide](../deployment/index.md) for Docker Compose, container orchestration, reverse proxy setup, and the production checklist.

---

## Next Steps

<div class="grid cards" markdown>

-   :material-download-circle:{ .lg .middle } **Installation**

    ---

    Install prerequisites, clone the repo, and configure environment files for local development.

    [:octicons-arrow-right-24: Installation guide](installation.md)

-   :material-play-circle:{ .lg .middle } **First Run**

    ---

    Start the dev servers, load data, and explore the dashboard locally.

    [:octicons-arrow-right-24: First run guide](first-run.md)

-   :material-docker:{ .lg .middle } **Deploy**

    ---

    Run AXIS in production with Docker, reverse proxy, and database configuration.

    [:octicons-arrow-right-24: Deployment guide](../deployment/index.md)

</div>
