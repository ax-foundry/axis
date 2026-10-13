// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchApi } from '@/lib/api';

import SourceScorecardPage from './page';
let view = 'overview';
let lookback = '7';

vi.mock('next/navigation', () => ({
  useParams: () => ({ name: 'fixture' }),
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'view' ? view : lookback) }),
}));

vi.mock('@/lib/api', () => ({ fetchApi: vi.fn() }));

const mockFetchApi = vi.mocked(fetchApi);
const row = {
  metric_key: 'throughput',
  label: 'Throughput',
  value: 1,
  status: 'available',
  availability_reason: null,
  cohort: 'instrumented',
  instrumentation_horizon: 'fully_instrumented',
};

describe('SourceScorecardPage', () => {
  beforeEach(() => {
    view = 'overview';
    lookback = '7';
    mockFetchApi.mockReset();
  });

  afterEach(cleanup);

  it('keeps the current view response and reuses its lookback for contributors', async () => {
    let resolveOverview!: (value: { rows: (typeof row)[] }) => void;
    let resolveFlow!: (value: { rows: (typeof row)[] }) => void;
    mockFetchApi
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveOverview = resolve as typeof resolveOverview))
      )
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFlow = resolve as typeof resolveFlow))
      );

    const { rerender } = render(<SourceScorecardPage />);
    await waitFor(() => expect(mockFetchApi).toHaveBeenCalledTimes(1));

    view = 'flow';
    rerender(<SourceScorecardPage />);
    await waitFor(() => expect(mockFetchApi).toHaveBeenCalledTimes(2));

    resolveFlow({ rows: [{ ...row, label: 'Flow throughput' }] });
    resolveOverview({ rows: [{ ...row, label: 'Overview throughput' }] });
    expect(await screen.findByText('Flow throughput')).toBeTruthy();
    expect(screen.queryByText('Overview throughput')).toBeNull();

    mockFetchApi.mockResolvedValueOnce({ rows: [{ work_item_id: 'work-1' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Contributors' }));
    await waitFor(() => expect(mockFetchApi).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(mockFetchApi.mock.calls[2][1]?.body))).toMatchObject({
      metric_key: 'throughput',
      lookback_days: 7,
    });
  });

  it('clears contributors when the view changes and renders contributor errors', async () => {
    mockFetchApi.mockResolvedValue({ rows: [] }).mockResolvedValueOnce({ rows: [row] });
    const { rerender } = render(<SourceScorecardPage />);
    expect(await screen.findByRole('button', { name: 'Contributors' })).toBeTruthy();

    mockFetchApi.mockResolvedValueOnce({ rows: [{ work_item_id: 'work-1' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Contributors' }));
    expect(await screen.findByText(/work-1/)).toBeTruthy();

    view = 'flow';
    rerender(<SourceScorecardPage />);
    await waitFor(() => expect(screen.queryByLabelText('Throughput contributors')).toBeNull());
  });

  it('renders contributor request failures', async () => {
    mockFetchApi
      .mockResolvedValueOnce({ rows: [row] })
      .mockRejectedValueOnce(new Error('backend down'));
    render(<SourceScorecardPage />);
    expect(await screen.findByRole('button', { name: 'Contributors' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Contributors' }));
    expect(await screen.findByText('Contributor query error: backend down')).toBeTruthy();
  });
});
