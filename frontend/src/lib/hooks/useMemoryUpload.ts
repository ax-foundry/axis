import { useMutation } from '@tanstack/react-query';

import * as memoryApi from '@/lib/api/memory-api';
import { useMemoryStore } from '@/stores/memory-store';

import type { MemoryRuleRecord } from '@/types/memory';

export function useMemoryUpload() {
  const { setData, setLoading, setError } = useMemoryStore();

  return useMutation({
    mutationFn: memoryApi.uploadMemoryFile,
    onMutate: () => {
      setLoading(true);
    },
    onSuccess: (response) => {
      setData(
        (response.data || []) as MemoryRuleRecord[],
        response.columns,
        response.filters_available,
        response.summary
      );
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Upload failed');
    },
    onSettled: () => {
      setLoading(false);
    },
  });
}
