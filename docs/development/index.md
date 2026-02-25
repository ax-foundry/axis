---
icon: custom/overview
---

# Development

This section covers everything you need to contribute to AXIS -- from local setup and coding standards to testing workflows and UI design patterns.

---

## Quick Reference

### Start Development Servers

```bash
make dev
```

This starts both servers concurrently:

- **Frontend**: [http://localhost:3500](http://localhost:3500)
- **Backend**: [http://localhost:8500](http://localhost:8500)
- **API Docs**: [http://localhost:8500/docs](http://localhost:8500/docs)

### Lint and Format

=== "All (Monorepo)"

    ```bash
    make lint          # Check only
    make lint-fix      # Auto-fix
    make format        # Format only
    make typecheck     # Type checking
    ```

=== "Backend Only"

    ```bash
    cd backend
    ruff check app --fix
    ruff format app
    mypy app --ignore-missing-imports
    ```

=== "Frontend Only"

    ```bash
    cd frontend
    npm run format          # Prettier
    npm run lint            # ESLint
    npx tsc --noEmit        # TypeScript
    ```

### Run Tests

```bash
make test              # All tests
make test-backend      # pytest
make test-frontend     # Vitest
make test-e2e          # Playwright
```

### Clean Caches

```bash
make clean
```

Removes `.ruff_cache`, `.mypy_cache`, `.pytest_cache`, `__pycache__`, `.next`, and `node_modules/.cache`.

---

## Section Overview

<div class="grid cards" markdown>

-   **Setup**

    ---

    Environment setup, IDE configuration, pre-commit hooks, and env files.

    [:octicons-arrow-right-24: Setup guide](setup.md)

-   **Code Conventions**

    ---

    File naming, import order, type hints, router/service patterns, and component structure for both backend and frontend.

    [:octicons-arrow-right-24: Conventions](code-conventions.md)

-   **Adding Features**

    ---

    Step-by-step walkthroughs for adding routers, services, pages, stores, and environment variables.

    [:octicons-arrow-right-24: Feature guide](adding-features.md)

-   **Testing**

    ---

    pytest for the backend, Vitest for unit tests, Playwright for E2E, and Makefile targets.

    [:octicons-arrow-right-24: Testing guide](testing.md)

-   **Design System**

    ---

    Color palette, component patterns, spacing conventions, and Plotly chart defaults.

    [:octicons-arrow-right-24: Design system](design-system.md)

</div>

---

## Monorepo Layout

```
axis/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry, router mounting
│   │   ├── config.py            # Pydantic Settings
│   │   ├── routers/             # API route handlers
│   │   ├── services/            # Business logic
│   │   ├── models/              # Pydantic schemas
│   │   └── copilot/             # AI copilot agent + skills
│   ├── config/                  # YAML config templates (.yaml.example)
│   ├── tests/                   # pytest test suite
│   ├── requirements.txt
│   └── .env                     # Backend environment variables
│
├── frontend/
│   ├── src/
│   │   ├── app/                 # Next.js App Router pages
│   │   ├── components/          # React components (by feature)
│   │   ├── stores/              # Zustand state stores
│   │   ├── lib/                 # API client, hooks, utilities
│   │   └── types/               # TypeScript type definitions
│   ├── e2e/                     # Playwright E2E tests
│   ├── .env.local               # Frontend environment variables
│   └── package.json
│
├── custom/                      # Site-specific config + assets (gitignored)
├── docs/                        # MkDocs documentation (this site)
├── Makefile                     # Monorepo task runner
└── .pre-commit-config.yaml      # Git hook configuration
```

---

## Related Pages

- [Installation](../getting-started/installation.md) -- prerequisites and dependency install
- [Architecture Overview](../architecture/index.md) -- system diagram and tech stack
- [Configuration](../configuration/index.md) -- environment variables and YAML configs
