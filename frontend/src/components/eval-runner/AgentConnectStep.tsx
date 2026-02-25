'use client';

import {
  Database,
  Bot,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';
import { useState } from 'react';

import { evalRunnerTestConnection } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useEvalRunnerStore } from '@/stores';

import type { AgentType, LLMProvider } from '@/types';

const AGENT_OPTIONS: Array<{
  type: AgentType;
  label: string;
  description: string;
  icon: typeof Database;
}> = [
  {
    type: 'none',
    label: 'Use outputs from dataset',
    description: 'Your dataset already has actual_output - use that for evaluation',
    icon: Database,
  },
  {
    type: 'api',
    label: 'Connect to Agent API',
    description: 'Call an external API with each query to generate outputs',
    icon: Bot,
  },
  {
    type: 'prompt',
    label: 'Use Prompt Template',
    description: 'Use an LLM with a prompt template to generate outputs',
    icon: MessageSquare,
  },
];

const MODEL_OPTIONS = [
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'openai' as LLMProvider },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai' as LLMProvider },
  {
    value: 'claude-3-5-sonnet-20241022',
    label: 'Claude 3.5 Sonnet',
    provider: 'anthropic' as LLMProvider,
  },
  {
    value: 'claude-3-5-haiku-20241022',
    label: 'Claude 3.5 Haiku',
    provider: 'anthropic' as LLMProvider,
  },
];

export function AgentConnectStep() {
  const {
    agentConfig,
    agentTestResult,
    columnMapping,
    uploadedData,
    setAgentConfig,
    setAgentTestResult,
    setCurrentStep,
  } = useEvalRunnerStore();

  const [isTesting, setIsTesting] = useState(false);

  // Form state for API config
  const [apiEndpoint, setApiEndpoint] = useState(agentConfig.api_config?.endpoint_url ?? '');
  const [apiHeaders, setApiHeaders] = useState(
    JSON.stringify(agentConfig.api_config?.headers ?? {}, null, 2)
  );
  const [apiRequestTemplate, setApiRequestTemplate] = useState(
    agentConfig.api_config?.request_template ?? '{"message": "{{query}}"}'
  );
  const [apiResponsePath, setApiResponsePath] = useState(
    agentConfig.api_config?.response_path ?? '.response'
  );

  // Form state for prompt config
  const [promptModel, setPromptModel] = useState(agentConfig.prompt_config?.model ?? 'gpt-4o');
  const [promptProvider, setPromptProvider] = useState<LLMProvider>(
    agentConfig.prompt_config?.provider ?? 'openai'
  );
  const [promptSystem, setPromptSystem] = useState(
    agentConfig.prompt_config?.system_prompt ?? 'You are a helpful assistant.'
  );
  const [promptUser, setPromptUser] = useState(
    agentConfig.prompt_config?.user_prompt_template ?? '{{query}}'
  );

  const handleTypeChange = (type: AgentType) => {
    setAgentConfig({ type });
    setAgentTestResult(null);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setAgentTestResult(null);

    // Build config based on type
    const config = { ...agentConfig };
    if (config.type === 'api') {
      let headers: Record<string, string> = {};
      try {
        headers = JSON.parse(apiHeaders);
      } catch {
        headers = {};
      }
      config.api_config = {
        endpoint_url: apiEndpoint,
        headers,
        request_template: apiRequestTemplate,
        response_path: apiResponsePath,
      };
    } else if (config.type === 'prompt') {
      config.prompt_config = {
        model: promptModel,
        provider: promptProvider,
        system_prompt: promptSystem,
        user_prompt_template: promptUser,
      };
    }

    // Save config
    setAgentConfig(config);

    // Test connection
    try {
      const sampleQuery =
        (uploadedData?.[0]?.[columnMapping.query] as string) ?? 'Hello, how are you?';
      const result = await evalRunnerTestConnection(config, sampleQuery);
      setAgentTestResult({
        success: result.success,
        output: result.sample_output ?? undefined,
        error: result.error ?? undefined,
        latency: result.latency_ms ?? undefined,
      });
    } catch (error) {
      setAgentTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Test failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleContinue = () => {
    // Save final config
    if (agentConfig.type === 'api') {
      let headers: Record<string, string> = {};
      try {
        headers = JSON.parse(apiHeaders);
      } catch {
        headers = {};
      }
      setAgentConfig({
        api_config: {
          endpoint_url: apiEndpoint,
          headers,
          request_template: apiRequestTemplate,
          response_path: apiResponsePath,
        },
      });
    } else if (agentConfig.type === 'prompt') {
      setAgentConfig({
        prompt_config: {
          model: promptModel,
          provider: promptProvider,
          system_prompt: promptSystem,
          user_prompt_template: promptUser,
        },
      });
    }

    setCurrentStep('metrics');
  };

  const canContinue =
    agentConfig.type === 'none' ||
    (agentConfig.type === 'api' && apiEndpoint.length > 0) ||
    (agentConfig.type === 'prompt' && promptModel.length > 0);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="mb-2 text-xl font-semibold text-text-primary">Connect Agent (Optional)</h2>
        <p className="text-text-muted">
          Choose how to generate outputs for evaluation. Skip if your dataset already has
          actual_output.
        </p>
      </div>

      {/* Agent Type Selection */}
      <div className="space-y-3">
        {AGENT_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = agentConfig.type === option.type;

          return (
            <div key={option.type}>
              <button
                onClick={() => handleTypeChange(option.type)}
                className={cn(
                  'w-full rounded-lg border p-4 text-left transition-colors',
                  isSelected
                    ? 'border-primary bg-primary-pale'
                    : 'border-border hover:border-primary hover:bg-gray-50'
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full border-2',
                      isSelected ? 'border-primary bg-primary' : 'border-text-muted'
                    )}
                  >
                    {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                  </div>
                  <Icon
                    className={cn('h-5 w-5', isSelected ? 'text-primary' : 'text-text-muted')}
                  />
                  <div>
                    <p className="font-medium text-text-primary">{option.label}</p>
                    <p className="text-sm text-text-muted">{option.description}</p>
                  </div>
                </div>
              </button>

              {/* API Configuration */}
              {isSelected && option.type === 'api' && (
                <div className="ml-8 mt-4 space-y-4 rounded-lg border border-border p-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text-primary">
                      Endpoint URL
                    </label>
                    <input
                      type="url"
                      value={apiEndpoint}
                      onChange={(e) => setApiEndpoint(e.target.value)}
                      placeholder="https://api.example.com/chat"
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text-primary">
                      Headers (JSON)
                    </label>
                    <textarea
                      value={apiHeaders}
                      onChange={(e) => setApiHeaders(e.target.value)}
                      placeholder='{"Authorization": "Bearer xxx"}'
                      rows={3}
                      className="w-full rounded-lg border border-border px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text-primary">
                      Request Body Template
                    </label>
                    <input
                      type="text"
                      value={apiRequestTemplate}
                      onChange={(e) => setApiRequestTemplate(e.target.value)}
                      placeholder='{"message": "{{query}}"}'
                      className="w-full rounded-lg border border-border px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <p className="mt-1 text-xs text-text-muted">
                      Use {'{{query}}'} as placeholder for the query value
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text-primary">
                      Response Path
                    </label>
                    <input
                      type="text"
                      value={apiResponsePath}
                      onChange={(e) => setApiResponsePath(e.target.value)}
                      placeholder=".response.content"
                      className="w-full rounded-lg border border-border px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <p className="mt-1 text-xs text-text-muted">
                      JSON path to extract the response (e.g., .data.message)
                    </p>
                  </div>
                  <button
                    onClick={handleTestConnection}
                    disabled={isTesting || !apiEndpoint}
                    className="flex items-center gap-2 rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary-pale disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test Connection'}
                  </button>
                </div>
              )}

              {/* Prompt Configuration */}
              {isSelected && option.type === 'prompt' && (
                <div className="ml-8 mt-4 space-y-4 rounded-lg border border-border p-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text-primary">
                      Model
                    </label>
                    <select
                      value={promptModel}
                      onChange={(e) => {
                        const selected = MODEL_OPTIONS.find((m) => m.value === e.target.value);
                        setPromptModel(e.target.value);
                        if (selected) setPromptProvider(selected.provider);
                      }}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {MODEL_OPTIONS.map((model) => (
                        <option key={model.value} value={model.value}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text-primary">
                      System Prompt
                    </label>
                    <textarea
                      value={promptSystem}
                      onChange={(e) => setPromptSystem(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text-primary">
                      User Prompt Template
                    </label>
                    <textarea
                      value={promptUser}
                      onChange={(e) => setPromptUser(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <p className="mt-1 text-xs text-text-muted">
                      Use {'{{query}}'} as placeholder for the query value
                    </p>
                  </div>
                  <button
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="flex items-center gap-2 rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary-pale disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test Prompt'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Test Result */}
      {agentTestResult && (
        <div
          className={cn('rounded-lg p-4', agentTestResult.success ? 'bg-green-50' : 'bg-red-50')}
        >
          <div className="flex items-center gap-2">
            {agentTestResult.success ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600" />
            )}
            <span
              className={cn(
                'font-medium',
                agentTestResult.success ? 'text-green-700' : 'text-red-700'
              )}
            >
              {agentTestResult.success ? 'Connection successful!' : 'Connection failed'}
            </span>
            {agentTestResult.latency && (
              <span className="text-sm text-text-muted">
                ({agentTestResult.latency.toFixed(0)}ms)
              </span>
            )}
          </div>
          {agentTestResult.output && (
            <div className="mt-2">
              <p className="text-sm font-medium text-text-secondary">Sample Output:</p>
              <p className="mt-1 rounded bg-white p-2 text-sm text-text-primary">
                {agentTestResult.output}
              </p>
            </div>
          )}
          {agentTestResult.error && (
            <p className="mt-2 text-sm text-red-600">{agentTestResult.error}</p>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setCurrentStep('upload')}
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-gray-50"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <button
          onClick={handleContinue}
          disabled={!canContinue}
          className={cn(
            'flex items-center gap-2 rounded-lg px-6 py-2 font-medium transition-colors',
            canContinue
              ? 'bg-primary text-white hover:bg-primary-dark'
              : 'cursor-not-allowed bg-gray-200 text-gray-500'
          )}
        >
          Continue to Metrics
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
