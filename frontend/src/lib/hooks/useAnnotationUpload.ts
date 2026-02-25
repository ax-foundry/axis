import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAnnotationStore } from '@/stores/annotation-store';

import * as api from '../api';

import type { EvaluationRecord, DataFormat } from '@/types';

export function useAnnotationUpload() {
  const queryClient = useQueryClient();
  const { setData, setLoading, setError } = useAnnotationStore();

  return useMutation({
    mutationFn: api.uploadFile,
    onMutate: () => {
      setLoading(true);
    },
    onSuccess: (response) => {
      setData(
        (response.data || []) as EvaluationRecord[],
        response.format as DataFormat,
        response.columns,
        undefined
      );
      queryClient.invalidateQueries({ queryKey: ['annotation-summary'] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Upload failed');
    },
    onSettled: () => {
      setLoading(false);
    },
  });
}

export function useAnnotationExampleDataset() {
  const queryClient = useQueryClient();
  const { setData, setLoading, setError } = useAnnotationStore();

  return useMutation({
    mutationFn: api.loadExampleDataset,
    onMutate: () => {
      setLoading(true);
    },
    onSuccess: (response) => {
      setData(
        response.data as EvaluationRecord[],
        response.format as DataFormat,
        response.columns,
        `example_${response.format}`
      );
      queryClient.invalidateQueries({ queryKey: ['annotation-summary'] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to load example');
    },
    onSettled: () => {
      setLoading(false);
    },
  });
}
