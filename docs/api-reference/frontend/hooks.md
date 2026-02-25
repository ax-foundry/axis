---
icon: custom/code-conventions
---

# React Query Hooks

!!! note "Hand-written reference"
    This page is manually maintained. See [`frontend/src/lib/hooks.ts`](https://github.com/ax-foundry/axis/blob/master/frontend/src/lib/hooks.ts) and [`frontend/src/lib/hooks/`](https://github.com/ax-foundry/axis/tree/master/frontend/src/lib/hooks) for the definitive source.

AXIS uses [TanStack React Query](https://tanstack.com/query) for server state management. Hooks wrap the API client functions, providing automatic caching, refetching, and loading/error states.

## Pattern

All hooks follow the same pattern:

```typescript
// Query hook — auto-fetches when dependencies are available
export function useSummaryStats(data: EvaluationRecord[] | null) {
  return useQuery({
    queryKey: ['summaryStats', data?.length],
    queryFn: () => getSummaryStats(data!),
    enabled: !!data && data.length > 0,
  });
}

// Mutation hook — triggered explicitly
export function useUploadFile() {
  return useMutation({
    mutationFn: (file: File) => uploadFile(file),
    onSuccess: (response) => {
      useDataStore.getState().setData(response.data, response.format);
    },
  });
}
```

## Data Hooks

| Hook | Type | Wraps | Description |
|------|------|-------|-------------|
| `useUploadFile()` | Mutation | `uploadFile` | Upload CSV and store results |
| `useLoadExampleDataset()` | Mutation | `loadExampleDataset` | Load example data |
| `useSummaryStats(data)` | Query | `getSummaryStats` | Compute summary statistics |

## Analytics Hooks

| Hook | Type | Wraps | Description |
|------|------|-------|-------------|
| `useDistribution(data, metric, bins)` | Query | `getDistribution` | Score distribution |
| `useComparison(data, groupBy, metrics)` | Query | `getComparison` | Group comparison |
| `useCorrelation(data, metrics)` | Query | `getCorrelation` | Correlation matrix |
| `useRadarData(data, metrics, groupBy)` | Query | `getRadarData` | Radar chart |
| `useScatterData(data, x, y, colorBy)` | Query | `getScatterData` | Scatter plot |

## Monitoring Hooks

| Hook | Type | Wraps | Description |
|------|------|-------|-------------|
| `useUploadMonitoringFile()` | Mutation | `uploadMonitoringFile` | Upload monitoring CSV |
| `useMonitoringTrends(data, metrics, gran)` | Query | `getMonitoringTrends` | Time-series trends |
| `useMonitoringLatencyDist(data, bins, groupBy)` | Query | `getMonitoringLatencyDist` | Latency histogram |
| `useMonitoringMetricBreakdown(data, metrics, groupBy)` | Query | `getMonitoringMetricBreakdown` | Pass/fail breakdown |
| `useMonitoringCorrelation(data, metrics)` | Query | `getMonitoringCorrelation` | Metric correlations |

## Human Signals Hooks

| Hook | Type | Wraps | Description |
|------|------|-------|-------------|
| `useUploadHumanSignalsFile()` | Mutation | `uploadHumanSignalsFile` | Upload human signals CSV |
| `useLoadHumanSignalsExample()` | Mutation | `loadHumanSignalsExampleDataset` | Load example human signals data |

## Memory Hooks

| Hook | Type | Wraps | Description |
|------|------|-------|-------------|
| `useUploadMemoryFile()` | Mutation | `uploadMemoryFile` | Upload memory rules CSV |
| `useUpdateMemoryRule()` | Mutation | `updateMemoryRule` | Update a rule |
| `useCreateMemoryRule()` | Mutation | `createMemoryRule` | Create a new rule |
| `useDeleteMemoryRule()` | Mutation | `deleteMemoryRule` | Delete a rule |

## Calibration (Align) Hooks

| Hook | Type | Wraps | Description |
|------|------|-------|-------------|
| `useAlignEvaluate()` | Mutation | `alignEvaluate` | Run alignment evaluation |
| `useAlignAnalyzeMisalignment()` | Mutation | `alignAnalyzeMisalignment` | Analyze misalignment patterns |
| `useAlignOptimizePrompt()` | Mutation | `alignOptimizePrompt` | Generate optimized judge prompt |
| `useAlignSuggestExamples()` | Mutation | `alignSuggestExamples` | Suggest few-shot calibration examples |
| `useClusterPatterns()` | Mutation | `alignClusterPatterns` | Discover error patterns and learning insights via EvidencePipeline. Returns `patterns`, `learnings`, and `pipeline_metadata` |
| `useAlignGetModels()` | Query | `alignGetModels` | List available LLM models |
| `useAlignGetConfigs()` | Query | `alignGetConfigs` | List saved judge configurations |
| `useAlignGetDefaults()` | Query | `alignGetDefaults` | Get default judge settings |
| `useAlignGetStatus()` | Query | `alignGetStatus` | Alignment service status |

## Report Hooks

| Hook | Type | Description |
|------|------|-------------|
| `useReportStream()` | Custom | Manages SSE-based report generation. Returns `{ report, thoughts, insights, isGenerating, error, generate, cancel }`. The `insights` field (`InsightResult \| null`) contains structured patterns discovered during generation |
| `useReportStatus()` | Query | Check report service status |

## Usage

### In Components

```typescript
'use client';

import { useDistribution } from '@/lib/hooks';
import { useDataStore } from '@/stores';

export function DistributionChart({ metric }: { metric: string }) {
  const { data } = useDataStore();
  const { data: dist, isLoading, error } = useDistribution(data, metric);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!dist) return null;

  return <PlotlyChart data={[{ type: 'violin', y: dist.values }]} />;
}
```

### Query Keys

Query hooks use structured keys for cache invalidation:

```typescript
['summaryStats', dataLength]
['distribution', metric, bins, dataLength]
['comparison', groupBy, metrics, dataLength]
['monitoringTrends', metrics, granularity, dataLength]
```

### Enabled Conditions

All query hooks include `enabled` guards to prevent fetching with `null` or empty data:

```typescript
enabled: !!data && data.length > 0
```
