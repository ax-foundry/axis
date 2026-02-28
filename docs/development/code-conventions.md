---
icon: custom/code-conventions
---

# Code Conventions

AXIS enforces consistent coding standards across the Python backend and TypeScript frontend. This page documents all conventions -- file naming, import ordering, type hints, and structural patterns.

---

## Backend (Python)

### File Naming

| Category | Convention | Examples |
|----------|-----------|----------|
| **Routers** | `snake_case.py` | `data.py`, `eval_runner.py`, `monitoring_analytics.py` |
| **Services** | `snake_case` + `_service` suffix | `database_service.py`, `memory_service.py`, `signals_service.py` |
| **Models** | `snake_case` + `_schemas` suffix | `schemas.py`, `database_schemas.py`, `graph_schemas.py` |
| **Config** | `snake_case.py` | `config.py` |

### Type Hints

Use modern Python type syntax (3.10+). Ruff enforces these automatically.

```python
# Correct (modern)
def process(data: dict[str, Any]) -> list[str]: ...
def find(name: str | None = None) -> dict[str, Any] | None: ...
isinstance(value, str | int)

# Incorrect (legacy -- Ruff will flag these)
def process(data: Dict[str, Any]) -> List[str]: ...       # UP006
def find(name: Optional[str] = None) -> Optional[dict]: ...  # UP007
isinstance(value, (str, int))                               # UP038
```

### Router Structure

Every router follows this pattern:

```python
"""Brief description of what this router handles."""

import logging

from fastapi import APIRouter, HTTPException

from app.models.schemas import SomeRequest, SomeResponse
from app.services import some_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/endpoint", response_model=SomeResponse)
async def endpoint_name(request: SomeRequest) -> SomeResponse:
    """Endpoint docstring."""
    try:
        result = await some_service.do_something(request)
        return SomeResponse(success=True, data=result)
    except some_service.ServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Unexpected error")
        raise HTTPException(status_code=500, detail="An unexpected error occurred")
```

Key points:

- `router = APIRouter()` (no prefix -- that is set in `main.py`)
- `try/except` with custom service exceptions mapped to HTTP status codes
- Catch-all `except Exception` with `logger.exception()` for unexpected errors
- Google-style docstrings on public functions

### Service Structure

```python
"""Service module docstring."""

import logging
from typing import Any

logger = logging.getLogger(__name__)


class ServiceError(Exception):
    """Base exception for this service."""
    pass


class SpecificError(ServiceError):
    """More specific error (maps to 404, 401, etc. in the router)."""
    pass


async def do_something(data: dict[str, Any]) -> dict[str, Any]:
    """Process data and return results.

    Args:
        data: Input data dictionary.

    Returns:
        Processed result dictionary.

    Raises:
        ServiceError: If processing fails.
    """
    logger.info(f"Processing {len(data)} items")
    # Implementation
    return result
```

Key points:

- Module-level `logger`
- Custom `ServiceError` base class per service
- All I/O functions are `async`
- Type hints on all parameters and return values
- Google-style docstrings with Args/Returns/Raises

### Error Handling Hierarchy

```python
# In the service
class DatabaseServiceError(Exception): ...
class ConnectionExpiredError(DatabaseServiceError): ...  # -> 401
class TableNotFoundError(DatabaseServiceError): ...      # -> 404

# In the router
except ConnectionExpiredError as e:
    raise HTTPException(status_code=401, detail=str(e))
except TableNotFoundError as e:
    raise HTTPException(status_code=404, detail=str(e))
except DatabaseServiceError as e:
    raise HTTPException(status_code=400, detail=str(e))
```

### Linting and Formatting

AXIS uses [Ruff](https://docs.astral.sh/ruff/) for both linting and formatting.

```bash
ruff check app --fix    # Lint + auto-fix
ruff format app         # Format
```

Common Ruff rules you may encounter:

| Rule | What it means | Fix |
|------|--------------|-----|
| `UP006` | Use `dict` not `Dict` | Change `Dict[str, Any]` to `dict[str, Any]` |
| `UP007` | Use `X \| None` not `Optional[X]` | Change `Optional[str]` to `str \| None` |
| `UP038` | Use `X \| Y` in isinstance | Change `isinstance(v, (str, int))` to `isinstance(v, str \| int)` |
| `SIM102` | Nested if can be collapsed | Combine with `and` |
| `F841` | Unused variable | Remove or prefix with `_` |
| `PTH123` | Use `Path.open()` | Change `open(path)` to `Path(path).open()` |

---

## Frontend (TypeScript)

### File Naming

| Category | Convention | Examples |
|----------|-----------|----------|
| **Components** | PascalCase | `KPICard.tsx`, `CompareContent.tsx`, `SignalsTrendChart.tsx` |
| **Pages** | `page.tsx` in directory | `app/monitoring/page.tsx` |
| **Stores** | kebab-case + `-store` suffix | `ui-store.ts`, `monitoring-store.ts` |
| **Hooks** | camelCase with `use` prefix | `usePlayback.ts`, `useSignalsUpload.ts` |
| **Utilities** | kebab-case | `utils.ts`, `signals-utils.ts`, `executive-summary-utils.ts` |
| **Types** | All in `types/index.ts` | Single source of truth |
| **Barrel exports** | `index.ts` | One per component folder and in `stores/` |

### Import Order

ESLint enforces a strict import ordering with the `import/order` rule:

```tsx
// 1. External packages
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

// 2. Internal (absolute @/ imports)
import { useUIStore, useDataStore } from '@/stores';
import { cn } from '@/lib/utils';

// 3. Relative imports (parent, sibling)
import { ChildComponent } from './ChildComponent';

// 4. Type-only imports
import type { EvaluationRecord } from '@/types';
```

Rules enforced by `.eslintrc.json`:

- **Groups**: `builtin` > `external` > `internal` > `parent/sibling` > `index` > `type`
- **Blank lines** between groups (required)
- **Alphabetical** within each group (case-insensitive)
- **No duplicate imports** from the same module
- **Type-only imports**: `import type { ... }` enforced by `@typescript-eslint/consistent-type-imports`

### Component Structure

```tsx
'use client';

import { useState, useMemo } from 'react';

import { useUIStore, useDataStore } from '@/stores';
import { cn } from '@/lib/utils';

import type { EvaluationRecord } from '@/types';

interface ComponentNameProps {
  title: string;
  data?: EvaluationRecord[];
  className?: string;
}

export function ComponentName({ title, data = [], className }: ComponentNameProps) {
  // 1. Store hooks
  const { selectedMetrics } = useUIStore();

  // 2. Local state
  const [isExpanded, setIsExpanded] = useState(false);

  // 3. Derived / memoized data
  const filteredData = useMemo(() => {
    return data.filter(/* ... */);
  }, [data, selectedMetrics]);

  // 4. Event handlers
  const handleToggle = () => setIsExpanded((prev) => !prev);

  // 5. Render
  return (
    <div className={cn('rounded-lg border border-border bg-white p-4', className)}>
      {/* JSX */}
    </div>
  );
}
```

Key points:

- `'use client'` directive on all components with hooks or interactivity
- **Named exports** (not default exports)
- Props interface defined inline above the component
- Internal organization: stores, state, derived, handlers, render

### Export Patterns

```tsx
// Named export (components)
export function MyComponent() { ... }

// Barrel export (stores/index.ts)
export { useDataStore } from './data-store';
export { useUIStore } from './ui-store';
export type { HumanSignalsTimeRangePreset } from './human-signals-store';
```

All stores are barrel-exported from `stores/index.ts`. When adding a new store, always add the export there.

### Zustand Store Pattern

```tsx
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MyState {
  count: number;
  items: string[];
  setCount: (n: number) => void;
  addItem: (item: string) => void;
  reset: () => void;
}

export const useMyStore = create<MyState>()((set) => ({
  count: 0,
  items: [],
  setCount: (n) => set({ count: n }),
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
  reset: () => set({ count: 0, items: [] }),
}));
```

Note the double parentheses: `create<State>()(...)` -- this is required for TypeScript generic inference with Zustand v5.

### React Query Hooks

All data-fetching hooks wrap `fetchApi` calls from `lib/api.ts`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useDataStore } from '@/stores';

import * as api from './api';

export function useUploadFile() {
  const queryClient = useQueryClient();
  const { setData, setLoading, setError } = useDataStore();

  return useMutation({
    mutationFn: api.uploadFile,
    onMutate: () => setLoading(true),
    onSuccess: (response) => {
      setData(response.data);
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
    onError: (error) => setError(error.message),
  });
}
```

### API Client

The centralized API client is in `lib/api.ts`. All HTTP calls go through `fetchApi<T>()`:

```tsx
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8500';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, options);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
```

### Linting and Formatting

```bash
# Format first (Prettier)
npm run format

# Lint (ESLint -- includes import order, type-imports)
npm run lint

# Type check
npx tsc --noEmit
```

!!! tip "Recommended order"
    Run `prettier --write` first, then `eslint --fix`, then `prettier --write` again if ESLint modified files. The Makefile `lint-fix` target handles this sequence.

### TypeScript Tips

- **Map iteration**: `for...of` on Maps fails without `--downlevelIteration`. Use `Array.from(map.entries()).forEach()` instead.
- **D3 zoom cast**: `svg.call(zoom)` needs `svg.call(zoom as unknown as ...)` to satisfy strict null checks.
- **Typed D3 selections**: Use `selectAll<SVGElement, DataType>` for proper typing.
- **D3 callbacks with `this`**: Cast as `(this as SVGCircleElement)`.

---

## Shared Conventions

### Docstrings and Comments

- **Python**: Google-style docstrings on all public modules, classes, and functions
- **TypeScript**: JSDoc on exported functions and complex logic; TSDoc for library-facing code
- **Both**: Inline comments for non-obvious logic only -- prefer self-documenting code

### Git Commit Style

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add knowledge graph visualization
fix: correct time-series bucketing for monitoring trends
refactor: extract pagination into reusable component
docs: add deployment guide for Docker
```

### Environment Variables

- **Backend**: Add new vars to `app/config/env.py` `Settings` class, document in `.env.example`
- **Frontend**: Only `NEXT_PUBLIC_*` vars are browser-accessible; add to `.env.local`
- **Naming**: Backend uses `snake_case`, frontend uses `SCREAMING_SNAKE_CASE` with `NEXT_PUBLIC_` prefix

---

## Related Pages

- [Setup](setup.md) -- install tools and configure your editor
- [Adding Features](adding-features.md) -- step-by-step feature walkthroughs
- [Architecture: Backend](../architecture/backend.md) -- router/service architecture detail
- [Architecture: Frontend](../architecture/frontend.md) -- component and state architecture
