import { useQuery } from '@tanstack/react-query';

import { fetchApi } from '@/lib/api';

interface PluginNavItem {
  name: string;
  href: string;
  icon: string;
  section: string;
  order: number;
}

interface PluginInfo {
  name: string;
  description: string;
  nav: PluginNavItem[];
  enabled: boolean;
  error: string | null;
}

export function usePluginNav() {
  return useQuery<{ plugins: PluginInfo[] }>({
    queryKey: ['plugins'],
    queryFn: () => fetchApi('/api/config/plugins'),
    staleTime: Infinity, // Plugin list won't change at runtime
    retry: 1, // Fail fast, fallback to core nav
  });
}
