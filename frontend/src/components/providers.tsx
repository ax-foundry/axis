'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { EvalDataInitializer } from '@/components/eval-data-initializer';
import { FaviconManager } from '@/components/favicon-manager';
import { HumanSignalsDataInitializer } from '@/components/human-signals-data-initializer';
import { MonitoringDataInitializer } from '@/components/monitoring-data-initializer';
import { ThemeProvider } from '@/components/theme-provider';
import { fetchApi } from '@/lib/api';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000, // 1 minute
          refetchOnWindowFocus: false,
        },
      },
    });
    // Prefetch plugin nav so sidebar renders with plugins on first paint
    client.prefetchQuery({
      queryKey: ['plugins'],
      queryFn: () => fetchApi('/api/config/plugins'),
    });
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <FaviconManager />
        <EvalDataInitializer>
          <MonitoringDataInitializer>
            <HumanSignalsDataInitializer>{children}</HumanSignalsDataInitializer>
          </MonitoringDataInitializer>
        </EvalDataInitializer>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
