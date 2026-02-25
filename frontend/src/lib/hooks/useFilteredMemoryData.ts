import { useMemo } from 'react';

import { useMemoryStore } from '@/stores/memory-store';

/**
 * Returns memory data filtered by the selected agent name.
 * When no agent is selected (empty string), returns all data.
 */
export function useFilteredMemoryData() {
  const data = useMemoryStore((s) => s.data);
  const selectedAgentName = useMemoryStore((s) => s.selectedAgentName);

  return useMemo(() => {
    if (!selectedAgentName) return data;
    return data.filter((r) => String(r.agent ?? '') === selectedAgentName);
  }, [data, selectedAgentName]);
}
