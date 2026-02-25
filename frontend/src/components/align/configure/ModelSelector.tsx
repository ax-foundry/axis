'use client';

import { Bot, AlertCircle, Check, ChevronDown } from 'lucide-react';
import { useMemo } from 'react';

import { useAlignModels, useAlignStatus } from '@/lib/hooks';
import { cn } from '@/lib/utils';

import type { LLMProvider } from '@/types';

interface ModelSelectorProps {
  selectedModel: string;
  selectedProvider: LLMProvider;
  onModelChange: (model: string, provider: LLMProvider) => void;
}

export function ModelSelector({
  selectedModel,
  selectedProvider,
  onModelChange,
}: ModelSelectorProps) {
  const { data: modelsData, isLoading: modelsLoading } = useAlignModels();
  const { data: statusData } = useAlignStatus();

  const modelsByProvider = useMemo(() => {
    if (!modelsData?.models) return { openai: [], anthropic: [] };

    const grouped: Record<LLMProvider, typeof modelsData.models> = {
      openai: [],
      anthropic: [],
    };

    modelsData.models.forEach((model) => {
      grouped[model.provider].push(model);
    });

    return grouped;
  }, [modelsData]);

  const providers: Array<{
    id: LLMProvider;
    name: string;
    configured: boolean;
  }> = [
    {
      id: 'openai',
      name: 'OpenAI',
      configured: statusData?.providers.openai ?? false,
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      configured: statusData?.providers.anthropic ?? false,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-primary" />
        <h3 className="font-medium text-text-primary">Select Model</h3>
      </div>

      {/* Provider and Model Selection Row */}
      <div className="flex items-center gap-3">
        {/* Provider Dropdown */}
        <div className="relative">
          <select
            value={selectedProvider}
            onChange={(e) => {
              const newProvider = e.target.value as LLMProvider;
              const providerConfig = providers.find((p) => p.id === newProvider);
              if (providerConfig?.configured) {
                const firstModel = modelsByProvider[newProvider][0];
                if (firstModel) {
                  onModelChange(firstModel.id, newProvider);
                }
              }
            }}
            className={cn(
              'appearance-none rounded-lg border bg-white py-2 pl-3 pr-8 text-sm font-medium transition-all',
              'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
              statusData?.providers[selectedProvider]
                ? 'border-border text-text-primary'
                : 'border-warning/50 text-warning'
            )}
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id} disabled={!provider.configured}>
                {provider.name} {!provider.configured && '(not configured)'}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        </div>

        {/* Model Dropdown */}
        <div className="relative flex-1">
          {modelsLoading ? (
            <div className="rounded-lg border border-border bg-gray-50 px-3 py-2 text-sm text-text-muted">
              Loading models...
            </div>
          ) : (
            <>
              <select
                value={selectedModel}
                onChange={(e) => onModelChange(e.target.value, selectedProvider)}
                disabled={!statusData?.providers[selectedProvider]}
                className={cn(
                  'w-full appearance-none rounded-lg border bg-white py-2 pl-3 pr-8 text-sm transition-all',
                  'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
                  statusData?.providers[selectedProvider]
                    ? 'border-border text-text-primary'
                    : 'cursor-not-allowed border-border bg-gray-50 text-text-muted'
                )}
              >
                {modelsByProvider[selectedProvider].map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({(model.context_window / 1000).toFixed(0)}k)
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            </>
          )}
        </div>

        {/* Status indicator */}
        {statusData?.providers[selectedProvider] ? (
          <div className="flex items-center gap-1 text-sm text-success">
            <Check className="h-4 w-4" />
          </div>
        ) : (
          <div className="flex items-center gap-1 text-sm text-warning">
            <AlertCircle className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* Not Configured Warning */}
      {!statusData?.providers[selectedProvider] && (
        <div className="border-warning/20 bg-warning/10 rounded-lg border p-3">
          <div className="flex gap-2">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-warning" />
            <div className="text-sm">
              <p className="font-medium text-text-primary">
                {selectedProvider === 'openai' ? 'OpenAI' : 'Anthropic'} API not configured
              </p>
              <p className="text-text-muted">
                Set the{' '}
                <code className="rounded bg-white/50 px-1 py-0.5 font-mono text-xs">
                  {selectedProvider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'}
                </code>{' '}
                environment variable to enable this provider.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
