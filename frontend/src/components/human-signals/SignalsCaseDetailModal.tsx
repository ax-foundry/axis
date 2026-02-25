'use client';

import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  Clock,
  ExternalLink,
  Hash,
  Lightbulb,
  MessageSquare,
  Shield,
  Tag,
  X,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { pythonToJson } from '@/components/shared';
import { cn } from '@/lib/utils';

import type { SignalsCaseRecord, SignalsMetricSchema, SignalsDisplayConfig } from '@/types';

// Additional metadata columns to extract and display (not part of metric signals)
const METADATA_COLUMNS = [
  'evaluation_metadata',
  'actual_reference',
  'additional_input',
  'additional_output',
];

// Slack emoji shortcode → Unicode mapping
const EMOJI_MAP: Record<string, string> = {
  white_circle: '\u26AA',
  x: '\u274C',
  heavy_check_mark: '\u2714\uFE0F',
  warning: '\u26A0\uFE0F',
  red_circle: '\uD83D\uDD34',
  green_circle: '\uD83D\uDFE2',
  blue_circle: '\uD83D\uDD35',
  star: '\u2B50',
  fire: '\uD83D\uDD25',
  rocket: '\uD83D\uDE80',
  thumbsup: '\uD83D\uDC4D',
  thumbsdown: '\uD83D\uDC4E',
  eyes: '\uD83D\uDC40',
  bulb: '\uD83D\uDCA1',
  memo: '\uD83D\uDCDD',
  link: '\uD83D\uDD17',
  rotating_light: '\uD83D\uDEA8',
  point_right: '\uD83D\uDC49',
};

function parseSlackMarkdown(text: string, darkBg: boolean): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const linkClass = darkBg
    ? 'text-white underline decoration-white/40 hover:decoration-white'
    : 'text-primary underline decoration-primary/30 hover:decoration-primary';
  const emojiLabelClass = darkBg
    ? 'mx-0.5 inline-flex rounded bg-white/20 px-1 py-0.5 text-[10px] font-medium text-white/80'
    : 'mx-0.5 inline-flex rounded bg-gray-200 px-1 py-0.5 text-[10px] font-medium text-text-muted';
  const regex = /<([^|>]+)\|([^>]+)>|<([^>]+)>|\*([^*]+)\*|:([a-z0-9_+-]+):/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1] && match[2]) {
      nodes.push(
        <a
          key={key++}
          href={match[1]}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {match[2]}
        </a>
      );
    } else if (match[3]) {
      nodes.push(
        <a
          key={key++}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {match[3]}
        </a>
      );
    } else if (match[4]) {
      nodes.push(
        <strong key={key++} className="font-semibold">
          {match[4]}
        </strong>
      );
    } else if (match[5]) {
      const emoji = EMOJI_MAP[match[5]];
      if (emoji) {
        nodes.push(<span key={key++}>{emoji}</span>);
      } else {
        nodes.push(
          <span key={key++} className={emojiLabelClass}>
            {match[5]}
          </span>
        );
      }
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

function SlackContent({ content, darkBg = false }: { content: string; darkBg?: boolean }) {
  const lines = content.split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {parseSlackMarkdown(line, darkBg)}
        </span>
      ))}
    </>
  );
}

interface SignalsCaseDetailModalProps {
  caseRecord: SignalsCaseRecord;
  metricSchema: SignalsMetricSchema;
  displayConfig?: SignalsDisplayConfig;
  onClose: () => void;
}

export function SignalsCaseDetailModal({
  caseRecord,
  metricSchema,
  displayConfig,
  onClose,
}: SignalsCaseDetailModalProps) {
  const [conversationExpanded, setConversationExpanded] = useState(false);
  const [learningsExpanded, setLearningsExpanded] = useState(false);
  const [featureRequestsExpanded, setFeatureRequestsExpanded] = useState(false);

  const colorMaps = useMemo(() => displayConfig?.color_maps || {}, [displayConfig]);

  // Build metric sections for the detail view
  const metricSections = useMemo(() => {
    const sections: {
      metric: string;
      signals: { key: string; label: string; value: unknown; type: string }[];
    }[] = [];

    Object.entries(metricSchema.metrics).forEach(([metricName, meta]) => {
      const signals: { key: string; label: string; value: unknown; type: string }[] = [];
      meta.signals.forEach((signal) => {
        const key = `${metricName}__${signal}`;
        const value = caseRecord[key];
        if (value != null) {
          signals.push({
            key,
            label: signal.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
            value,
            type: meta.signal_types[signal] || 'string',
          });
        }
      });
      if (signals.length > 0) {
        sections.push({ metric: metricName, signals });
      }
    });

    return sections;
  }, [caseRecord, metricSchema]);

  // Collect additional metadata columns (not part of metric signals)
  const metadataEntries = useMemo(() => {
    return METADATA_COLUMNS.filter((col) => caseRecord[col] != null).map((col) => ({
      key: col,
      label: col.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      value: caseRecord[col],
    }));
  }, [caseRecord]);

  // Extract key fields from flattened data
  const slackUrl = caseRecord.Slack_URL as string | null;
  const messages = (caseRecord.Full_Conversation || []) as { role: string; content: string }[];
  const learnings = (caseRecord['learnings_count__learnings'] || []) as string[];
  const learningCategories = (caseRecord['learnings_count__categories'] || []) as string[];
  const featureRequests = (caseRecord['feature_requests_count__requests'] || []) as string[];
  const suggestedAction = caseRecord['has_actionable_feedback__suggested_action'] as string | null;
  const hasActionableFeedback = Boolean(
    caseRecord['has_actionable_feedback__has_actionable_feedback']
  );

  // Collect top-level status badges
  const badges = useMemo(() => {
    const result: { label: string; color: string }[] = [];
    const tryAdd = (mapKey: string, valueKey: string) => {
      const val = caseRecord[valueKey];
      if (val == null || val === '') return;
      const strVal = String(val);
      const map = colorMaps[mapKey];
      const color = map?.[strVal] || '#7F8C8D';
      result.push({ label: strVal.replace(/_/g, ' '), color });
    };

    tryAdd('intervention_type__intervention_type', 'intervention_type__intervention_type');
    tryAdd('sentiment_category__sentiment', 'sentiment_category__sentiment');
    tryAdd('resolution_status__final_status', 'resolution_status__final_status');
    tryAdd('priority_level__priority_level', 'priority_level__priority_level');
    tryAdd('attribution_confidence__confidence', 'attribution_confidence__confidence');
    tryAdd('acceptance_status__status', 'acceptance_status__status');
    tryAdd('escalation_type__escalation_type', 'escalation_type__escalation_type');

    return result;
  }, [caseRecord, colorMaps]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white px-6 py-4">
          <div>
            <div className="flex items-center gap-3">
              <Hash className="h-4 w-4 text-text-muted" />
              <h2 className="text-lg font-semibold text-text-primary">{caseRecord.Case_ID}</h2>
              {caseRecord.source_name && (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-medium text-primary">
                  {String(caseRecord.source_name)}
                </span>
              )}
            </div>
            {caseRecord.Business && (
              <p className="mt-0.5 text-sm text-text-muted">{String(caseRecord.Business)}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-gray-100 hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Slack Link */}
          {slackUrl && (
            <div className="mb-4">
              <a
                href={slackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-[#4A154B] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3e1240]"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
                </svg>
                View in Slack
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {/* Status Badges */}
          {badges.length > 0 && (
            <div className="mb-5 flex flex-wrap gap-2">
              {badges.map((badge, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium capitalize text-white"
                  style={{ backgroundColor: badge.color }}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          )}

          {/* Meta row */}
          <div className="mb-5 flex flex-wrap gap-4 text-xs text-text-muted">
            {caseRecord.Timestamp && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(String(caseRecord.Timestamp)).toLocaleString()}
              </div>
            )}
            {caseRecord.Message_Count != null && (
              <div className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {caseRecord.Message_Count} messages
              </div>
            )}
            {caseRecord.Business && (
              <div className="flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {String(caseRecord.Business)}
              </div>
            )}
            {caseRecord.Agent_Name && (
              <div className="flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {String(caseRecord.Agent_Name)}
              </div>
            )}
            {caseRecord.environment && (
              <div className="flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {String(caseRecord.environment)}
              </div>
            )}
          </div>

          {/* Metric Sections */}
          <div className="space-y-4">
            {metricSections.map((section) => {
              const iconMap: Record<string, React.ReactNode> = {
                intervention_type: <AlertTriangle className="h-4 w-4" />,
                resolution_status: <CheckCircle className="h-4 w-4" />,
                escalation_type: <AlertTriangle className="h-4 w-4" />,
                sentiment_category: <Shield className="h-4 w-4" />,
                acceptance_status: <XCircle className="h-4 w-4" />,
                override_type: <XCircle className="h-4 w-4" />,
                failed_step: <AlertTriangle className="h-4 w-4" />,
                has_actionable_feedback: <Lightbulb className="h-4 w-4" />,
                learnings_count: <Lightbulb className="h-4 w-4" />,
                feature_requests_count: <MessageSquare className="h-4 w-4" />,
              };

              return (
                <div key={section.metric} className="rounded-lg border border-border p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="text-primary">
                      {iconMap[section.metric] || <Tag className="h-4 w-4" />}
                    </div>
                    <h4 className="text-sm font-semibold capitalize text-text-primary">
                      {section.metric.replace(/_/g, ' ')}
                    </h4>
                  </div>
                  <div className="space-y-1">
                    {/* Simple signals in a grid */}
                    {section.signals.some((s) => !isComplexValue(s.value)) && (
                      <div className="grid grid-cols-2 gap-2">
                        {section.signals
                          .filter((s) => !isComplexValue(s.value))
                          .map((sig) => (
                            <div key={sig.key} className="px-3 py-2">
                              <div className="text-[10px] text-text-muted">{sig.label}</div>
                              <div className="mt-0.5 text-sm text-text-primary">
                                <SignalValueDisplay value={sig.value} type={sig.type} />
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                    {/* Complex signals full-width */}
                    {section.signals
                      .filter((s) => isComplexValue(s.value))
                      .map((sig) => (
                        <div key={sig.key} className="px-3 py-2">
                          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                            {sig.label}
                          </div>
                          <div className="max-h-[400px] overflow-y-auto text-sm text-text-primary">
                            <SignalValueDisplay value={sig.value} type={sig.type} />
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Additional Metadata */}
          {metadataEntries.length > 0 && (
            <div className="mt-4 space-y-4">
              <h3 className="text-sm font-semibold text-text-primary">Additional Details</h3>
              {metadataEntries.map((entry) => (
                <div key={entry.key} className="rounded-lg border border-border p-4">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    {entry.label}
                  </div>
                  <div className="max-h-[400px] overflow-y-auto text-sm text-text-primary">
                    <SignalValueDisplay value={entry.value} type="object" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Suggested Action */}
          {hasActionableFeedback && suggestedAction && (
            <div className="mt-4 rounded-lg bg-primary/5 p-4">
              <h4 className="mb-1 text-sm font-semibold text-primary">Suggested Action</h4>
              <p className="text-sm text-text-primary">{suggestedAction}</p>
            </div>
          )}

          {/* Learnings */}
          {Array.isArray(learnings) && learnings.length > 0 && (
            <div className="mt-4">
              <ExpandableSection
                title="Learnings"
                icon={<Lightbulb className="h-4 w-4 text-primary" />}
                expanded={learningsExpanded}
                onToggle={() => setLearningsExpanded(!learningsExpanded)}
                count={learnings.length}
              >
                <div className="space-y-2 rounded-lg border border-border p-4">
                  {learnings.map((learning, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {i + 1}
                      </span>
                      <p className="text-sm text-text-primary">{learning}</p>
                    </div>
                  ))}
                  {Array.isArray(learningCategories) && learningCategories.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1 border-t border-border pt-2">
                      {learningCategories.map((cat, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-text-muted"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </ExpandableSection>
            </div>
          )}

          {/* Feature Requests */}
          {Array.isArray(featureRequests) && featureRequests.length > 0 && (
            <div className="mt-4">
              <ExpandableSection
                title="Feature Requests"
                icon={<MessageSquare className="h-4 w-4 text-primary" />}
                expanded={featureRequestsExpanded}
                onToggle={() => setFeatureRequestsExpanded(!featureRequestsExpanded)}
                count={featureRequests.length}
              >
                <div className="space-y-2 rounded-lg border border-border p-4">
                  {featureRequests.map((req, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent-gold/10 text-xs font-semibold text-accent-gold">
                        {i + 1}
                      </span>
                      <p className="text-sm text-text-primary">{req}</p>
                    </div>
                  ))}
                </div>
              </ExpandableSection>
            </div>
          )}

          {/* Conversation Thread */}
          {messages.length > 0 && (
            <div className="mt-4">
              <ExpandableSection
                title="Full Conversation"
                icon={<MessageSquare className="h-4 w-4 text-primary" />}
                expanded={conversationExpanded}
                onToggle={() => setConversationExpanded(!conversationExpanded)}
                count={messages.length}
              >
                <div className="max-h-96 space-y-3 overflow-y-auto rounded-lg border border-border bg-gray-50 p-4">
                  {messages.map((msg, i) => {
                    const isAssistant = msg.role === 'assistant';
                    return (
                      <div
                        key={i}
                        className={cn('flex', isAssistant ? 'justify-start' : 'justify-end')}
                      >
                        <div
                          className={cn(
                            'max-w-[85%] rounded-xl px-4 py-2.5',
                            isAssistant ? 'bg-primary/10' : 'bg-[#1982FC] text-white'
                          )}
                        >
                          <p
                            className={cn(
                              'mb-1 text-[10px] font-semibold uppercase tracking-wider',
                              isAssistant ? 'text-primary' : 'text-white/70'
                            )}
                          >
                            {isAssistant
                              ? String(
                                  caseRecord.Agent_Name || caseRecord.source_name || 'Assistant'
                                )
                              : 'User'}
                          </p>
                          <div
                            className={cn(
                              'text-xs leading-relaxed',
                              isAssistant ? 'text-text-primary' : 'text-white'
                            )}
                          >
                            <SlackContent content={msg.content} darkBg={!isAssistant} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ExpandableSection>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ExpandableSection({
  title,
  icon,
  expanded,
  onToggle,
  children,
  count,
}: {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-100"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold text-text-primary">{title}</span>
          {count !== undefined && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {count}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn('h-4 w-4 text-text-muted transition-transform', expanded && 'rotate-180')}
        />
      </button>
      {expanded && <div className="mt-2">{children}</div>}
    </div>
  );
}

/**
 * Sanitize a string for JSON.parse by escaping control characters.
 */
function sanitizeForJson(str: string): string {
  return str.replace(/[\x00-\x1f]/g, (ch) => {
    if (ch === '\n') return '\\n';
    if (ch === '\r') return '\\r';
    if (ch === '\t') return '\\t';
    return '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
  });
}

/**
 * Regex-based Python-to-JSON fallback for when character-by-character parser fails.
 * Less accurate but handles more edge cases.
 */
function pythonToJsonRegex(s: string): string {
  // Replace Python keywords outside of strings (rough heuristic)
  let result = s;
  // Replace None/True/False that aren't inside quotes
  result = result.replace(/\bNone\b/g, 'null');
  result = result.replace(/\bTrue\b/g, 'true');
  result = result.replace(/\bFalse\b/g, 'false');
  result = result.replace(/\bnan\b/gi, 'null');
  // Replace single quotes with double quotes (naive — handles most cases)
  // This is a rough pass: replace ' with " when likely a string delimiter
  result = result.replace(/'/g, '"');
  return sanitizeForJson(result);
}

/**
 * Try to parse a string as JSON or Python dict. Returns parsed object or null.
 */
function tryParseStructured(raw: unknown): Record<string, unknown> | unknown[] | null {
  if (raw != null && typeof raw === 'object') {
    return raw as Record<string, unknown> | unknown[];
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;

  // Try JSON first
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // noop
  }

  // Try JSON with sanitized control characters
  try {
    const sanitized = sanitizeForJson(trimmed);
    const parsed = JSON.parse(sanitized);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // noop
  }

  // Try Python dict conversion (character-by-character parser)
  try {
    const converted = pythonToJson(trimmed);
    const parsed = JSON.parse(converted);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // noop
  }

  // Last resort: regex-based Python-to-JSON conversion
  try {
    const regexConverted = pythonToJsonRegex(trimmed);
    const parsed = JSON.parse(regexConverted);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // not parseable
  }

  return null;
}

function formatKeyLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSimpleValue(value: unknown, type: string): string {
  if (value == null) return '\u2014';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '\u2014';
  if (type === 'number') return Number(value).toLocaleString();
  return String(value);
}

/** Renders a single key-value entry in a structured dict display. */
function StructuredEntry({ label, value }: { label: string; value: unknown }) {
  // Nested dict/object
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <div className="rounded-md border border-border bg-gray-50/50 p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </div>
        <div className="space-y-1.5">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-start gap-2 text-xs">
              <span className="min-w-[80px] flex-shrink-0 font-medium text-text-muted">
                {formatKeyLabel(k)}:
              </span>
              <span className="text-text-primary">{formatSimpleValue(v, 'string')}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Array of items
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    // Array of objects: render each as structured
    if (typeof value[0] === 'object' && value[0] !== null) {
      return (
        <div className="rounded-md border border-border bg-gray-50/50 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            {label} ({value.length})
          </div>
          <div className="space-y-2">
            {value.map((item, i) => (
              <div key={i} className="border-border/50 rounded border bg-white p-2">
                {typeof item === 'object' && item !== null ? (
                  <div className="space-y-1">
                    {Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                      <div key={k} className="flex items-start gap-2 text-xs">
                        <span className="min-w-[80px] flex-shrink-0 font-medium text-text-muted">
                          {formatKeyLabel(k)}:
                        </span>
                        <span className="text-text-primary">{formatSimpleValue(v, 'string')}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-text-primary">{String(item)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }
    // Array of primitives
    return null; // Handled by simple path
  }

  return null;
}

/** Renders a signal value — structured display for dicts/objects, inline for primitives. */
function SignalValueDisplay({ value, type }: { value: unknown; type: string }) {
  // Try to parse structured data (objects, arrays, Python dict strings)
  const parsed = tryParseStructured(value);

  if (parsed && !Array.isArray(parsed)) {
    const entries = Object.entries(parsed);
    if (entries.length === 0) return <span className="text-text-muted">{'\u2014'}</span>;

    return (
      <div className="mt-1 space-y-2">
        {entries.map(([key, val]) => (
          <StructuredEntry key={key} label={formatKeyLabel(key)} value={val} />
        ))}
      </div>
    );
  }

  if (parsed && Array.isArray(parsed) && parsed.length > 0) {
    // Array of objects
    if (typeof parsed[0] === 'object' && parsed[0] !== null) {
      return (
        <div className="mt-1">
          <StructuredEntry label="Items" value={parsed} />
        </div>
      );
    }
  }

  // Simple values
  return <span>{formatSimpleValue(value, type)}</span>;
}

/** Check if a signal value is complex (dict/object/parseable string). */
function isComplexValue(value: unknown): boolean {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) return true;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.startsWith('{') && trimmed.length > 50;
  }
  return false;
}
