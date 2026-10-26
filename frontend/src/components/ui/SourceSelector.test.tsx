// @vitest-environment jsdom
/**
 * With many agents the tab row must scroll horizontally instead of growing
 * past the page, and each tab must keep its width rather than shrink.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SourceSelector } from '@/components/ui/SourceSelector';

const { names, noop } = vi.hoisted(() => ({
  names: Array.from({ length: 30 }, (_, i) => `agent_${i}`),
  noop: () => {},
}));

vi.mock('@/config/agents', () => ({
  getAgentConfig: () => undefined,
  getAgentRegistry: () => [],
}));

vi.mock('@/stores', () => {
  const state = {
    availableSourceNames: names,
    selectedSourceName: 'agent_29',
    setSelectedSourceName: noop,
  };
  const useStore = (sel: (s: typeof state) => unknown) => sel(state);
  return { useMonitoringStore: useStore, useHumanSignalsStore: useStore, useKpiStore: useStore };
});

describe('SourceSelector overflow', () => {
  afterEach(cleanup);

  it('scrolls horizontally and keeps tabs from shrinking', () => {
    render(<SourceSelector scope={['kpi']} />);
    const tab = screen.getByRole('button', { name: /agent_0/ });
    expect(tab.className).toContain('flex-shrink-0');
    expect(tab.className).toContain('whitespace-nowrap');
    expect(tab.parentElement?.className).toContain('overflow-x-auto');
  });

  it('marks only the selected tab as current', () => {
    render(<SourceSelector scope={['kpi']} />);
    const current = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-current') === 'true');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain('agent_29');
  });
});
