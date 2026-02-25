'use client';

import type { SignalsChartDataPoint } from '@/types';

interface StackedBarChartProps {
  data: SignalsChartDataPoint[];
}

export function StackedBarChart({ data }: StackedBarChartProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (data.length === 0 || total === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-muted">
        No data available
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-center px-4 py-3">
      {/* Legend row */}
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1.5">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: d.color || '#8B9F4F' }}
            />
            <span className="text-sm text-text-primary">
              <span className="font-semibold">{d.count}</span>{' '}
              <span className="capitalize">{d.name.replace(/_/g, ' ')}</span>{' '}
              <span className="text-text-muted">({d.rate.toFixed(1)}%)</span>
            </span>
          </div>
        ))}
      </div>

      {/* Stacked bar */}
      <div className="flex h-8 w-full overflow-hidden rounded-md">
        {data
          .filter((d) => d.count > 0)
          .map((d) => {
            const pct = (d.count / total) * 100;
            return (
              <div
                key={d.name}
                className="transition-all duration-300"
                style={{
                  width: `${pct}%`,
                  backgroundColor: d.color || '#8B9F4F',
                  minWidth: pct > 0 ? '2px' : '0',
                }}
                title={`${d.name}: ${d.count} (${d.rate.toFixed(1)}%)`}
              />
            );
          })}
      </div>
    </div>
  );
}
