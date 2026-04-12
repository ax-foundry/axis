'use client';

import { Database } from 'lucide-react';
import { useMemo } from 'react';

import type { DatasetInfo } from '@/types/replay';

interface DatasetPushControlsProps {
  datasetName: string;
  onDatasetNameChange: (v: string) => void;
  existingDatasets: DatasetInfo[];
  defaultName: string;
}

export function DatasetPushControls({
  datasetName,
  onDatasetNameChange,
  existingDatasets,
  defaultName,
}: DatasetPushControlsProps) {
  const datasetNames = useMemo(() => existingDatasets.map((d) => d.name), [existingDatasets]);

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2">
        <Database className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-text-primary">Golden Dataset</span>
      </label>
      <input
        type="text"
        list="dataset-suggestions"
        value={datasetName}
        onChange={(e) => onDatasetNameChange(e.target.value)}
        placeholder={defaultName}
        className="w-full rounded-lg border border-primary/15 bg-surface px-3 py-1.5 text-sm text-text-primary shadow-sm placeholder:text-text-muted focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15"
      />
      <datalist id="dataset-suggestions">
        {datasetNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <p className="text-[11px] text-text-muted">Leave blank to use default: {defaultName}</p>
    </div>
  );
}
