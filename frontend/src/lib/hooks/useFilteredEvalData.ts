'use client';

import { useMemo } from 'react';

import { useDataStore, useUIStore } from '@/stores';
import { Columns } from '@/types';

import type { EvaluationRecord } from '@/types';

export interface FilteredEvalData {
  filteredData: EvaluationRecord[];
  evaluationNames: string[];
  filteredEvaluationNames: string[];
  recordsByName: Record<string, number>;
  hasMultiple: boolean;
  isFiltered: boolean;
}

export function useFilteredEvalData(): FilteredEvalData {
  const { data } = useDataStore();
  const { selectedEvaluationNames } = useUIStore();

  const evaluationNames = useMemo(() => {
    const names = new Set<string>();
    data.forEach((row) => {
      const name = row[Columns.EXPERIMENT_NAME];
      if (name !== undefined && name !== null && name !== '') {
        names.add(String(name));
      }
    });
    return Array.from(names).sort();
  }, [data]);

  const recordsByName = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach((row) => {
      const name = row[Columns.EXPERIMENT_NAME];
      if (name !== undefined && name !== null && name !== '') {
        const key = String(name);
        counts[key] = (counts[key] ?? 0) + 1;
      }
    });
    return counts;
  }, [data]);

  // Only names that still exist in current data
  const activeFilter = useMemo(() => {
    if (selectedEvaluationNames.length === 0) return [];
    return selectedEvaluationNames.filter((n) => evaluationNames.includes(n));
  }, [selectedEvaluationNames, evaluationNames]);

  const filteredData = useMemo(() => {
    if (activeFilter.length === 0 || evaluationNames.length <= 1) return data;
    return data.filter((row) => {
      const name = row[Columns.EXPERIMENT_NAME];
      if (name === undefined || name === null || name === '') return activeFilter.length === 0;
      return activeFilter.includes(String(name));
    });
  }, [data, activeFilter, evaluationNames]);

  const filteredEvaluationNames = useMemo(() => {
    const names = new Set<string>();
    filteredData.forEach((row) => {
      const name = row[Columns.EXPERIMENT_NAME];
      if (name !== undefined && name !== null && name !== '') names.add(String(name));
    });
    return Array.from(names).sort();
  }, [filteredData]);

  return {
    filteredData,
    evaluationNames,
    filteredEvaluationNames,
    recordsByName,
    hasMultiple: filteredEvaluationNames.length > 1,
    isFiltered: activeFilter.length > 0 && evaluationNames.length > 1,
  };
}
