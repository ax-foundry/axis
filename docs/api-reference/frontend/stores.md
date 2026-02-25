---
icon: custom/stores
---

# Zustand Stores

!!! note "Hand-written reference"
    This page is manually maintained. See [`frontend/src/stores/`](https://github.com/ax-foundry/axis/tree/master/frontend/src/stores) for the definitive source.

All stores are barrel-exported from `@/stores`:

```typescript
import { useUIStore, useDataStore, useMonitoringStore } from '@/stores';
```

## Store List

| Store | File | Description |
|-------|------|-------------|
| `useUIStore` | `ui-store.ts` | UI preferences, filters, modal state |
| `useDataStore` | `data-store.ts` | Evaluation data from uploads |
| `useMonitoringStore` | `monitoring-store.ts` | Monitoring/observability data |
| `useMemoryStore` | `memory-store.ts` | Decision memory rules and batches |
| `useHumanSignalsStore` | `human-signals-store.ts` | Human signals data |
| `useAnnotationStore` | `annotation-store.ts` | Human annotation state |
| `useCalibrationStore` | `calibration-store.ts` | LLM judge calibration, pattern discovery, learning insights |
| `useCopilotStore` | `copilot-store.ts` | AI copilot chat state |
| `useDatabaseStore` | `database-store.ts` | DB connection wizard state |
| `useEvalRunnerStore` | `eval-runner-store.ts` | Evaluation runner workflow |
| `useThemeStore` | `theme-store.ts` | Theme/branding configuration |

---

## useUIStore

Manages global UI preferences. Uses `persist` middleware for localStorage persistence.

**Key State:**

| Field | Type | Description |
|-------|------|-------------|
| `sidebarCollapsed` | `boolean` | Sidebar open/closed |
| `copilotOpen` | `boolean` | AI copilot panel visibility |
| `selectedExperiment` | `string \| null` | Active experiment filter |
| `selectedExperiments` | `string[]` | Experiments for comparison |
| `selectedMetrics` | `string[]` | Active metric filters |
| `currentPage` | `number` | Current pagination page |
| `itemsPerPage` | `number` | Items per page |
| `viewMode` | `'list' \| 'grid'` | Data view mode |
| `visualizeSubTab` | `string` | Active visualize sub-tab |

---

## useDataStore

Manages evaluation data loaded from CSV uploads or DB imports.

**Key State:**

| Field | Type | Description |
|-------|------|-------------|
| `data` | `EvaluationRecord[]` | Raw evaluation records |
| `format` | `DataFormat \| null` | Detected data format |
| `columns` | `string[]` | Column names |
| `metricColumns` | `string[]` | Metric column names |
| `summary` | `MetricSummary[]` | Computed metric summaries |
| `isLoading` | `boolean` | Loading state |
| `error` | `string \| null` | Error message |

**Key Actions:**

- `setData(data, format)` — Store uploaded data
- `clearData()` — Reset to empty state

---

## useMonitoringStore

Manages production monitoring data with time-series filtering and source metadata.

**Key State:**

| Field | Type | Description |
|-------|------|-------------|
| `data` | `MonitoringRecord[]` | Raw monitoring records |
| `metricColumns` | `string[]` | Detected metric columns |
| `timeRange` | `MonitoringTimeRange` | Active time filter |
| `selectedEnvironment` | `string \| null` | Environment filter |
| `selectedSourceName` | `string \| null` | Source name filter |
| `selectedSourceComponent` | `string \| null` | Component filter |
| `selectedSourceType` | `string \| null` | Source type filter |
| `availableEnvironments` | `string[]` | Unique environments in data |
| `availableSourceNames` | `string[]` | Unique source names |

---

## useMemoryStore

Manages decision memory rules, hard stops, batches, and decision quality data.

**Key State:**

| Field | Type | Description |
|-------|------|-------------|
| `rules` | `MemoryRuleRecord[]` | All memory rules |
| `activeTab` | `string` | Active tab (rules, hardstops, batches, quality, graph) |
| `searchQuery` | `string` | Rule search filter |
| `selectedCategory` | `string \| null` | Category filter |

---

## useHumanSignalsStore

Manages Human Signals data with source and metric filtering.

**Key State:**

| Field | Type | Description |
|-------|------|-------------|
| `data` | `Record<string, unknown>[]` | Flattened signal records |
| `metricSchema` | `SignalsMetricSchema \| null` | Schema describing available metrics |
| `displayConfig` | `SignalsDisplayConfig \| null` | Display overrides from YAML |
| `selectedSource` | `string \| null` | Source filter |
| `selectedMetric` | `string \| null` | Metric filter |
| `timeRange` | `SignalsTimeRange` | Time range filter |

---

## useCalibrationStore

Manages LLM judge calibration state including evaluation results, pattern discovery, and learning insights from the EvidencePipeline.

**Key State:**

| Field | Type | Description |
|-------|------|-------------|
| `step` | `number` | Current workflow step (0-2) |
| `evaluationResults` | `AlignEvaluationResult[] \| null` | Judge evaluation results |
| `clusterPatterns` | `ClusterPattern[] \| null` | Discovered error patterns |
| `learningArtifacts` | `LearningArtifact[] \| null` | Actionable learning insights from EvidencePipeline |
| `pipelineMetadata` | `PipelineMetadata \| null` | Metadata about the clustering pipeline run |
| `domainContext` | `string` | Optional domain context for pattern discovery |
| `selectedProvider` | `string` | Active LLM provider |
| `selectedModel` | `string` | Active LLM model |

---

## Pattern

All stores follow the Zustand `create<State>()((set) => ({...}))` pattern:

```typescript
import { create } from 'zustand';

interface ExampleState {
  count: number;
  increment: () => void;
  reset: () => void;
}

export const useExampleStore = create<ExampleState>()((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  reset: () => set({ count: 0 }),
}));
```

For persisted stores (e.g., `useUIStore`):

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // ...state and actions
    }),
    {
      name: 'axis-ui-store',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        // only persist selected fields
      }),
    }
  )
);
```
