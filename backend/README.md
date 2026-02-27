# AXIS Backend

FastAPI backend for the AXIS AI Evaluation Platform.

See the full documentation:

- [Architecture: Backend](https://ax-foundry.github.io/axis/architecture/backend/)
- [API Reference](https://ax-foundry.github.io/axis/api-reference/)
- [Development Setup](https://ax-foundry.github.io/axis/development/setup/)
- [Code Conventions](https://ax-foundry.github.io/axis/development/code-conventions/)

## Quick Start

```bash
cd backend
pip install -e .               # core only
pip install -e ".[dev]"        # + linters & tests
pip install -e ".[dev,graph]"  # + FalkorDB graph features
uvicorn app.main:app --reload --port 8500
```

API docs: http://localhost:8500/docs
