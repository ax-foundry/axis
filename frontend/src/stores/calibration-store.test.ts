import { beforeEach, describe, expect, it, vi } from 'vitest';

import { annotationsForRecords, useCalibrationStore } from '@/stores/calibration-store';
import { Columns } from '@/types';

import type { EvaluationRecord } from '@/types';

// The store persists to localStorage when it is created, so a working one must exist
// before the module loads; some Node versions define a global without the methods.
vi.hoisted(() => {
  const items = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    clear: () => items.clear(),
    key: (index: number) => Array.from(items.keys())[index] ?? null,
    get length() {
      return items.size;
    },
  };
});

function record(id: string): EvaluationRecord {
  return { [Columns.DATASET_ID]: id, [Columns.QUERY]: 'q', [Columns.ACTUAL_OUTPUT]: 'a' };
}

describe('annotationsForRecords', () => {
  it('keeps only annotations for the loaded records', () => {
    const current = annotationsForRecords([record('a'), record('b')], {
      a: { score: 1 },
      old: { score: 0, notes: 'from an earlier file' },
    });

    expect(current).toEqual({ a: { score: 1 } });
  });

  it('matches numeric dataset ids against string keys', () => {
    const numeric = { ...record('x'), [Columns.DATASET_ID]: 7 } as unknown as EvaluationRecord;

    expect(annotationsForRecords([numeric], { '7': { score: 1 } })).toEqual({ '7': { score: 1 } });
  });
});

describe('labels left over from an earlier upload', () => {
  beforeEach(() => {
    useCalibrationStore.getState().resetAll();
    const { setAnnotation, setData } = useCalibrationStore.getState();
    for (const id of ['old-1', 'old-2', 'old-3', 'old-4']) {
      setAnnotation(id, 1);
    }
    setData([record('new-1'), record('new-2'), record('new-3')], 'fresh_annotation', []);
    setAnnotation('new-1', 0);
  });

  it('do not count toward progress', () => {
    expect(useCalibrationStore.getState().getAnnotationProgress()).toEqual({
      total: 3,
      annotated: 1,
      percentage: 33,
    });
  });

  it('are kept so a re-upload gets them back', () => {
    expect(Object.keys(useCalibrationStore.getState().humanAnnotations)).toHaveLength(5);
  });

  it('do not unlock the build step', () => {
    useCalibrationStore.getState().resetAll();
    useCalibrationStore.getState().setAnnotation('old-1', 1);
    useCalibrationStore.getState().setData([record('new-1')], 'fresh_annotation', []);

    expect(useCalibrationStore.getState().canNavigateToStep('build')).toBe(false);
  });
});
