import { describe, expect, it } from 'vitest';

import { computeKPIs } from '@/lib/human-signals-utils';

import type { SignalsCaseRecord, SignalsKPIConfig } from '@/types';

const signalKey = 'quality__approved';

const percentKPI: SignalsKPIConfig = {
  metric: 'quality',
  signal: 'approved',
  label: 'Approval Rate',
  format: 'percent',
  icon: 'check',
};

function makeCase(
  id: string,
  timestamp: string,
  signals: Record<string, unknown> = {}
): SignalsCaseRecord {
  return {
    Case_ID: id,
    Business: 'test',
    Message_Count: 1,
    Timestamp: timestamp,
    ...signals,
  };
}

describe('computeKPIs', () => {
  it('renders a truthiness KPI with an absent column as not applicable', () => {
    const cases = [makeCase('1', '2024-01-01T12:00:00Z'), makeCase('2', '2024-01-02T12:00:00Z')];

    const [result] = computeKPIs(cases, [percentKPI]);

    expect(result.value).toBe('—');
    expect(result.rawValue).toBeUndefined();
    expect(result.sparkline).toBeUndefined();
  });

  it.each([
    ['null', null],
    ['empty string', ''],
    ['whitespace string', '   '],
  ])('renders a truthiness KPI with only %s values as not applicable', (_, value) => {
    const cases = [
      makeCase('1', '2024-01-01T12:00:00Z', { [signalKey]: value }),
      makeCase('2', '2024-01-02T12:00:00Z', { [signalKey]: value }),
    ];

    const [result] = computeKPIs(cases, [percentKPI]);

    expect(result.value).toBe('—');
    expect(result.rawValue).toBeUndefined();
    expect(result.sparkline).toBeUndefined();
  });

  it('keeps false-like present values as a measured zero', () => {
    const cases = [
      makeCase('1', '2024-01-01T12:00:00Z', { [signalKey]: false }),
      makeCase('2', '2024-01-02T12:00:00Z', { [signalKey]: 'False' }),
      makeCase('3', '2024-01-03T12:00:00Z', { [signalKey]: 0 }),
    ];

    const [result] = computeKPIs(cases, [percentKPI]);

    expect(result.value).toBe('0.0%');
    expect(result.rawValue).toBe(0);
  });

  it('keeps total cases as the denominator when some values are absent', () => {
    const cases = [
      makeCase('1', '2024-01-01T12:00:00Z', { [signalKey]: true }),
      makeCase('2', '2024-01-02T12:00:00Z', { [signalKey]: true }),
      makeCase('3', '2024-01-03T12:00:00Z', { [signalKey]: false }),
      makeCase('4', '2024-01-04T12:00:00Z'),
    ];

    const [result] = computeKPIs(cases, [percentKPI]);

    expect(result.value).toBe('50.0%');
    expect(result.rawValue).toBe(50);
  });

  it('distinguishes absent and measured-zero match-value KPIs', () => {
    const matchKPI: SignalsKPIConfig = {
      ...percentKPI,
      signal: 'outcome',
      match_value: 'approved',
    };
    const key = 'quality__outcome';
    const absentCases = [makeCase('1', '2024-01-01T12:00:00Z')];
    const measuredCases = [
      makeCase('1', '2024-01-01T12:00:00Z', { [key]: 'denied' }),
      makeCase('2', '2024-01-02T12:00:00Z', { [key]: 'pending' }),
    ];

    expect(computeKPIs(absentCases, [matchKPI])[0].value).toBe('—');
    const [measuredResult] = computeKPIs(measuredCases, [matchKPI]);
    expect(measuredResult.value).toBe('0.0%');
    expect(measuredResult.rawValue).toBe(0);
  });

  it('aggregates only present finite numeric values', () => {
    const numericKPI: SignalsKPIConfig = {
      metric: 'quality',
      signal: 'score',
      aggregation: 'mean',
      label: 'Mean Score',
      icon: 'gauge',
    };
    const key = 'quality__score';
    const absentCases = [
      makeCase('1', '2024-01-01T12:00:00Z', { [key]: null }),
      makeCase('2', '2024-01-02T12:00:00Z', { [key]: '' }),
    ];
    const mixedCases = [
      makeCase('1', '2024-01-01T12:00:00Z', { [key]: null }),
      makeCase('2', '2024-01-02T12:00:00Z', { [key]: '' }),
      makeCase('3', '2024-01-03T12:00:00Z', { [key]: 'abc' }),
      makeCase('4', '2024-01-04T12:00:00Z', { [key]: 4 }),
      makeCase('5', '2024-01-05T12:00:00Z', { [key]: 6 }),
    ];
    const zeroCases = [
      makeCase('1', '2024-01-01T12:00:00Z', { [key]: 0 }),
      makeCase('2', '2024-01-02T12:00:00Z', { [key]: 0 }),
    ];

    const [absentResult] = computeKPIs(absentCases, [numericKPI]);
    expect(absentResult.value).toBe('—');
    expect(absentResult.rawValue).toBeUndefined();
    expect(absentResult.sparkline).toBeUndefined();

    const [mixedResult] = computeKPIs(mixedCases, [numericKPI]);
    expect(mixedResult.value).toBe('5');
    expect(mixedResult.rawValue).toBe(5);

    const [zeroResult] = computeKPIs(zeroCases, [numericKPI]);
    expect(zeroResult.value).toBe('0');
    expect(zeroResult.rawValue).toBe(0);
  });

  it('omits numeric sparkline weeks where present values are all non-numeric', () => {
    const numericKPI: SignalsKPIConfig = {
      metric: 'quality',
      signal: 'score',
      aggregation: 'mean',
      label: 'Mean Score',
      icon: 'gauge',
    };
    const key = 'quality__score';
    const cases = [
      makeCase('1', '2024-01-01T12:00:00Z', { [key]: 'abc' }),
      makeCase('2', '2024-01-02T12:00:00Z', { [key]: 'abc' }),
      makeCase('3', '2024-01-08T12:00:00Z', { [key]: 4 }),
      makeCase('4', '2024-01-09T12:00:00Z', { [key]: 6 }),
    ];

    const [result] = computeKPIs(cases, [numericKPI]);

    expect(result.sparkline).toEqual([{ date: '2024-01-08', value: 5 }]);
  });

  it('omits sparkline weeks where the signal is absent from every case', () => {
    const cases = [
      makeCase('1', '2024-01-01T12:00:00Z'),
      makeCase('2', '2024-01-02T12:00:00Z', { [signalKey]: null }),
      makeCase('3', '2024-01-08T12:00:00Z', { [signalKey]: true }),
      makeCase('4', '2024-01-09T12:00:00Z', { [signalKey]: false }),
    ];

    const [result] = computeKPIs(cases, [percentKPI]);

    expect(result.sparkline).toEqual([{ date: '2024-01-08', value: 50 }]);
  });

  it('leaves total_cases aggregation unaffected', () => {
    const cases = [
      makeCase('1', '2024-01-01T12:00:00Z'),
      makeCase('2', '2024-01-02T12:00:00Z'),
      makeCase('3', '2024-01-03T12:00:00Z'),
    ];
    const totalCasesKPI: SignalsKPIConfig = {
      aggregate: 'total_cases',
      label: 'Total Cases',
      icon: 'hash',
    };

    const [result] = computeKPIs(cases, [totalCasesKPI]);

    expect(result.value).toBe('3');
    expect(result.rawValue).toBe(3);
    expect(result.totalCases).toBe(3);
  });
});
