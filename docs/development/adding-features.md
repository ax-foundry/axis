---
icon: custom/add-features
---

# Adding Features

This guide provides step-by-step walkthroughs for the most common feature additions in AXIS. Each section follows the established patterns documented in [Code Conventions](code-conventions.md).

---

## Add a New Backend Router + Service

A typical backend feature requires three files: a Pydantic model, a service, and a router.

### Step 1 -- Define the Pydantic models

Create `backend/app/models/widgets_schemas.py`:

```python
"""Pydantic schemas for the Widgets feature."""

from pydantic import BaseModel, Field


class WidgetRequest(BaseModel):
    """Request body for creating a widget."""

    name: str = Field(..., min_length=1, max_length=100)
    category: str | None = None
    value: float = Field(default=0.0, ge=0.0)


class WidgetResponse(BaseModel):
    """Response containing widget data."""

    success: bool = True
    data: dict[str, object] | None = None
    message: str | None = None


class WidgetSummary(BaseModel):
    """Aggregated widget statistics."""

    total_count: int
    average_value: float
    categories: list[str]
```

### Step 2 -- Implement the service

Create `backend/app/services/widgets_service.py`:

```python
"""Widgets service -- business logic for widget operations."""

import logging
from typing import Any

logger = logging.getLogger(__name__)


class WidgetsServiceError(Exception):
    """Base exception for widget operations."""
    pass


class WidgetNotFoundError(WidgetsServiceError):
    """Raised when a widget does not exist."""
    pass


async def get_all_widgets() -> list[dict[str, Any]]:
    """Retrieve all widgets.

    Returns:
        List of widget dictionaries.
    """
    logger.info("Fetching all widgets")
    # Implementation here
    return []


async def get_widget_summary() -> dict[str, Any]:
    """Compute aggregate statistics across all widgets.

    Returns:
        Summary dictionary with counts and averages.

    Raises:
        WidgetsServiceError: If data cannot be loaded.
    """
    widgets = await get_all_widgets()
    if not widgets:
        raise WidgetsServiceError("No widget data available")
    return {
        "total_count": len(widgets),
        "average_value": sum(w["value"] for w in widgets) / len(widgets),
        "categories": list({w["category"] for w in widgets if w.get("category")}),
    }
```

### Step 3 -- Create the router

Create `backend/app/routers/widgets.py`:

```python
"""Widget API endpoints."""

import logging

from fastapi import APIRouter, HTTPException

from app.models.widgets_schemas import WidgetResponse, WidgetSummary
from app.services import widgets_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/", response_model=WidgetResponse)
async def list_widgets() -> WidgetResponse:
    """List all widgets."""
    try:
        data = await widgets_service.get_all_widgets()
        return WidgetResponse(success=True, data={"widgets": data})
    except widgets_service.WidgetsServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Unexpected error listing widgets")
        raise HTTPException(status_code=500, detail="An unexpected error occurred")


@router.get("/summary", response_model=WidgetSummary)
async def widget_summary() -> WidgetSummary:
    """Get aggregated widget statistics."""
    try:
        summary = await widgets_service.get_widget_summary()
        return WidgetSummary(**summary)
    except widgets_service.WidgetsServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

### Step 4 -- Register in main.py

Add the import and `include_router` call in `backend/app/main.py`:

```python
from app.routers import (
    # ... existing imports ...
    widgets,
)

# ... after existing include_router calls ...
app.include_router(widgets.router, prefix="/api/widgets", tags=["widgets"])
```

### Step 5 -- Verify

```bash
cd backend
ruff check app --fix && ruff format app
uvicorn app.main:app --reload --port 8500
```

Visit [http://localhost:8500/docs](http://localhost:8500/docs) to confirm the new endpoints appear under the "widgets" tag.

---

## Add a New Frontend Page + Components

### Step 1 -- Create the page

Create `frontend/src/app/widgets/page.tsx`:

```tsx
'use client';

import { useEffect } from 'react';

import { WidgetDashboard } from '@/components/widgets/WidgetDashboard';

export default function WidgetsPage() {
  useEffect(() => {
    document.title = 'Widgets | AXIS';
  }, []);

  return (
    <div className="py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">Widgets</h1>
      </div>
      <div className="space-y-5">
        <WidgetDashboard />
      </div>
    </div>
  );
}
```

### Step 2 -- Create the component

Create `frontend/src/components/widgets/WidgetDashboard.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';

import { cn } from '@/lib/utils';

interface WidgetDashboardProps {
  className?: string;
}

export function WidgetDashboard({ className }: WidgetDashboardProps) {
  // Store hooks, state, derived data, handlers ...

  return (
    <div className={cn('space-y-5', className)}>
      {/* KPI strip, charts, tables, etc. */}
    </div>
  );
}
```

### Step 3 -- Add barrel export

Create `frontend/src/components/widgets/index.ts`:

```tsx
export { WidgetDashboard } from './WidgetDashboard';
```

### Step 4 -- Add types

Add any new types to `frontend/src/types/index.ts`:

```tsx
// Widget types
export interface Widget {
  id: string;
  name: string;
  category: string | null;
  value: number;
}

export interface WidgetSummary {
  total_count: number;
  average_value: number;
  categories: string[];
}
```

!!! warning "Single source of truth"
    All types go in `types/index.ts`. Do not define types in individual component files unless they are component-specific props interfaces.

### Step 5 -- Add API functions

Add to `frontend/src/lib/api.ts`:

```tsx
// Widgets
export async function getWidgets(): Promise<{ widgets: Widget[] }> {
  return fetchApi<{ widgets: Widget[] }>('/api/widgets/');
}

export async function getWidgetSummary(): Promise<WidgetSummary> {
  return fetchApi<WidgetSummary>('/api/widgets/summary');
}
```

### Step 6 -- Add React Query hooks

Add to `frontend/src/lib/hooks.ts` (or create a dedicated `lib/hooks/useWidgets.ts`):

```tsx
export function useWidgets() {
  return useQuery({
    queryKey: ['widgets'],
    queryFn: api.getWidgets,
  });
}

export function useWidgetSummary() {
  return useQuery({
    queryKey: ['widget-summary'],
    queryFn: api.getWidgetSummary,
  });
}
```

---

## Add a New Zustand Store

### Step 1 -- Create the store file

Create `frontend/src/stores/widgets-store.ts`:

```tsx
import { create } from 'zustand';

interface WidgetsState {
  // Data
  selectedCategory: string | null;
  isDetailOpen: boolean;
  selectedWidgetId: string | null;

  // Actions
  setSelectedCategory: (category: string | null) => void;
  openDetail: (widgetId: string) => void;
  closeDetail: () => void;
  reset: () => void;
}

export const useWidgetsStore = create<WidgetsState>()((set) => ({
  // Initial state
  selectedCategory: null,
  isDetailOpen: false,
  selectedWidgetId: null,

  // Actions
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  openDetail: (widgetId) => set({ isDetailOpen: true, selectedWidgetId: widgetId }),
  closeDetail: () => set({ isDetailOpen: false, selectedWidgetId: null }),
  reset: () =>
    set({
      selectedCategory: null,
      isDetailOpen: false,
      selectedWidgetId: null,
    }),
}));
```

### Step 2 -- Register in barrel export

Add to `frontend/src/stores/index.ts`:

```tsx
export { useWidgetsStore } from './widgets-store';
```

### When to use `persist` middleware

Use `persist` when state should survive page reloads (e.g., user preferences, filter selections):

```tsx
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useWidgetsStore = create<WidgetsState>()(
  persist(
    (set) => ({
      // ... state and actions
    }),
    {
      name: 'axis-widgets',          // localStorage key
      partialize: (state) => ({      // Only persist these fields
        selectedCategory: state.selectedCategory,
      }),
    }
  )
);
```

---

## Add a New Environment Variable

### Backend

**Step 1** -- Add to `backend/app/config.py`:

```python
class Settings(BaseSettings):
    # ... existing settings ...

    # Widget API
    widget_api_url: str | None = Field(
        default=None,
        description="External widget API base URL.",
    )
    widget_api_key: str | None = Field(
        default=None,
        description="API key for widget service authentication.",
    )
```

**Step 2** -- Add to `backend/.env`:

```env
widget_api_url=https://api.widgets.example.com
widget_api_key=your_key_here
```

**Step 3** -- Use in service code:

```python
from app.config import settings

async def call_widget_api():
    if not settings.widget_api_url:
        raise WidgetsServiceError("Widget API URL not configured")
    # ...
```

### Frontend

**Step 1** -- Add to `frontend/.env.local`:

```env
NEXT_PUBLIC_WIDGET_FEATURE_FLAG=true
```

**Step 2** -- Use in component code:

```tsx
const isWidgetEnabled = process.env.NEXT_PUBLIC_WIDGET_FEATURE_FLAG === 'true';
```

!!! warning "Security reminder"
    `NEXT_PUBLIC_*` variables are embedded in the client bundle and visible to users. Never put secrets in frontend env vars.

---

## Add a New YAML Config

For features that need structured configuration beyond simple env vars.

**Step 1** -- Create `custom/config/widgets.yaml` (or add a `backend/config/widgets.yaml.example` template and run `make setup` to copy it):

```yaml
widgets:
  default_category: "general"
  max_items: 100
  display:
    chart_type: "bar"
    color_scheme: "primary"
```

**Step 2** -- Load in the service:

```python
import yaml

from app.config import resolve_config_path

_CONFIG_PATH = resolve_config_path("widgets.yaml")


def _load_config() -> dict[str, Any]:
    """Load widget display configuration from YAML."""
    if not _CONFIG_PATH.exists():
        logger.warning("widgets.yaml not found, using defaults")
        return {}
    with _CONFIG_PATH.open() as f:
        return yaml.safe_load(f).get("widgets", {})
```

---

## Checklist

Use this checklist when adding a full-stack feature:

- [ ] Backend models in `models/*_schemas.py`
- [ ] Backend service in `services/*_service.py` with custom exceptions
- [ ] Backend router in `routers/*.py` with error handling
- [ ] Router registered in `main.py` with `app.include_router()`
- [ ] Frontend types in `types/index.ts`
- [ ] API functions in `lib/api.ts`
- [ ] React Query hooks in `lib/hooks.ts` or `lib/hooks/`
- [ ] Zustand store in `stores/*-store.ts` (if needed)
- [ ] Store exported from `stores/index.ts`
- [ ] Page in `app/*/page.tsx`
- [ ] Components in `components/*/`
- [ ] Barrel export in `components/*/index.ts`
- [ ] Env vars in `config.py` and `.env` (if needed)
- [ ] Lint passes: `make lint`
- [ ] Type check passes: `make typecheck`
- [ ] Tests pass: `make test`

---

## Related Pages

- [Code Conventions](code-conventions.md) -- naming and structural patterns
- [Testing](testing.md) -- writing and running tests
- [Architecture: Backend](../architecture/backend.md) -- router/service layer detail
- [Architecture: State Management](../architecture/state-management.md) -- Zustand and React Query patterns
