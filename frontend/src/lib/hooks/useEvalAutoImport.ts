import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useDataStore } from '@/stores';

import * as api from '../api';

import type { DataFormat, EvaluationRecord } from '@/types';

/**
 * Hook to check if eval database is configured for auto-load
 */
export function useEvalDBConfig() {
  return useQuery({
    queryKey: ['eval-db-config'],
    queryFn: api.getEvalDBConfig,
    staleTime: 60 * 1000, // 1 minute
    retry: false, // Don't retry if backend is not available
  });
}

/**
 * Hook to auto-import evaluation data from configured database
 */
export function useEvalAutoImport() {
  const queryClient = useQueryClient();
  const { setData, setLoading, setError } = useDataStore();

  return useMutation({
    mutationFn: api.autoImportEvalFromDB,
    onMutate: () => {
      setLoading(true);
    },
    onSuccess: (response) => {
      setData(
        (response.data || []) as EvaluationRecord[],
        response.format as DataFormat,
        response.columns,
        'database_import'
      );
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Database import failed');
    },
    onSettled: () => {
      setLoading(false);
    },
  });
}
