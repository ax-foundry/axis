'use client';

import { BookOpen } from 'lucide-react';

import { LearnTabs } from '@/components/learn';
import { PageHeader } from '@/components/ui/PageHeader';

export default function LearnPage() {
  return (
    <div className="min-h-screen">
      <PageHeader
        icon={BookOpen}
        title="Learn"
        subtitle="Metric definitions, interactive guides, and best practices"
        maxWidth="max-w-6xl"
      />

      {/* Content */}
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Main Content with Tabs */}
        <LearnTabs />
      </div>
    </div>
  );
}
