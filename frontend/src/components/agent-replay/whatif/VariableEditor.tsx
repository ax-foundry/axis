'use client';

import { ChevronDown, Play, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';
import { useReplayStore } from '@/stores/replay-store';

import type { OverridableField, StepFixture, WhatIfChatMessage } from '@/types/replay';

interface VariableEditorProps {
  fixture: StepFixture;
  onSimulate: () => void;
  isSimulating: boolean;
}

export function VariableEditor({ fixture, onSimulate, isSimulating }: VariableEditorProps) {
  const { whatIf, setWhatIfOverride, setWhatIfPromptMessages, resetWhatIfOverrides } =
    useReplayStore();

  const [promptOpen, setPromptOpen] = useState(false);

  const variableFields = fixture.overridable_fields.filter((f) => f.category === 'variable');

  const getEffectiveValue = (field: OverridableField): unknown => {
    return (whatIf.overrides[field.key] as string) ?? field.current_value;
  };

  const handlePromptChange = (index: number, content: string) => {
    const msgs: WhatIfChatMessage[] = (
      whatIf.promptMessagesOverride ?? fixture.prompt_messages
    ).map((m, i) => (i === index ? { ...m, content } : { ...m }));
    setWhatIfPromptMessages(msgs);
  };

  const hasOverrides =
    whatIf.promptMessagesOverride !== null || Object.keys(whatIf.overrides).length > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {/* Model parameters (read-only from trace) */}
        {(fixture.model || fixture.temperature != null || fixture.max_tokens != null) && (
          <div>
            <h4 className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-primary-dark/60">
              Model Parameters
            </h4>
            <div className="flex flex-wrap gap-2">
              {fixture.model && (
                <span className="rounded-lg border border-primary/15 bg-primary/5 px-2.5 py-1 font-mono text-[11px] font-medium text-primary-dark">
                  {fixture.model}
                </span>
              )}
              {fixture.temperature != null && (
                <span className="rounded-lg border border-primary/15 bg-primary/5 px-2.5 py-1 font-mono text-[11px] font-medium text-primary-dark">
                  temp: {fixture.temperature}
                </span>
              )}
              {fixture.max_tokens != null && (
                <span className="rounded-lg border border-primary/15 bg-primary/5 px-2.5 py-1 font-mono text-[11px] font-medium text-primary-dark">
                  max_tokens: {fixture.max_tokens}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Variables */}
        {variableFields.length > 0 && (
          <div>
            <h4 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-primary-dark/60">
              Variables
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold text-primary">
                {variableFields.length}
              </span>
            </h4>
            <div className="space-y-4">
              {variableFields.map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={getEffectiveValue(field)}
                  onChange={(v) => setWhatIfOverride(field.key, v)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Prompt messages (collapsible) */}
        {fixture.prompt_messages.length > 0 && (
          <div>
            <button
              onClick={() => setPromptOpen(!promptOpen)}
              className="flex w-full items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary-dark/60 transition-colors hover:text-primary-dark"
            >
              <ChevronDown
                className={cn('h-3 w-3 transition-transform', !promptOpen && '-rotate-90')}
              />
              Prompt Messages
              <span className="rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold text-primary">
                {fixture.prompt_messages.length}
              </span>
            </button>
            {promptOpen && (
              <div className="mt-3 space-y-2">
                {(whatIf.promptMessagesOverride ?? fixture.prompt_messages).map((msg, idx) => (
                  <div
                    key={idx}
                    className="overflow-hidden rounded-lg border border-primary/10 shadow-sm"
                  >
                    <div className="flex items-center gap-1.5 border-b border-primary/10 bg-primary/[0.03] px-2.5 py-1.5">
                      <span
                        className={cn(
                          'rounded px-1.5 py-px text-[9px] font-bold uppercase',
                          msg.role === 'system'
                            ? 'bg-purple-100 text-purple-700'
                            : msg.role === 'user'
                              ? 'bg-blue-100 text-blue-700'
                              : msg.role === 'assistant'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-gray-100 text-gray-700'
                        )}
                      >
                        {msg.role}
                      </span>
                    </div>
                    <textarea
                      value={msg.content}
                      onChange={(e) => handlePromptChange(idx, e.target.value)}
                      className="w-full resize-y border-0 bg-white px-2.5 py-2 font-mono text-[11px] leading-relaxed text-text-primary focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/20"
                      rows={Math.min(8, Math.max(2, msg.content.split('\n').length))}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 border-t border-primary/10 bg-primary/[0.02] px-4 py-3">
        {hasOverrides && (
          <button
            onClick={resetWhatIfOverrides}
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        )}
        <button
          onClick={onSimulate}
          disabled={isSimulating}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-primary-dark px-5 py-2 text-xs font-bold text-white shadow-md shadow-primary/25 transition-all hover:shadow-lg hover:shadow-primary/30 hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
        >
          <Play className="h-3 w-3" />
          {isSimulating ? 'Simulating...' : 'Simulate'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field input renderer
// ---------------------------------------------------------------------------

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: OverridableField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const stringValue = value != null ? String(value) : '';

  switch (field.field_type) {
    case 'select':
      return (
        <div className="rounded-lg border-l-[3px] border-l-primary/40 pl-3">
          <label className="mb-1.5 block text-[11px] font-semibold text-text-primary">
            {field.label}
          </label>
          <select
            value={stringValue}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-primary/15 bg-white px-2.5 py-2 text-xs text-text-primary shadow-sm transition-colors focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15"
          >
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );

    case 'slider':
      return (
        <div className="rounded-lg border-l-[3px] border-l-primary/40 pl-3">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[11px] font-semibold text-text-primary">{field.label}</label>
            <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-bold text-primary">
              {stringValue}
            </span>
          </div>
          <input
            type="range"
            min={field.min ?? 0}
            max={field.max ?? 1}
            step={field.step ?? 0.1}
            value={Number(value ?? 0)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
      );

    case 'number':
      return (
        <div className="rounded-lg border-l-[3px] border-l-primary/40 pl-3">
          <label className="mb-1.5 block text-[11px] font-semibold text-text-primary">
            {field.label}
          </label>
          <input
            type="number"
            value={stringValue}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-primary/15 bg-white px-2.5 py-2 font-mono text-xs text-text-primary shadow-sm transition-colors focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </div>
      );

    case 'textarea':
      return (
        <div className="rounded-lg border-l-[3px] border-l-primary/40 pl-3">
          <label className="mb-1.5 block text-[11px] font-semibold text-text-primary">
            {field.label}
          </label>
          <textarea
            value={stringValue}
            onChange={(e) => onChange(e.target.value)}
            rows={5}
            className="w-full resize-y rounded-lg border border-primary/15 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-text-primary shadow-sm transition-colors focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </div>
      );

    default:
      return (
        <div className="rounded-lg border-l-[3px] border-l-primary/40 pl-3">
          <label className="mb-1.5 block text-[11px] font-semibold text-text-primary">
            {field.label}
          </label>
          <input
            type="text"
            value={stringValue}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-primary/15 bg-white px-2.5 py-2 text-xs text-text-primary shadow-sm transition-colors focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </div>
      );
  }
}
