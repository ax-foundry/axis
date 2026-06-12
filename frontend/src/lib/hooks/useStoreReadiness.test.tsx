// @vitest-environment jsdom
/**
 * Tests for the useStoreReadiness poll state machine.
 *
 * The hand-rolled per-page poll loops this hook replaced had two trapdoors
 * that dropped pages into the legacy client-side import mid-sync:
 *  - a single thrown request error stopped polling permanently, and
 *  - after MAX_STORE_STATUS_POLLS the loop gave up and cleared isSyncing
 *    while the backend was still syncing.
 * These tests pin the fixed behavior: errors retry with backoff forever, and
 * past the fast-poll cap the hook downshifts to slow polling instead of
 * giving up.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getStoreStatus } from '@/lib/api';
import {
  FAST_POLL_INTERVAL_MS,
  MAX_STORE_STATUS_POLLS,
  SLOW_POLL_INTERVAL_MS,
  STORE_STATUS_FAILURE_THRESHOLD,
} from '@/lib/hooks/sync-retry';
import { useStoreReadiness } from '@/lib/hooks/useStoreReadiness';

import type { StoreStatusResponse, SyncState } from '@/types';

// vi.mock is hoisted above the imports, so the import above receives the mock.
vi.mock('@/lib/api', () => ({
  getStoreStatus: vi.fn(),
}));

const mockGetStoreStatus = vi.mocked(getStoreStatus);

const statusResponse = (state: SyncState, rows = 0): StoreStatusResponse => ({
  success: true,
  enabled: true,
  datasets: {
    monitoring_data: { state, rows, last_sync: null, error: null, truncated: false },
  },
});

/** Flush the initial on-mount poll (fires outside the timer queue). */
const flushMount = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('useStoreReadiness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetStoreStatus.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('settles immediately on ready and stops polling', async () => {
    mockGetStoreStatus.mockResolvedValue(statusResponse('ready', 100));

    const { result } = renderHook(() => useStoreReadiness('monitoring_data'));
    await flushMount();

    expect(result.current.storeStatusChecked).toBe(true);
    expect(result.current.storeEnabled).toBe(true);
    expect(result.current.isSyncing).toBe(false);
    expect(result.current.syncStatus?.rows).toBe(100);

    await advance(SLOW_POLL_INTERVAL_MS * 3);
    expect(mockGetStoreStatus).toHaveBeenCalledTimes(1);
  });

  it('keeps fast-polling while syncing, then settles when the sync completes', async () => {
    mockGetStoreStatus.mockResolvedValue(statusResponse('syncing'));

    const { result } = renderHook(() => useStoreReadiness('monitoring_data'));
    await flushMount();

    expect(result.current.isSyncing).toBe(true);
    expect(result.current.storeStatusChecked).toBe(true);

    await advance(FAST_POLL_INTERVAL_MS);
    expect(mockGetStoreStatus).toHaveBeenCalledTimes(2);

    mockGetStoreStatus.mockResolvedValue(statusResponse('ready', 41));
    await advance(FAST_POLL_INTERVAL_MS);

    expect(result.current.isSyncing).toBe(false);
    expect(result.current.syncStatus?.rows).toBe(41);

    await advance(SLOW_POLL_INTERVAL_MS * 3);
    expect(mockGetStoreStatus).toHaveBeenCalledTimes(3);
  });

  it('treats not_synced as settled (not store-managed) and stops polling', async () => {
    mockGetStoreStatus.mockResolvedValue(statusResponse('not_synced'));

    const { result } = renderHook(() => useStoreReadiness('monitoring_data'));
    await flushMount();

    expect(result.current.isSyncing).toBe(false);
    expect(result.current.storeStatusChecked).toBe(true);

    await advance(SLOW_POLL_INTERVAL_MS * 3);
    expect(mockGetStoreStatus).toHaveBeenCalledTimes(1);
  });

  it('retries after a request error instead of dying (the old trapdoor)', async () => {
    mockGetStoreStatus.mockRejectedValueOnce(new Error('backend restarting'));
    const { result } = renderHook(() => useStoreReadiness('monitoring_data'));
    await flushMount();

    // One failure: no verdict yet, but the loop is still alive.
    expect(result.current.storeStatusChecked).toBe(false);
    expect(result.current.storeEnabled).toBe(null);

    mockGetStoreStatus.mockResolvedValue(statusResponse('syncing'));
    await advance(FAST_POLL_INTERVAL_MS); // first backoff step = fast interval

    expect(result.current.isSyncing).toBe(true);
    expect(result.current.storeEnabled).toBe(true);
    expect(result.current.storeStatusChecked).toBe(true);
  });

  it('sets storeStatusChecked after the failure threshold but keeps polling', async () => {
    mockGetStoreStatus.mockRejectedValue(new Error('store down'));

    const { result } = renderHook(() => useStoreReadiness('monitoring_data'));
    await flushMount(); // failure 1

    // Each backoff step is capped at the slow interval, so advancing by it
    // always reaches the next retry.
    for (let i = 1; i < STORE_STATUS_FAILURE_THRESHOLD; i++) {
      await advance(SLOW_POLL_INTERVAL_MS);
    }

    expect(result.current.storeStatusChecked).toBe(true);
    expect(result.current.storeEnabled).toBe(null); // never got a real verdict

    // Polling continues past the threshold and recovers when the store returns.
    mockGetStoreStatus.mockResolvedValue(statusResponse('ready', 7));
    await advance(SLOW_POLL_INTERVAL_MS);
    expect(result.current.storeEnabled).toBe(true);
    expect(result.current.isSyncing).toBe(false);
  });

  it('downshifts to slow polling past the cap instead of giving up (the old trapdoor)', async () => {
    mockGetStoreStatus.mockResolvedValue(statusResponse('syncing'));

    const { result } = renderHook(() => useStoreReadiness('monitoring_data'));
    await flushMount(); // poll 1

    for (let i = 1; i < MAX_STORE_STATUS_POLLS; i++) {
      await advance(FAST_POLL_INTERVAL_MS);
    }
    expect(mockGetStoreStatus).toHaveBeenCalledTimes(MAX_STORE_STATUS_POLLS);

    // Past the cap: a fast interval elapses with no new poll...
    await advance(FAST_POLL_INTERVAL_MS);
    expect(mockGetStoreStatus).toHaveBeenCalledTimes(MAX_STORE_STATUS_POLLS);

    // ...but the slow interval still fires, and isSyncing stays truthful.
    await advance(SLOW_POLL_INTERVAL_MS - FAST_POLL_INTERVAL_MS);
    expect(mockGetStoreStatus).toHaveBeenCalledTimes(MAX_STORE_STATUS_POLLS + 1);
    expect(result.current.isSyncing).toBe(true);
  });

  it('reports each dataset status through onStatus', async () => {
    const onStatus = vi.fn();
    mockGetStoreStatus.mockResolvedValue(statusResponse('syncing', 10));

    renderHook(() => useStoreReadiness('monitoring_data', onStatus));
    await flushMount();

    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'syncing', rows: 10 })
    );

    mockGetStoreStatus.mockResolvedValue(statusResponse('ready', 50));
    await advance(FAST_POLL_INTERVAL_MS);
    expect(onStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'ready', rows: 50 })
    );
  });

  it('stops scheduling polls after unmount', async () => {
    mockGetStoreStatus.mockResolvedValue(statusResponse('syncing'));

    const { unmount } = renderHook(() => useStoreReadiness('monitoring_data'));
    await flushMount();
    unmount();

    await advance(SLOW_POLL_INTERVAL_MS * 3);
    expect(mockGetStoreStatus).toHaveBeenCalledTimes(1);
  });
});
