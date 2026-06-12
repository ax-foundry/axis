import { ApiError } from '@/lib/api';

/**
 * Number of fast (5s) status polls during cold start before downshifting to
 * the slow interval. 60 polls × 5s = 5 minutes at the fast cadence. Polling
 * never stops while a sync is in progress — past this cap it continues at
 * SLOW_POLL_INTERVAL_MS. (A hard stop here once cleared the syncing flag
 * while the backend was still syncing, which dropped the page into the
 * legacy client-side import and rendered partial, unjoined data.)
 */
export const MAX_STORE_STATUS_POLLS = 60;

/** Fast poll interval while a sync is in progress (cold start). */
export const FAST_POLL_INTERVAL_MS = 5_000;

/** Slow poll interval after MAX_STORE_STATUS_POLLS fast polls, and max error backoff. */
export const SLOW_POLL_INTERVAL_MS = 30_000;

/**
 * Consecutive status-request failures before the page is allowed to proceed
 * without a store verdict (CSV-only deployments where the store endpoints
 * don't exist). Polling still continues in the background and recovers if
 * the backend comes back.
 */
export const STORE_STATUS_FAILURE_THRESHOLD = 5;

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
