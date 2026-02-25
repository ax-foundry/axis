import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCalibrationStore } from '@/stores/calibration-store';

import * as api from '../api';

import type { EvaluationRecord, DataFormat } from '@/types';

export function useCalibrationUpload() {
  const queryClient = useQueryClient();
  const { setData, setLoading, setError } = useCalibrationStore();

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
      queryClient.invalidateQueries({ queryKey: ['calibration-summary'] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Upload failed');
    },
    onSettled: () => {
      setLoading(false);
    },
  });
}

export function useCalibrationExampleDataset() {
  const queryClient = useQueryClient();
  const { setData, setLoading, setError } = useCalibrationStore();

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
      queryClient.invalidateQueries({ queryKey: ['calibration-summary'] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to load example');
    },
    onSettled: () => {
      setLoading(false);
    },
  });
}
