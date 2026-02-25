import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useHumanSignalsStore, type HumanSignalsDataFormat } from '@/stores/human-signals-store';

import * as api from '../api';

import type { SignalsCaseRecord } from '@/types';

export function useHumanSignalsUpload() {
  const queryClient = useQueryClient();
  const store = useHumanSignalsStore();

  return useMutation({
    mutationFn: api.uploadHumanSignalsFile,
    onMutate: () => {
      store.setLoading(true);
    },
    onSuccess: (response) => {
      store.setData(
        response.data as SignalsCaseRecord[],
        response.format as HumanSignalsDataFormat,
        response.columns,
        response.metric_schema ?? null,
        response.display_config ?? null,
        undefined
      );
      queryClient.invalidateQueries({ queryKey: ['human-signals-summary'] });
    },
    onError: (error) => {
      store.setError(error instanceof Error ? error.message : 'Upload failed');
    },
    onSettled: () => {
      store.setLoading(false);
    },
  });
}

export function useHumanSignalsExampleDataset() {
  const queryClient = useQueryClient();
  const store = useHumanSignalsStore();

  return useMutation({
    mutationFn: api.loadHumanSignalsExampleDataset,
    onMutate: () => {
      store.setLoading(true);
    },
    onSuccess: (response) => {
      store.setData(
        response.data as SignalsCaseRecord[],
        response.format as HumanSignalsDataFormat,
        response.columns,
        response.metric_schema ?? null,
        response.display_config ?? null,
        `example_${response.format}`
      );
      queryClient.invalidateQueries({ queryKey: ['human-signals-summary'] });
    },
    onError: (error) => {
      store.setError(error instanceof Error ? error.message : 'Failed to load example');
    },
    onSettled: () => {
      store.setLoading(false);
    },
  });
}

/**
 * Hook to check if human signals database is configured for auto-connect
 */
export function useHumanSignalsDBConfig() {
  return useQuery({
    queryKey: ['human-signals-db-config'],
    queryFn: api.getHumanSignalsDBConfig,
    staleTime: 60 * 1000, // 1 minute
    retry: false, // Don't retry if backend is not available
  });
}

/**
 * Hook to auto-import human signals data from configured database
 */
export function useHumanSignalsAutoImport() {
  const queryClient = useQueryClient();
  const store = useHumanSignalsStore();

  return useMutation({
    mutationFn: api.autoImportHumanSignalsFromDB,
    onMutate: () => {
      store.setLoading(true);
    },
    onSuccess: (response) => {
      store.setData(
        response.data as SignalsCaseRecord[],
        response.format as HumanSignalsDataFormat,
        response.columns,
        response.metric_schema ?? null,
        response.display_config ?? null,
        'database_import'
      );
      queryClient.invalidateQueries({ queryKey: ['human-signals-summary'] });
    },
    onError: (error) => {
      store.setError(error instanceof Error ? error.message : 'Database import failed');
    },
    onSettled: () => {
      store.setLoading(false);
    },
  });
}
