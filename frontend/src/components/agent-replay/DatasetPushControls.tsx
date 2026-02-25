'use client';

import { Database } from 'lucide-react';
import { useMemo } from 'react';

import type { DatasetInfo } from '@/types/replay';

interface DatasetPushControlsProps {
  enabled: boolean;
  datasetName: string;
  onToggle: (v: boolean) => void;
  onDatasetNameChange: (v: string) => void;
  existingDatasets: DatasetInfo[];
  defaultName: string;
}

export function DatasetPushControls({
  enabled,
  datasetName,
  onToggle,
  onDatasetNameChange,
  existingDatasets,
  defaultName,
}: DatasetPushControlsProps) {
  const datasetNames = useMemo(() => existingDatasets.map((d) => d.name), [existingDatasets]);

  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <Database className="h-3.5 w-3.5 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">Add to golden dataset</span>
      </label>

      {enabled && (
        <div className="ml-6">
          <input
            type="text"
            list="dataset-suggestions"
            value={datasetName}
            onChange={(e) => onDatasetNameChange(e.target.value)}
            placeholder={defaultName}
            className="w-full rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <datalist id="dataset-suggestions">
            {datasetNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <p className="mt-1 text-[11px] text-text-muted">
            Leave blank to use default: {defaultName}
          </p>
        </div>
      )}
    </div>
  );
}
