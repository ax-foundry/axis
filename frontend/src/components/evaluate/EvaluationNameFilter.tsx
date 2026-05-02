'use client';

import { Filter, X } from 'lucide-react';

import { useFilteredEvalData } from '@/lib/hooks/useFilteredEvalData';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';

export function EvaluationNameFilter() {
  const { evaluationNames, recordsByName } = useFilteredEvalData();
  const { selectedEvaluationNames, setSelectedEvaluationNames } = useUIStore();

  if (evaluationNames.length <= 1) return null;

  const activeNames = selectedEvaluationNames.filter((n) => evaluationNames.includes(n));
  const isAll = activeNames.length === 0;

  const toggle = (name: string) => {
    if (activeNames.includes(name)) {
      setSelectedEvaluationNames(activeNames.filter((n) => n !== name));
    } else {
      setSelectedEvaluationNames([...activeNames, name]);
    }
  };

  const selectAll = () => setSelectedEvaluationNames([]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-gray-50 px-4 py-2.5 dark:bg-gray-900">
      <div className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
        <Filter className="h-3.5 w-3.5" />
        Evaluation
      </div>

      <button
        onClick={selectAll}
        className={cn(
          'rounded-full px-3 py-1 text-xs font-medium transition-colors',
          isAll
            ? 'bg-primary text-white'
            : 'border border-border bg-surface text-text-muted hover:border-primary/40 hover:text-primary'
        )}
      >
        All ({evaluationNames.reduce((sum, n) => sum + (recordsByName[n] ?? 0), 0)})
      </button>

      {evaluationNames.map((name) => {
        const isActive = activeNames.includes(name);
        const count = recordsByName[name] ?? 0;
        return (
          <button
            key={name}
            onClick={() => toggle(name)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'bg-primary text-white'
                : 'border border-border bg-surface text-text-secondary hover:border-primary/40 hover:text-primary'
            )}
          >
            <span className="max-w-[160px] truncate">{name}</span>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-text-muted'
              )}
            >
              {count}
            </span>
          </button>
        );
      })}

      {!isAll && (
        <button
          onClick={selectAll}
          className="ml-1 flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}
