'use client';

import { Activity, MessageSquareText } from 'lucide-react';
import Link from 'next/link';

export function QuickActionsBar() {
  return (
    <div className="border-border/50 flex items-center gap-4 rounded-lg border bg-white p-4">
      <span className="text-sm font-medium text-text-muted">Quick Actions:</span>
      <Link
        href="/monitoring"
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
      >
        <Activity className="h-4 w-4" />
        View Monitor Dashboard
      </Link>
      <Link
        href="/human-signals"
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
      >
        <MessageSquareText className="h-4 w-4" />
        View Human Signals
      </Link>
    </div>
  );
}
