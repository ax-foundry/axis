---
icon: custom/api
---

# API Reference

AXIS exposes a REST API via FastAPI and provides Python and TypeScript libraries for extending the platform.

## REST API

FastAPI automatically generates interactive API documentation:

- **Swagger UI**: [http://localhost:8500/docs](http://localhost:8500/docs)
- **ReDoc**: [http://localhost:8500/redoc](http://localhost:8500/redoc)

See the [REST API overview](rest-api.md) for endpoint summaries and tag descriptions.

## Backend (Python)

Auto-generated reference from Python docstrings:

| Module | Description |
|--------|-------------|
| [Config](backend/config.md) | Application settings and constants |
| [Data Processor](backend/data-processor.md) | CSV parsing, format detection, data transformation |
| [Database Service](backend/database-service.md) | PostgreSQL connection management and queries |
| [Eval Runner Service](backend/eval-runner-service.md) | Batch evaluation execution |
| [Human Signals Service](backend/human-signals-service.md) | Human signals processing |
| [Memory Service](backend/memory-service.md) | Decision memory and rule extraction |
| [Graph Service](backend/graph-service.md) | FalkorDB knowledge graph operations |
| [Schemas](backend/schemas.md) | Pydantic data models |

## Frontend (TypeScript)

Hand-written reference for key frontend modules:

| Module | Description |
|--------|-------------|
| [API Client](frontend/api-client.md) | `fetchApi` client and endpoint functions |
| [Hooks](frontend/hooks.md) | React Query hooks for data fetching |
| [Stores](frontend/stores.md) | Zustand state management stores |
| [Types](frontend/types.md) | TypeScript type definitions |
