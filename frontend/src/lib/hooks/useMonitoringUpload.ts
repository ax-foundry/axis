import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useMonitoringStore, type MonitoringDataFormat } from '@/stores/monitoring-store';

import * as api from '../api';

import type { MonitoringRecord } from '@/types';

export function useMonitoringUpload() {
  const queryClient = useQueryClient();
  const { setData, setLoading, setError } = useMonitoringStore();

  return useMutation({
    mutationFn: api.uploadMonitoringFile,
    onMutate: () => {
      setLoading(true);
    },
    onSuccess: (response) => {
      setData(
        (response.data || []) as MonitoringRecord[],
        response.format as MonitoringDataFormat,
        response.columns,
        response.metric_columns || [],
        undefined
      );
      queryClient.invalidateQueries({ queryKey: ['monitoring-summary'] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Upload failed');
    },
    onSettled: () => {
      setLoading(false);
    },
  });
}

export function useMonitoringExampleDataset() {
  const queryClient = useQueryClient();
  const { setData, setLoading, setError } = useMonitoringStore();

  return useMutation({
    mutationFn: api.loadMonitoringExampleDataset,
    onMutate: () => {
      setLoading(true);
    },
    onSuccess: (response) => {
      setData(
        response.data as MonitoringRecord[],
        response.format as MonitoringDataFormat,
        response.columns,
        response.metric_columns || [],
        `example_${response.format}`
      );
      queryClient.invalidateQueries({ queryKey: ['monitoring-summary'] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to load example');
    },
    onSettled: () => {
      setLoading(false);
    },
  });
}

/**
 * Hook to check if monitoring database is configured for auto-connect
 */
export function useMonitoringDBConfig() {
  return useQuery({
    queryKey: ['monitoring-db-config'],
    queryFn: api.getMonitoringDBConfig,
    staleTime: 60 * 1000, // 1 minute
    retry: false, // Don't retry if backend is not available
  });
}

/**
 * Hook to auto-import monitoring data from configured database
 */
export function useMonitoringAutoImport() {
  const queryClient = useQueryClient();
  const { setData, setLoading, setError } = useMonitoringStore();

  return useMutation({
    mutationFn: api.autoImportMonitoringFromDB,
    onMutate: () => {
      setLoading(true);
    },
    onSuccess: (response) => {
      setData(
        response.data as MonitoringRecord[],
        response.format as MonitoringDataFormat,
        response.columns,
        response.metric_columns || [],
        'database_import'
      );
      queryClient.invalidateQueries({ queryKey: ['monitoring-summary'] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Database import failed');
    },
    onSettled: () => {
      setLoading(false);
    },
  });
}
