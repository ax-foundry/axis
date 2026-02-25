'use client';

import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

interface TrendSparklineProps {
  points: { timestamp: string; value: number }[];
  width?: number;
  height?: number;
  className?: string;
}

export function TrendSparkline({
  points,
  width = 100,
  height = 28,
  className,
}: TrendSparklineProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { polyline, lastDot, trendColor, minVal, maxVal } = useMemo(() => {
    if (points.length < 2)
      return { polyline: '', lastDot: null, trendColor: 'text-gray-400', minVal: 0, maxVal: 1 };

    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 0.01;
    const padding = 3;
    const drawW = width - padding * 2;
    const drawH = height - padding * 2;

    const pts = points.map((p, i) => {
      const x = padding + (i / (points.length - 1)) * drawW;
      const y = padding + drawH - ((p.value - min) / range) * drawH;
      return `${x},${y}`;
    });

    const last = points[points.length - 1];
    const first = points[0];
    const color =
      last.value >= first.value
        ? 'text-success'
        : last.value < first.value * 0.95
          ? 'text-error'
          : 'text-warning';

    const lastX = padding + drawW;
    const lastY = padding + drawH - ((last.value - min) / range) * drawH;

    return {
      polyline: pts.join(' '),
      lastDot: { x: lastX, y: lastY },
      trendColor: color,
      minVal: min,
      maxVal: max,
    };
  }, [points, width, height]);

  if (points.length < 2) {
    return (
      <div
        className={cn('flex items-center justify-center text-xs text-text-muted', className)}
        style={{ width, height }}
      >
        —
      </div>
    );
  }

  const range = maxVal - minVal || 0.01;
  const padding = 3;
  const drawW = width - padding * 2;
  const drawH = height - padding * 2;

  return (
    <div className={cn('relative', className)}>
      <svg
        width={width}
        height={height}
        className={trendColor}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <polyline
          points={polyline}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {lastDot && <circle cx={lastDot.x} cy={lastDot.y} r={2.5} fill="currentColor" />}
        {/* Invisible hover hitboxes */}
        {points.map((p, i) => {
          const x = padding + (i / (points.length - 1)) * drawW;
          const y = padding + drawH - ((p.value - minVal) / range) * drawH;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={6}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
            />
          );
        })}
        {hoverIdx !== null && (
          <>
            <circle
              cx={padding + (hoverIdx / (points.length - 1)) * drawW}
              cy={padding + drawH - ((points[hoverIdx].value - minVal) / range) * drawH}
              r={3}
              fill="currentColor"
              stroke="white"
              strokeWidth={1}
            />
          </>
        )}
      </svg>
      {hoverIdx !== null && (
        <div className="absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-0.5 text-[10px] text-white shadow">
          {points[hoverIdx].value.toFixed(3)}
        </div>
      )}
    </div>
  );
}
