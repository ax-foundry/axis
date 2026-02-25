import type { Thought, SSEEventType, ReportRequest, ReportResponse, InsightResult } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8500';

export interface SSEHandlers {
  onThought?: (thought: Thought) => void;
  onResponse?: (data: { success: boolean; response: string; thoughts_count: number }) => void;
  onError?: (error: { error: string }) => void;
  onDone?: () => void;
}

export interface CopilotStreamOptions {
  message: string;
  dataContext?: {
    format: string | null;
    row_count: number;
    metric_columns: string[];
    columns: string[];
  };
  data?: Record<string, unknown>[];
}

/**
 * Create an SSE connection to the copilot streaming endpoint.
 *
 * Uses fetch with ReadableStream since EventSource doesn't support POST.
 *
 * @param options - Stream options including message and data context
 * @param handlers - Event handlers for different SSE events
 * @returns AbortController to cancel the stream
 */
export function createCopilotStream(
  options: CopilotStreamOptions,
  handlers: SSEHandlers
): AbortController {
  const controller = new AbortController();

  const streamData = async () => {
    try {
      console.log('[SSE] Starting stream to:', `${API_BASE_URL}/api/ai/copilot/stream`);
      console.log('[SSE] Options:', options);

      const response = await fetch(`${API_BASE_URL}/api/ai/copilot/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          message: options.message,
          data_context: options.dataContext,
          data: options.data,
        }),
        signal: controller.signal,
      });

      console.log('[SSE] Response status:', response.status);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error('[SSE] HTTP error:', response.status, error);
        handlers.onError?.({ error: error.detail || `HTTP error: ${response.status}` });
        handlers.onDone?.();
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        console.error('[SSE] No response body');
        handlers.onError?.({ error: 'No response body' });
        handlers.onDone?.();
        return;
      }

      console.log('[SSE] Got reader, starting to read chunks...');
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('[SSE] Stream done');
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        console.log('[SSE] Received chunk:', chunk.substring(0, 200));
        buffer += chunk;

        // Process complete SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        let currentEvent: string | null = null;
        let currentData = '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('event:')) {
            currentEvent = trimmedLine.slice(6).trim();
            console.log('[SSE] Got event:', currentEvent);
          } else if (trimmedLine.startsWith('data:')) {
            currentData = trimmedLine.slice(5).trim();
            console.log('[SSE] Got data:', currentData.substring(0, 100));
          } else if (trimmedLine === '' && currentEvent && currentData) {
            // End of event, process it
            console.log('[SSE] Processing event:', currentEvent);
            processSSEEvent(currentEvent as SSEEventType, currentData, handlers);
            currentEvent = null;
            currentData = '';
          }
        }

        // Also process if we have a complete event at end of chunk (no trailing empty line)
        if (currentEvent && currentData) {
          console.log('[SSE] Processing buffered event:', currentEvent);
          processSSEEvent(currentEvent as SSEEventType, currentData, handlers);
        }
      }

      console.log('[SSE] Calling onDone');
      handlers.onDone?.();
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // Stream was cancelled
        handlers.onDone?.();
        return;
      }

      console.error('SSE stream error:', error);
      handlers.onError?.({
        error: error instanceof Error ? error.message : 'Stream connection failed',
      });
      handlers.onDone?.();
    }
  };

  streamData();

  return controller;
}

/**
 * Process an SSE event and call the appropriate handler.
 */
function processSSEEvent(event: SSEEventType, data: string, handlers: SSEHandlers): void {
  console.log('[SSE] processSSEEvent:', event, data.substring(0, 100));
  try {
    const parsed = data ? JSON.parse(data) : {};
    console.log('[SSE] Parsed data:', parsed);

    switch (event) {
      case 'thought':
        console.log('[SSE] Calling onThought handler');
        handlers.onThought?.(parsed as Thought);
        break;
      case 'response':
        console.log('[SSE] Calling onResponse handler');
        handlers.onResponse?.(parsed);
        break;
      case 'error':
        console.log('[SSE] Calling onError handler');
        handlers.onError?.(parsed);
        break;
      case 'done':
        console.log('[SSE] Calling onDone handler');
        handlers.onDone?.();
        break;
      default:
        console.warn('[SSE] Unknown SSE event:', event);
    }
  } catch (error) {
    console.error('[SSE] Failed to parse SSE data:', data, error);
  }
}

/**
 * Fetch available copilot skills (non-streaming).
 */
export async function fetchCopilotSkills(): Promise<{
  success: boolean;
  skills: Array<{
    name: string;
    description: string;
    version: string;
    parameters: Array<{
      name: string;
      type: string;
      description: string | null;
      required: boolean;
      default: unknown;
    }>;
    tags: string[];
    enabled: boolean;
  }>;
  total: number;
}> {
  const response = await fetch(`${API_BASE_URL}/api/ai/copilot/skills`);

  if (!response.ok) {
    throw new Error(`Failed to fetch skills: ${response.status}`);
  }

  return response.json();
}

// ============================================
// Report Generation SSE Stream
// ============================================

export interface ReportSSEHandlers {
  onThought?: (thought: Thought) => void;
  onInsights?: (data: InsightResult) => void;
  onResponse?: (data: ReportResponse) => void;
  onError?: (error: { error: string }) => void;
  onDone?: () => void;
}

/**
 * Create an SSE connection to the report generation streaming endpoint.
 *
 * @param request - Report request parameters
 * @param handlers - Event handlers for different SSE events
 * @returns AbortController to cancel the stream
 */
export function createReportStream(
  request: ReportRequest,
  handlers: ReportSSEHandlers
): AbortController {
  const controller = new AbortController();

  const streamData = async () => {
    try {
      console.log(
        '[Report SSE] Starting stream to:',
        `${API_BASE_URL}/api/reports/generate/stream`
      );

      const response = await fetch(`${API_BASE_URL}/api/reports/generate/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      console.log('[Report SSE] Response status:', response.status);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error('[Report SSE] HTTP error:', response.status, error);
        handlers.onError?.({ error: error.detail || `HTTP error: ${response.status}` });
        handlers.onDone?.();
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        console.error('[Report SSE] No response body');
        handlers.onError?.({ error: 'No response body' });
        handlers.onDone?.();
        return;
      }

      console.log('[Report SSE] Got reader, starting to read chunks...');
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('[Report SSE] Stream done');
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent: string | null = null;
        let currentData = '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('event:')) {
            currentEvent = trimmedLine.slice(6).trim();
          } else if (trimmedLine.startsWith('data:')) {
            currentData = trimmedLine.slice(5).trim();
          } else if (trimmedLine === '' && currentEvent && currentData) {
            processReportSSEEvent(currentEvent as SSEEventType, currentData, handlers);
            currentEvent = null;
            currentData = '';
          }
        }

        if (currentEvent && currentData) {
          processReportSSEEvent(currentEvent as SSEEventType, currentData, handlers);
        }
      }

      handlers.onDone?.();
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        handlers.onDone?.();
        return;
      }

      console.error('[Report SSE] Stream error:', error);
      handlers.onError?.({
        error: error instanceof Error ? error.message : 'Stream connection failed',
      });
      handlers.onDone?.();
    }
  };

  streamData();

  return controller;
}

/**
 * Process a report SSE event and call the appropriate handler.
 */
function processReportSSEEvent(
  event: SSEEventType,
  data: string,
  handlers: ReportSSEHandlers
): void {
  try {
    const parsed = data ? JSON.parse(data) : {};

    switch (event) {
      case 'thought':
        handlers.onThought?.(parsed as Thought);
        break;
      case 'insights':
        handlers.onInsights?.(parsed as InsightResult);
        break;
      case 'response':
        handlers.onResponse?.(parsed as ReportResponse);
        break;
      case 'error':
        handlers.onError?.(parsed);
        break;
      case 'done':
        handlers.onDone?.();
        break;
      default:
        console.warn('[Report SSE] Unknown event:', event);
    }
  } catch (error) {
    console.error('[Report SSE] Failed to parse data:', data, error);
  }
}
