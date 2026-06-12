import { useEffect, useRef, useState } from 'react';

import { getStoreStatus } from '@/lib/api';
import {
  FAST_POLL_INTERVAL_MS,
  MAX_STORE_STATUS_POLLS,
  SLOW_POLL_INTERVAL_MS,
  STORE_STATUS_FAILURE_THRESHOLD,
} from '@/lib/hooks/sync-retry';

import type { DatasetSyncStatus } from '@/types';

export interface StoreReadiness {
  /** True once we have a store verdict — a successful status response, or
   *  STORE_STATUS_FAILURE_THRESHOLD consecutive failures (store unreachable). */
  storeStatusChecked: boolean;
  /** Whether the DuckDB store is enabled on the backend. null until the first
   *  successful status response. */
  storeEnabled: boolean | null;
  /** True while the dataset's sync state is 'syncing'. Truthful for the whole
   *  sync, however long it takes — never cleared by a poll cap or a transient
   *  request failure. */
  isSyncing: boolean;
  /** Last status received for the dataset. */
  syncStatus: DatasetSyncStatus | null;
}

/**
 * Poll the DuckDB store status for one dataset until its sync settles.
 *
 * Replaces the per-page hand-rolled poll loops, which had two trapdoors that
 * dropped pages into the legacy client-side import mid-sync (rendering
 * partial, unjoined data):
 *  - a thrown request error stopped polling permanently, and
 *  - after MAX_STORE_STATUS_POLLS the loop gave up and cleared the syncing
 *    flag while the backend was still syncing.
 *
 * This hook never abandons an in-progress sync: errors retry with backoff
 * (capped at SLOW_POLL_INTERVAL_MS), and past the fast-poll cap it downshifts
 * to slow polling instead of giving up. The backend seeds active auto-load
 * datasets to 'syncing' before serving, so 'not_synced' reliably means "not
 * store-managed here" and is a settled state.
 */
export function useStoreReadiness(
  datasetKey: string,
  onStatus?: (status: DatasetSyncStatus) => void
): StoreReadiness {
  const [storeStatusChecked, setStoreStatusChecked] = useState(false);
  const [storeEnabled, setStoreEnabled] = useState<boolean | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<DatasetSyncStatus | null>(null);

  // Keep the latest callback without re-running the poll effect
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    let pollCount = 0;
    let consecutiveFailures = 0;

    const schedule = (delayMs: number) => {
      if (!cancelled) timeoutId = setTimeout(poll, delayMs);
    };

    const poll = async () => {
      try {
        const status = await getStoreStatus();
        if (cancelled) return;
        consecutiveFailures = 0;
        setStoreEnabled(status.enabled === true);
        setStoreStatusChecked(true);

        const ds = status.datasets?.[datasetKey];
        if (ds) {
          setSyncStatus(ds);
          onStatusRef.current?.(ds);
          const syncing = ds.state === 'syncing';
          setIsSyncing(syncing);
          if (syncing) {
            // Fast polls during the normal cold-start window, then slow —
            // but never stop while the sync is still running.
            pollCount += 1;
            schedule(
              pollCount < MAX_STORE_STATUS_POLLS ? FAST_POLL_INTERVAL_MS : SLOW_POLL_INTERVAL_MS
            );
          }
          // 'ready' | 'error' | 'not_synced' are settled — stop polling.
        }
      } catch {
        if (cancelled) return;
        // Store not reachable (cold start, restart, network blip). Keep
        // retrying with backoff — a single failure must not strand the page —
        // but after enough failures let the page proceed (CSV-only deploys).
        consecutiveFailures += 1;
        if (consecutiveFailures >= STORE_STATUS_FAILURE_THRESHOLD) {
          setStoreStatusChecked(true);
        }
        schedule(
          Math.min(FAST_POLL_INTERVAL_MS * 2 ** (consecutiveFailures - 1), SLOW_POLL_INTERVAL_MS)
        );
      }
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [datasetKey]);

  return { storeStatusChecked, storeEnabled, isSyncing, syncStatus };
}
