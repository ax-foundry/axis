'use client';

import { ArrowRight, BookOpen } from 'lucide-react';

import { LearnTabs } from '@/components/learn';
import { PageHeader } from '@/components/ui/PageHeader';

export default function LearnPage() {
  return (
    <div className="min-h-screen">
      <PageHeader
        icon={BookOpen}
        title="Learn"
        subtitle="Interactive guides and best practices for AI evaluation"
        maxWidth="max-w-6xl"
      />

      {/* Content */}
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Main Content with Tabs */}
        <LearnTabs />

        {/* CTA Section */}
        <div className="card mt-8 bg-primary text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="mb-1 text-xl font-semibold">Ready to start evaluating?</h3>
              <p className="text-white/80">Upload your first dataset and explore the platform.</p>
            </div>
            <a
              href="/evaluate"
              className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-medium text-primary transition-colors hover:bg-white/90"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
