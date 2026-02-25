---
icon: custom/installation
---

# Development Setup

This page covers the full development environment setup: installing tools, configuring your IDE, enabling pre-commit hooks, and creating environment files.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Python** | 3.12+ | Backend runtime |
| **Node.js** | 20+ | Frontend runtime |
| **npm** | (bundled) | Frontend package manager |
| **pip** | (bundled) | Backend package manager |
| **make** | any | Monorepo task runner |
| **pre-commit** | 3.5+ | Git hook manager |

!!! tip "Verify versions"
    ```bash
    python --version   # 3.12.x
    node --version     # v20.x.x
    make --version
    pre-commit --version
    ```

---

## Install Dependencies

### One-command install

From the repository root:

```bash
make install
```

This runs three steps:

1. Installs pre-commit hooks
2. `pip install -r requirements.txt` in `backend/`
3. `npm install` in `frontend/`

### Manual install

=== "Backend"

    ```bash
    cd backend
    pip install -r requirements.txt
    pip install ruff mypy pandas-stubs    # Dev tools
    ```

=== "Frontend"

    ```bash
    cd frontend
    npm install
    ```

=== "Pre-commit"

    ```bash
    pip install pre-commit
    pre-commit install
    ```

---

## Pre-commit Hooks

AXIS uses [pre-commit](https://pre-commit.com/) to run quality checks on every commit. The hooks are defined in `.pre-commit-config.yaml` at the repo root.

### What runs on commit

| Hook | Scope | What it does |
|------|-------|-------------|
| `trailing-whitespace` | All files | Strips trailing whitespace |
| `end-of-file-fixer` | All files | Ensures files end with a newline |
| `check-yaml` | YAML files | Validates YAML syntax |
| `check-json` | JSON files | Validates JSON syntax |
| `check-added-large-files` | All files | Blocks files over 500KB |
| `check-merge-conflict` | All files | Detects merge conflict markers |
| `detect-private-key` | All files | Blocks accidental key commits |
| `ruff` | `backend/` | Lint + auto-fix Python |
| `ruff-format` | `backend/` | Format Python |
| `prettier` | `frontend/` | Format JS/TS/CSS/JSON/MD |
| `eslint` | `frontend/` | Lint TypeScript |

### Run hooks manually

```bash
# Run on staged files
pre-commit run

# Run on all files
pre-commit run --all-files

# Or via Makefile
make pre-commit-all
```

### Skip hooks (escape hatch)

In rare cases where you need to bypass hooks temporarily:

```bash
git commit --no-verify -m "WIP: work in progress"
```

!!! warning
    Only skip hooks for temporary WIP commits. CI will still enforce all checks.

---

## Environment Files

AXIS uses `.env` files for configuration. These are git-ignored and must be created manually.

### Backend: `backend/.env`

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

# Database (optional -- only needed for DB features)
human_signals_db_host=localhost
human_signals_db_port=5432
human_signals_db_name=human_signals
human_signals_db_user=postgres
human_signals_db_password=secret

# Graph DB (optional -- only needed for Knowledge Graph)
graph_db_host=localhost
graph_db_port=6379
graph_db_name=axis
graph_db_password=
```

### Frontend: `frontend/.env.local`

```env title="frontend/.env.local"
NEXT_PUBLIC_API_URL=http://localhost:8500
```

!!! info "Frontend env var rules"
    Only `NEXT_PUBLIC_*` variables are exposed to the browser. Never place secrets in this file.

!!! danger "Keep secrets out of version control"
    The `.gitignore` already excludes `.env` files, but never paste API keys into tracked files.

---

## IDE Configuration

### VSCode (Recommended)

#### Recommended Extensions

Create or merge into `.vscode/extensions.json`:

```json title=".vscode/extensions.json"
{
  "recommendations": [
    "ms-python.python",
    "charliermarsh.ruff",
    "ms-python.mypy-type-checker",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-playwright.playwright",
    "yzhang.markdown-all-in-one"
  ]
}
```

#### Workspace Settings

Create or merge into `.vscode/settings.json`:

```json title=".vscode/settings.json"
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.organizeImports": "never"
  },

  "[python]": {
    "editor.defaultFormatter": "charliermarsh.ruff",
    "editor.codeActionsOnSave": {
      "source.fixAll.ruff": "explicit",
      "source.organizeImports.ruff": "explicit"
    }
  },

  "python.analysis.typeCheckingMode": "basic",
  "ruff.lint.args": ["--config=backend/pyproject.toml"],

  "typescript.preferences.importModuleSpecifier": "non-relative",
  "typescript.tsdk": "frontend/node_modules/typescript/lib",

  "tailwindCSS.experimental.classRegex": [
    ["cn\\(([^)]*)\\)", "'([^']*)'"]
  ],

  "files.exclude": {
    "**/__pycache__": true,
    "**/.pytest_cache": true,
    "**/.ruff_cache": true,
    "**/.mypy_cache": true,
    "**/node_modules": true,
    "**/.next": true
  }
}
```

### Other Editors

The key requirements for any editor:

- **Python**: Ruff for linting/formatting, mypy for type checking
- **TypeScript**: ESLint with `next/core-web-vitals` config, Prettier for formatting
- **Path alias**: Configure `@/` to resolve to `frontend/src/`
- **Tailwind**: IntelliSense for class name autocomplete

---

## Start Development

Once everything is installed, start both servers:

```bash
make dev
```

Or start them individually:

=== "Backend"

    ```bash
    make dev-backend
    # or: cd backend && uvicorn app.main:app --reload --port 8500
    ```

=== "Frontend"

    ```bash
    make dev-frontend
    # or: cd frontend && npm run dev
    ```

Verify the services are running:

- Frontend: [http://localhost:3500](http://localhost:3500)
- Backend health: [http://localhost:8500/health](http://localhost:8500/health)
- API docs: [http://localhost:8500/docs](http://localhost:8500/docs)

---

## Before Every Commit

Run the full check suite to catch issues before CI:

=== "Quick Check (minimum)"

    ```bash
    # Backend
    cd backend && ruff check app --fix && ruff format app

    # Frontend
    cd frontend && npm run format && npm run lint && npx tsc --noEmit
    ```

=== "Full Check"

    ```bash
    make lint-fix
    make typecheck
    make test
    ```

---

## Next Steps

- [Code Conventions](code-conventions.md) -- naming, imports, and structural patterns
- [Adding Features](adding-features.md) -- step-by-step feature development guide
- [Testing](testing.md) -- test frameworks and how to run them
