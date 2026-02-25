---
icon: custom/frontend
---

# Frontend Architecture

The AXIS frontend is a **Next.js 14** application using the App Router, TypeScript, Tailwind CSS, Zustand for state management, and React Query for server data. Charts are rendered with Plotly.js and D3.js.

## App Router Pages

Each route in `src/app/` maps to a page in the application. All pages are client-rendered (`'use client'`) since they depend on interactive state.

```
src/app/
├── page.tsx                # Home / landing page
├── layout.tsx              # Root layout (Providers + Sidebar)
├── globals.css             # Global styles and CSS animations
├── evaluate/page.tsx       # Evaluation workflow (upload, visualize, compare)
├── comparison/page.tsx     # Multi-experiment comparison
├── annotation-studio/page.tsx  # Human annotation interface
├── caliber-hq/page.tsx     # LLM judge calibration
├── monitoring/page.tsx     # Real-time performance monitoring
├── production/page.tsx     # Production overview with KPIs
├── human-signals/page.tsx  # Human-in-the-loop signals dashboard
├── memory/page.tsx         # Memory rules and knowledge graph
├── simulation/page.tsx     # Persona-based simulation
├── synthetic/page.tsx      # Synthetic data generation
├── learn/page.tsx          # Learning resources and walkthroughs
├── settings/page.tsx       # Application settings
└── (runner)/               # Evaluation runner (route group)
    └── run-eval/page.tsx
```

### Root Layout

`layout.tsx` wraps the application with:

- **Providers**: React Query client, theme provider
- **Sidebar**: Navigation component
- **Data initializers**: Components that auto-load data from configured databases on mount

```tsx
// Simplified layout.tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>
          <Sidebar />
          <main>{children}</main>
          <EvalDataInitializer />
          <HumanSignalsDataInitializer />
          <MonitoringDataInitializer />
        </Providers>
      </body>
    </html>
  );
}
```

## Component Organization

Components are organized **by feature** under `src/components/`:

```
src/components/
├── align/                  # LLM judge alignment components
│   ├── analyze/            #   Analysis panels (LearningInsightsPanel)
├── annotation/             # Annotation studio interface
├── charts/                 # Plotly chart wrappers
│   ├── plotly-chart.tsx    #   Base PlotlyChart component
│   ├── violin-chart.tsx
│   ├── radar-chart.tsx
│   └── ...
├── copilot/                # AI copilot sidebar
├── database/               # Database connection wizard
├── eval-runner/            # Evaluation runner workflow
├── evaluate/               # Evaluation page components
│   ├── compare/            #   Comparison charts and tables
│   └── visualize/          #   Visualization tabs
│       └── scorecard/      #     Report modal, InsightPatternsPanel
├── human-signals/          # Human signals data-driven dashboard
├── learn/                  # Learning resources
├── memory/                 # Memory dashboard
│   └── graph/              #   D3 knowledge graph
├── monitoring/             # Monitoring dashboard
│   └── executive-summary/  #   Executive summary scorecard
├── production/             # Production overview components
├── shared/                 # Shared utilities
├── tree/                   # D3 tree visualization
└── ui/                     # Reusable UI primitives
```

## Naming Conventions

### Files

| Type       | Convention  | Example                        |
|------------|-------------|--------------------------------|
| Components | PascalCase  | `KPICard.tsx`, `DynamicFilters.tsx` |
| Pages      | `page.tsx`  | `app/monitoring/page.tsx`      |
| Stores     | kebab-case  | `monitoring-store.ts`          |
| Utilities  | camelCase   | `signals-utils.ts`, `hooks.ts` |
| Types      | `index.ts`  | `types/index.ts`               |

### Exports

Components use **named exports** (not default exports):

```tsx
// Correct
export function KPICard({ label, value }: KPICardProps) { ... }

// Avoid
export default function KPICard({ label, value }: KPICardProps) { ... }
```

Feature folders use **barrel exports** via `index.ts`:

```tsx
// components/memory/index.ts
export { MemorySummaryStrip } from './MemorySummaryStrip';
export { RulesTab } from './RulesTab';
export { HardStopsTab } from './HardStopsTab';
```

### Client Directive

All interactive components must start with the `'use client'` directive:

```tsx
'use client';

import { useState } from 'react';
// ...
```

## Import Patterns

AXIS uses the `@/` alias that maps to `src/`:

```tsx
// External packages first
import { useState, useMemo } from 'react';
import { Activity, TrendingUp } from 'lucide-react';

// Internal imports with @/ alias
import { useMonitoringStore, useUIStore } from '@/stores';
import { cn } from '@/lib/utils';
import { Columns, Thresholds, ChartColors } from '@/types';

// Type-only imports
import type { MonitoringRecord, MetricCategory } from '@/types';

// Relative imports last
import { SubComponent } from './SubComponent';
```

!!! note "ESLint import order"
    The project enforces `import/order` (external, then `@/`, then relative) and `import/no-duplicates` to prevent importing from the same module twice.

## Component Structure Pattern

Components follow a consistent internal structure:

```tsx
'use client';

import { useState, useMemo } from 'react';
import { useUIStore, useDataStore } from '@/stores';
import { cn } from '@/lib/utils';

interface ComponentNameProps {
  prop1: string;
  prop2?: number;
  className?: string;
}

export function ComponentName({ prop1, prop2 = 0, className }: ComponentNameProps) {
  // 1. Store hooks
  const { someState, someAction } = useUIStore();

  // 2. Local state
  const [localState, setLocalState] = useState(false);

  // 3. Derived/memoized data
  const computedValue = useMemo(() => {
    return expensiveComputation(someState);
  }, [someState]);

  // 4. Event handlers
  const handleClick = () => {
    someAction();
  };

  // 5. Render
  return (
    <div className={cn('base-classes', className)}>
      {/* JSX */}
    </div>
  );
}
```

## Lib Utilities

The `src/lib/` directory contains shared logic:

| File                         | Purpose                                    |
|------------------------------|--------------------------------------------|
| `api.ts`                     | Centralized `fetchApi<T>()` client and all API functions |
| `hooks.ts`                   | React Query hooks (mutations and queries)  |
| `utils.ts`                   | `cn()` class merge, formatting helpers     |
| `sse.ts`                     | Server-Sent Events streaming utilities     |
| `stats.ts`                   | Statistical computation helpers            |
| `theme.ts`                   | Theme color resolution                     |
| `executive-summary-utils.ts` | Monitoring hierarchy and health computation |
| `scorecard-utils.ts`         | Production scorecard computations          |
| `signals-utils.ts`           | Human signals KPI and chart data computation |
| `annotation-utils.ts`        | Annotation data helpers                    |

### Hooks Directory

Custom hooks in `src/lib/hooks/`:

| Hook                      | Purpose                                  |
|---------------------------|------------------------------------------|
| `useHumanSignalsUpload.ts`| Human signals file upload with store updates |
| `useProductionOverview.ts`| Aggregates data for production dashboard |

## Design System Highlights

### Color Palette

The sage green palette is used throughout, with semantic status colors:

| Token          | Hex       | Usage                     |
|----------------|-----------|---------------------------|
| `primary`      | `#8B9F4F` | Brand, active states      |
| `primary-light`| `#A4B86C` | Hover, secondary emphasis |
| `primary-dark` | `#6B7A3A` | Pressed states            |
| `accent-gold`  | `#D4AF37` | Warnings, highlights      |
| `accent-silver`| `#B8C5D3` | Neutral accents           |
| `success`      | `#27AE60` | Pass, healthy             |
| `warning`      | `#F39C12` | Caution, at-risk          |
| `error`        | `#E74C3C` | Fail, critical            |

### Key UI Patterns

- **KPI strips**: Compact inline cards with icon + value + label (not oversized stat cards)
- **Chart containers**: Bordered `div` with header bar (`border-b px-4 py-2`)
- **Pagination**: Inline pill-button controls, reset to page 1 on filter change
- **Severity cards**: White background with colored left border accent
- **Scrollable columns**: `max-h-[500px] overflow-y-auto` inside bordered containers

## Lint and Format

Always run before committing:

```bash
npm run format && npm run lint && npx tsc --noEmit
```
