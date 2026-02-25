'use client';

import { useMemo } from 'react';

import { formatScore } from '@/lib/scorecard-utils';

interface ScorecardSparklineProps {
  distribution: number[];
  mean: number;
  width?: number;
  height?: number;
  className?: string;
}

export function ScorecardSparkline({
  distribution,
  mean,
  width = 100,
  height = 24,
  className = '',
}: ScorecardSparklineProps) {
  const { bars, meanX } = useMemo(() => {
    const maxCount = Math.max(...distribution, 1);
    const barWidth = width / distribution.length;
    const padding = 2;

    const bars = distribution.map((count, index) => {
      const barHeight = maxCount > 0 ? (count / maxCount) * (height - 4) : 0;
      return {
        x: index * barWidth + padding / 2,
        y: height - barHeight - 2,
        width: barWidth - padding,
        height: barHeight,
        count,
      };
    });

    // Mean position (0-1 scale mapped to width)
    const meanX = Math.min(Math.max(mean, 0), 1) * width;

    return { bars, meanX };
  }, [distribution, mean, width, height]);

  const totalCount = distribution.reduce((a, b) => a + b, 0);

  if (totalCount === 0) {
    return (
      <div
        className={`flex items-center justify-center text-xs text-text-muted ${className}`}
        style={{ width, height }}
      >
        No data
      </div>
    );
  }

  return (
    <div className={`group relative ${className}`} title={`Mean: ${formatScore(mean)}`}>
      <svg width={width} height={height} className="overflow-visible">
        {/* Bars */}
        {bars.map((bar, index) => (
          <rect
            key={index}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            fill="currentColor"
            className="text-primary/60 transition-colors hover:text-primary"
            rx={1}
          />
        ))}

        {/* Mean indicator line */}
        <line
          x1={meanX}
          y1={0}
          x2={meanX}
          y2={height}
          stroke="#E74C3C"
          strokeWidth={1.5}
          strokeDasharray="2,2"
        />

        {/* Mean indicator dot */}
        <circle cx={meanX} cy={height / 2} r={2.5} fill="#E74C3C" />
      </svg>

      {/* Tooltip on hover */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
        <div className="mb-1 font-medium">Distribution (n={totalCount})</div>
        <div className="flex gap-2 text-[10px]">
          {distribution.map((count, i) => (
            <span key={i} className="text-gray-300">
              Bin {i + 1}: {count}
            </span>
          ))}
        </div>
        <div className="mt-1 text-red-300">Mean: {formatScore(mean)}</div>
      </div>
    </div>
  );
}
