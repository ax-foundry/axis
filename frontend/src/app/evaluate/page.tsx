'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useDataStore } from '@/stores';

export default function EvaluatePage() {
  const router = useRouter();
  const { data } = useDataStore();
  const hasData = data.length > 0;

  useEffect(() => {
    // Redirect based on data state
    // If data is loaded, go to scorecard; otherwise go to runner (first step)
    const target = hasData ? '/evaluate/scorecard' : '/evaluate/runner';
    router.replace(target);
  }, [hasData, router]);

  // Show loading state while redirecting
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}
