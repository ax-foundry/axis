// @vitest-environment jsdom
/**
 * Tests for the segment-comparison header label.
 *
 * The header is the only place the UI states how the bars were aggregated, and
 * it used to be a two-way ternary: `aggregation === 'sum' ? 'Total count' :
 * 'Average value'`. When the backend gained a third aggregation — 'weighted',
 * a call-weighted mean — it fell through to the else branch and the chart
 * announced "Average value", which is the exact claim the weighting exists to
 * stop the dashboard from making. Nothing caught it: the response has no
 * runtime validation, and the TS union was stale.
 *
 * These pin one label per aggregation, and that the map covers the union.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { KPISegmentComparisonChart } from '@/components/production/kpi/KPISegmentComparisonChart';

import type { KpiSegmentComparisonResponse } from '@/types';

vi.mock('@/components/charts/plotly-chart', () => ({
  PlotlyChart: () => <div data-testid="plotly" />,
}));

vi.mock('@/lib/theme', () => ({
  useColors: () => ({ primary: '#3b82f6', primaryDark: '#1d4ed8' }),
}));

vi.mock('@/stores', () => ({
  useKpiStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ setDrillDownSegment: vi.fn(), setDrillDownOpen: vi.fn() }),
}));

const { useKpiSegmentComparison } = vi.hoisted(() => ({
  useKpiSegmentComparison: vi.fn(),
}));

vi.mock('@/lib/hooks/useKpiData', () => ({ useKpiSegmentComparison }));

function renderWith(aggregation: KpiSegmentComparisonResponse['aggregation']) {
  const data: KpiSegmentComparisonResponse = {
    success: true,
    kpi_name: 'tool_success_rate_by_name',
    unit: 'percent',
    aggregation,
    segment_visual_order: 'highest_top',
    segments: [
      { segment: 'search_docs', agg_value: 0.946, count: 78093, conflict_pairs: 0 },
      { segment: 'get_quote', agg_value: 0.908, count: 4313, conflict_pairs: 0 },
    ],
  };
  useKpiSegmentComparison.mockReturnValue({ data, isLoading: false });
  render(
    <KPISegmentComparisonChart
      kpiName="tool_success_rate_by_name"
      displayName="Tool Success Rate"
      unit="percent"
    />
  );
}

describe('KPISegmentComparisonChart header label', () => {
  it('calls a weighted aggregation call-weighted, not an average', () => {
    renderWith('weighted');
    expect(screen.getByText('Call-weighted average per segment')).toBeDefined();
    // The regression this file exists for.
    expect(screen.queryByText('Average value per segment')).toBeNull();
  });

  it('still labels plain averages and sums as before', () => {
    renderWith('avg');
    expect(screen.getByText('Average value per segment')).toBeDefined();

    renderWith('sum');
    expect(screen.getByText('Total count per segment')).toBeDefined();
  });

  it('renders a distinct label for every aggregation the API can return', () => {
    // Guards against two aggregations collapsing onto one string, which would
    // make the header technically present but useless for telling them apart.
    const aggregations: KpiSegmentComparisonResponse['aggregation'][] = ['avg', 'sum', 'weighted'];
    const labels = aggregations.map((a) => {
      renderWith(a);
      const el = screen.getAllByText(/ per segment$/).at(-1);
      return el?.textContent ?? '';
    });
    expect(new Set(labels).size).toBe(aggregations.length);
  });
});
