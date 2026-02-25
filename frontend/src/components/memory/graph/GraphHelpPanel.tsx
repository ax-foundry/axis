'use client';

import { ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';
import { GraphNodeColors } from '@/types/memory';

import type { GraphNodeType } from '@/types/memory';

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-text-primary hover:bg-gray-50"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
        )}
        {title}
      </button>
      {open && (
        <div className="px-4 pb-3 pt-0 text-xs leading-relaxed text-text-secondary">{children}</div>
      )}
    </div>
  );
}

const NODE_TYPES: Array<{ type: GraphNodeType; description: string }> = [
  {
    type: 'RiskFactor',
    description:
      'Observable conditions or characteristics that influence decisions (e.g., data quality, threshold breach, anomaly detected). These are the triggers that activate rules.',
  },
  {
    type: 'Rule',
    description:
      'Decision logic extracted from guidelines. Each rule maps a risk factor to an action (reject, escalate, approve with conditions, etc.) and can be Hard (mandatory) or Soft (advisory).',
  },
  {
    type: 'Outcome',
    description:
      'The result when a rule fires — what happens to the request (e.g., "reject request", "escalate to reviewer", "apply additional constraints").',
  },
  {
    type: 'Mitigant',
    description:
      'Conditions that can soften or override a rule\'s action (e.g., "manual review completed", "additional documentation provided", "override approved").',
  },
  {
    type: 'Source',
    description:
      'The document or guideline the rule was extracted from (e.g., "Operations Manual v3.2", "Processing Guidelines").',
  },
];

const EDGE_TYPES = [
  {
    label: 'TRIGGERS',
    style: 'solid',
    description:
      'A risk factor activates a rule. Example: "threshold_exceeded" TRIGGERS "threshold_breach_reject".',
  },
  {
    label: 'RESULTS_IN',
    style: 'solid',
    description:
      'A rule produces an outcome. Example: "threshold_breach_reject" RESULTS_IN "reject request".',
  },
  {
    label: 'OVERRIDES',
    style: 'dashed',
    description:
      'A mitigant can override or soften a rule. Example: "manual_review_completed" OVERRIDES "threshold_breach_reject". Shown as dashed lines.',
  },
  {
    label: 'DERIVED_FROM',
    style: 'solid',
    description:
      'A rule was extracted from a source document. Example: "threshold_breach_reject" DERIVED_FROM "Operations Manual v3.2".',
  },
];

export function GraphHelpPanel() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-white">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-text-primary hover:bg-gray-50"
      >
        <HelpCircle className="h-4 w-4 text-primary" />
        <span>Understanding the Knowledge Graph</span>
        <span className="ml-auto text-xs text-text-muted">{expanded ? 'collapse' : 'expand'}</span>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-text-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 text-text-muted" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border">
          <Section title="What is the Knowledge Graph?" defaultOpen>
            <p>
              The knowledge graph represents the decision logic extracted from guidelines and
              operational knowledge. It captures <strong>risk factors</strong>, the{' '}
              <strong>rules</strong> they trigger, the <strong>outcomes</strong> those rules
              produce, any <strong>mitigants</strong> that can override them, and the{' '}
              <strong>source</strong> documents they came from.
            </p>
            <p className="mt-2">
              This graph is built automatically by the extraction pipeline: guidelines are parsed,
              rules are identified, and relationships are ingested into FalkorDB as a connected
              graph.
            </p>
          </Section>

          <Section title="Node Types">
            <div className="space-y-2.5">
              {NODE_TYPES.map(({ type, description }) => (
                <div key={type} className="flex gap-2.5">
                  <span
                    className="mt-1 inline-block h-3 w-3 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: GraphNodeColors[type] }}
                  />
                  <div>
                    <span className="font-semibold text-text-primary">{type}</span>
                    <span className="ml-1 text-text-muted">&mdash;</span> <span>{description}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Edge Types (Relationships)">
            <div className="space-y-2.5">
              {EDGE_TYPES.map(({ label, style, description }) => (
                <div key={label} className="flex gap-2.5">
                  <div className="mt-2 flex h-0.5 w-5 flex-shrink-0 items-center">
                    <div
                      className={cn(
                        'h-px w-full bg-gray-500',
                        style === 'dashed' &&
                          'border-t border-dashed border-gray-500 bg-transparent'
                      )}
                    />
                  </div>
                  <div>
                    <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-semibold text-text-primary">
                      {label}
                    </code>{' '}
                    <span>{description}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Hard vs. Soft Rules">
            <p>
              <strong>Hard rules</strong> (threshold_type = &quot;hard&quot;) are mandatory and
              non-negotiable. When triggered, the action must be taken (e.g., automatic rejection
              for policy-violating inputs).
            </p>
            <p className="mt-2">
              <strong>Soft rules</strong> (threshold_type = &quot;soft&quot;) are advisory. They
              flag conditions for review but allow human judgment — mitigants can override or soften
              the action.
            </p>
          </Section>

          <Section title="How to Use This Visualization">
            <ul className="list-inside list-disc space-y-1.5">
              <li>
                <strong>Zoom &amp; Pan</strong> — Scroll to zoom in/out, click and drag on empty
                space to pan around the graph.
              </li>
              <li>
                <strong>Drag Nodes</strong> — Click and drag any node to reposition it. The
                simulation will re-settle around the new position.
              </li>
              <li>
                <strong>Click to Inspect</strong> — Click a node to open its detail panel on the
                right, showing its type, properties, and all connected nodes.
              </li>
              <li>
                <strong>Search</strong> — Use the search bar to find nodes by name. Results show
                matching nodes with their type and connection count.
              </li>
              <li>
                <strong>Filter by Type</strong> — Use the dropdown to filter the graph to a single
                node type (e.g., only show Rules).
              </li>
              <li>
                <strong>Labels</strong> — Labels appear on hover for most nodes. Highly connected
                nodes (4+ connections) always show their label.
              </li>
            </ul>
          </Section>

          <Section title="Data Flow: From Guidelines to Graph">
            <ol className="list-inside list-decimal space-y-1.5">
              <li>
                <strong>Extraction</strong> — LLM parses operational manuals and guidelines to
                identify rules, risk factors, outcomes, mitigants, and sources.
              </li>
              <li>
                <strong>Normalization</strong> — Extracted entities are deduplicated, normalized,
                and assigned canonical identifiers.
              </li>
              <li>
                <strong>Ingestion</strong> — Normalized data is written to FalkorDB as nodes and
                edges using Cypher queries.
              </li>
              <li>
                <strong>Retrieval</strong> — This visualization queries the graph to display the
                current state of the knowledge base.
              </li>
            </ol>
          </Section>
        </div>
      )}
    </div>
  );
}
