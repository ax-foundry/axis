import { ApiError } from '@/lib/api';

/**
 * Max number of times to poll getStoreStatus() during cold start.
 * 60 polls × 5s interval = 5 minutes max before giving up.
 */
export const MAX_STORE_STATUS_POLLS = 60;

/**
 * Shared React Query retry config for DuckDB-backed endpoints.
 *
 * During cold starts, DuckDB startup sync can take several minutes.
 * Analytics and store endpoints return 503 (syncing) or 404 (table not created yet)
 * until sync completes. This config retries those transient errors with a fixed
 * 15s delay, covering ~5 minutes of sync time.
 *
 * Fixed delay (not exponential) keeps retry volume predictable: each hook retries
 * at most once per 15s, so 12 hooks = ~0.8 req/s peak during cold start.
 */
export const SYNC_RETRY_CONFIG = {
  retry: (failureCount: number, error: Error) => {
    if (error instanceof ApiError && (error.status === 503 || error.status === 404)) {
      return failureCount < 20; // 20 × 15s = 5 min coverage
    }
    return failureCount < 3;
  },
  retryDelay: () => 15_000, // fixed 15s between retries — avoids thundering herd
};
