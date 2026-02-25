import { Users, Sparkles, MessageSquare, Bot, Zap } from 'lucide-react';

export default function SimulationPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="max-w-2xl text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <Users className="h-6 w-6 text-primary" />
        </div>

        {/* Title */}
        <h1 className="mb-3 text-2xl font-bold text-text-primary">Simulation</h1>
        <p className="mb-8 text-lg text-text-muted">
          Generate synthetic conversations with persona-based testing
        </p>

        {/* Coming Soon Badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-amber-700">
          <Sparkles className="h-4 w-4" />
          <span className="font-medium">Coming Soon</span>
        </div>

        {/* Feature Preview */}
        <div className="mb-8 rounded-lg border border-border bg-white p-5 text-left">
          <h3 className="mb-4 font-semibold text-text-primary">Planned Features</h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-text-primary">Persona Configuration</p>
                <p className="text-sm text-text-muted">
                  Define diverse user personas with traits, goals, and behavior patterns
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <MessageSquare className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-text-primary">Synthetic Conversation Generation</p>
                <p className="text-sm text-text-muted">
                  Generate realistic multi-turn conversations based on persona profiles
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-text-primary">Agent Integration</p>
                <p className="text-sm text-text-muted">
                  Connect to your AI agents and run automated simulation tests
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-text-primary">Batch Evaluation</p>
                <p className="text-sm text-text-muted">
                  Run simulations at scale and automatically evaluate results
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
      </div>
    </div>
  );
}
