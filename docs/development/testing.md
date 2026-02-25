---
icon: custom/testing
---

# Testing

AXIS uses three testing frameworks: **pytest** for the backend, **Vitest** for frontend unit tests, and **Playwright** for end-to-end browser tests. All can be run individually or together via the Makefile.

---

## Quick Reference

```bash
# Run everything
make test

# Individual targets
make test-backend      # pytest
make test-frontend     # Vitest
make test-e2e          # Playwright
```

---

## Backend Tests (pytest)

### Setup

Backend tests use [pytest](https://docs.pytest.org/) with the `pytest-asyncio` plugin for async test support and `pytest-cov` for coverage.

These packages are included in `backend/requirements.txt`. No additional installation is needed beyond `make install`.

### Directory Structure

```
backend/
├── tests/
│   ├── conftest.py         # Shared fixtures
│   ├── test_data.py        # Data processing tests
│   ├── test_analytics.py   # Analytics tests
│   └── ...
└── app/                    # Source code
```

### Running Tests

```bash
cd backend

# Run all tests
pytest tests -v

# Run with coverage
pytest tests --cov=app --cov-report=term-missing

# Stop on first failure
pytest tests -x

# Run a specific test file
pytest tests/test_data.py -v

# Run a specific test function
pytest tests/test_data.py::test_upload_csv -v

# Run tests matching a keyword
pytest tests -k "analytics" -v
```

### Writing a Backend Test

```python
"""Tests for the widgets service."""

import pytest

from app.services import widgets_service


class TestGetAllWidgets:
    """Tests for get_all_widgets()."""

    @pytest.mark.asyncio
    async def test_returns_list(self):
        """Should return a list of widget dictionaries."""
        result = await widgets_service.get_all_widgets()
        assert isinstance(result, list)

    @pytest.mark.asyncio
    async def test_empty_data(self):
        """Should return empty list when no data is loaded."""
        result = await widgets_service.get_all_widgets()
        assert result == []


class TestGetWidgetSummary:
    """Tests for get_widget_summary()."""

    @pytest.mark.asyncio
    async def test_raises_on_empty_data(self):
        """Should raise ServiceError when no widgets exist."""
        with pytest.raises(widgets_service.WidgetsServiceError, match="No widget data"):
            await widgets_service.get_widget_summary()
```

### Fixtures

Define shared fixtures in `tests/conftest.py`:

```python
import pytest


@pytest.fixture
def sample_widgets():
    """Sample widget data for testing."""
    return [
        {"id": "1", "name": "Widget A", "category": "tools", "value": 0.85},
        {"id": "2", "name": "Widget B", "category": "tools", "value": 0.72},
        {"id": "3", "name": "Widget C", "category": "utils", "value": 0.91},
    ]


@pytest.fixture
def empty_widgets():
    """Empty widget list."""
    return []
```

### Async Test Pattern

All service functions in AXIS are `async`. Use the `@pytest.mark.asyncio` decorator:

```python
@pytest.mark.asyncio
async def test_async_operation():
    result = await some_service.do_something()
    assert result is not None
```

---

## Frontend Unit Tests (Vitest)

### Setup

Frontend tests use [Vitest](https://vitest.dev/) with `@vitejs/plugin-react` for JSX support.

Configuration is in `frontend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: ['node_modules', 'e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

Key points:

- Tests live alongside source code in `src/` (not a separate directory)
- File pattern: `*.test.ts` or `*.spec.ts` (and `.tsx` variants)
- The `@/` alias works in tests, matching `tsconfig.json`
- E2E tests in `e2e/` are excluded

### Running Tests

```bash
cd frontend

# Run all unit tests (watch mode)
npm run test

# Run once (no watch -- used in CI and Makefile)
npm run test -- --run

# Interactive UI
npm run test:ui

# Run a specific file
npx vitest run src/lib/utils.test.ts

# Run tests matching a pattern
npx vitest run --grep "formatting"
```

### Writing a Frontend Test

```ts
import { describe, it, expect } from 'vitest';

import { formatPercentage, cn } from '@/lib/utils';

describe('formatPercentage', () => {
  it('formats decimal as percentage string', () => {
    expect(formatPercentage(0.856)).toBe('85.6%');
  });

  it('handles zero', () => {
    expect(formatPercentage(0)).toBe('0.0%');
  });

  it('handles values above 1', () => {
    expect(formatPercentage(1.5)).toBe('150.0%');
  });
});

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
  });
});
```

### Testing Zustand Stores

```ts
import { describe, it, expect, beforeEach } from 'vitest';

import { useWidgetsStore } from '@/stores/widgets-store';

describe('useWidgetsStore', () => {
  beforeEach(() => {
    // Reset store between tests
    useWidgetsStore.setState({
      selectedCategory: null,
      isDetailOpen: false,
      selectedWidgetId: null,
    });
  });

  it('sets selected category', () => {
    useWidgetsStore.getState().setSelectedCategory('tools');
    expect(useWidgetsStore.getState().selectedCategory).toBe('tools');
  });

  it('opens detail modal', () => {
    useWidgetsStore.getState().openDetail('widget-123');
    const state = useWidgetsStore.getState();
    expect(state.isDetailOpen).toBe(true);
    expect(state.selectedWidgetId).toBe('widget-123');
  });

  it('resets all state', () => {
    useWidgetsStore.getState().setSelectedCategory('tools');
    useWidgetsStore.getState().openDetail('widget-123');
    useWidgetsStore.getState().reset();

    const state = useWidgetsStore.getState();
    expect(state.selectedCategory).toBeNull();
    expect(state.isDetailOpen).toBe(false);
    expect(state.selectedWidgetId).toBeNull();
  });
});
```

---

## End-to-End Tests (Playwright)

### Setup

E2E tests use [Playwright](https://playwright.dev/) for browser automation.

Configuration is in `frontend/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3500',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3500',
    reuseExistingServer: !process.env.CI,
  },
});
```

Key points:

- Tests live in `frontend/e2e/`
- Playwright auto-starts the dev server (unless one is already running)
- CI runs with 1 worker and 2 retries
- Traces are captured on first retry for debugging

### Directory Structure

```
frontend/
├── e2e/
│   ├── home.spec.ts          # Landing page tests
│   ├── evaluate.spec.ts      # Evaluation workflow tests
│   ├── monitoring.spec.ts    # Monitoring tests
│   └── ...
└── playwright.config.ts
```

### Running E2E Tests

```bash
cd frontend

# Run all E2E tests
npm run test:e2e

# Run with headed browser (visible)
npx playwright test --headed

# Run a specific spec file
npx playwright test e2e/home.spec.ts

# Run in debug mode (step through)
npx playwright test --debug

# View HTML report after run
npx playwright show-report
```

Or from the repo root:

```bash
make test-e2e
```

### Writing an E2E Test

```ts
import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test('displays the AXIS landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('AXIS');
  });

  test('navigates to evaluation page', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Evaluate');
    await expect(page).toHaveURL(/\/evaluate/);
  });
});

test.describe('Monitoring Upload', () => {
  test('uploads a CSV file', async ({ page }) => {
    await page.goto('/monitoring');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('fixtures/sample-monitoring.csv');
    await expect(page.locator('[data-testid="upload-success"]')).toBeVisible();
  });
});
```

---

## Makefile Targets

The root `Makefile` provides convenience targets that orchestrate testing across both services.

| Target | What it runs | When to use |
|--------|-------------|-------------|
| `make test` | `test-backend` + `test-frontend` | Full test suite before merging |
| `make test-backend` | `cd backend && pytest tests -v` | After backend changes |
| `make test-frontend` | `cd frontend && npm run test -- --run` | After frontend changes |
| `make test-e2e` | `cd frontend && npm run test:e2e` | After UI/flow changes |

### CI Pipeline

CI runs these checks in order:

1. `make lint` -- Ruff + ESLint + Prettier
2. `make typecheck` -- mypy + `tsc --noEmit`
3. `make test` -- pytest + Vitest
4. (optional) `make test-e2e` -- Playwright

If any step fails, the pipeline stops. Run the full suite locally before pushing:

```bash
make lint && make typecheck && make test
```

---

## Coverage

### Backend Coverage

```bash
cd backend
pytest tests --cov=app --cov-report=term-missing --cov-report=html
```

The HTML report is generated at `backend/htmlcov/index.html`.

### Frontend Coverage

```bash
cd frontend
npx vitest run --coverage
```

!!! info
    You may need to install `@vitest/coverage-v8` for coverage support:
    ```bash
    npm install -D @vitest/coverage-v8
    ```

---

## Related Pages

- [Setup](setup.md) -- install test dependencies
- [Code Conventions](code-conventions.md) -- patterns to follow when writing tests
- [Adding Features](adding-features.md) -- includes testing in the feature checklist
