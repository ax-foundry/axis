import { FileText, MessageSquare, Workflow, Sparkles, CheckCircle } from 'lucide-react';

const sourceTypes = [
  {
    icon: FileText,
    title: 'Documents',
    description:
      'Upload PDFs, TXT, or Markdown files. The system extracts key statements and generates grounded QA pairs from your source material.',
    tags: ['PDF', 'TXT', 'MD'],
    color: 'text-primary',
    bg: 'bg-primary/10',
    accent: { background: 'linear-gradient(90deg, #8B9F4F, #A4B86C)' },
  },
  {
    icon: MessageSquare,
    title: 'Conversations',
    description:
      'Analyze real user conversations to capture frequently asked questions, misunderstood intents, and edge cases for more realistic test sets.',
    tags: ['Chat logs', 'Transcripts', 'Utterances'],
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
    accent: { background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)' },
  },
  {
    icon: Workflow,
    title: 'Workflows',
    description:
      'Define agent workflows and generate test cases that cover multi-step reasoning, tool use, and decision paths end-to-end.',
    tags: ['Agent flows', 'Tool chains', 'Pipelines'],
    color: 'text-accent-gold',
    bg: 'bg-accent-gold/10',
    accent: { background: 'linear-gradient(90deg, #D4AF37, #f59e0b)' },
  },
];

const workflowSteps = [
  {
    num: 1,
    title: 'Upload Sources',
    description:
      'Upload documents, conversation logs, or workflow definitions. The system processes and chunks content for generation.',
  },
  {
    num: 2,
    title: 'Configure & Generate',
    description:
      'Set parameters — question count, types, difficulty, agent context — and let the LLM-driven pipeline generate QA pairs.',
  },
  {
    num: 3,
    title: 'Validate & Refine',
    description:
      'A reflection-based validation loop checks factual accuracy, clarity, and diversity. Review, edit, and export your golden test set.',
  },
];

export default function SyntheticPage() {
  return (
    <div className="py-6">
      <div className="mx-auto max-w-5xl px-6">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-text-primary">
            Synthetic Test Set Generation
          </h1>
          <p className="mx-auto max-w-xl text-base text-text-muted">
            Generate high-quality QA pairs from your documents, conversations, and workflows.
            LLM-powered generation with reflection-based validation for golden test sets.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-amber-700">
            <Sparkles className="h-4 w-4" />
            <span className="font-medium">Coming Soon</span>
          </div>
        </div>

        {/* Source Types */}
        <div className="mb-12">
          <h2 className="mb-1 text-center text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Data Sources
          </h2>
          <p className="mb-6 text-center text-sm text-text-muted">
            Load from documents, conversations, or workflows
          </p>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {sourceTypes.map((source) => {
              const Icon = source.icon;
              return (
                <div key={source.title} className="rounded-xl border border-border bg-white p-6">
                  <div className="mb-5 h-0.5 rounded-full" style={source.accent} />
                  <div
                    className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${source.bg}`}
                  >
                    <Icon className={`h-5 w-5 ${source.color}`} />
                  </div>
                  <h3 className="mb-2 text-base font-bold text-text-primary">{source.title}</h3>
                  <p className="mb-4 text-sm leading-relaxed text-text-muted">
                    {source.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {source.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* How It Works */}
        <div className="mb-12">
          <h2 className="mb-1 text-center text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            How It Works
          </h2>
          <p className="mb-8 text-center text-sm text-text-muted">
            Multi-phase LLM-driven pipeline with self-improving validation
          </p>
          <div className="relative grid grid-cols-1 gap-8 md:grid-cols-3">
            {/* Connector */}
            <div className="absolute left-[calc(33.33%+8px)] right-[calc(33.33%+8px)] top-7 hidden h-0 border-t-2 border-dashed border-border md:block" />
            {workflowSteps.map((step) => (
              <div key={step.num} className="text-center">
                <div className="relative z-10 mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-xl font-bold text-white shadow-[0_0_20px_rgba(139,159,79,0.2)]">
                  {step.num}
                </div>
                <h3 className="mb-2 text-base font-bold text-text-primary">{step.title}</h3>
                <p className="mx-auto max-w-xs text-sm leading-relaxed text-text-muted">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Use Cases */}
        <div className="rounded-xl border border-border bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">Designed For</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {[
              'RAG model evaluation — test retrieval accuracy and answer grounding',
              'Agent component testing — validate tool use, reasoning, and decision paths',
              'Edge case discovery — surface gaps from real conversation patterns',
              'Regression test sets — maintain golden datasets as models evolve',
            ].map((item) => (
              <div key={item} className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <span className="text-sm text-text-secondary">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
