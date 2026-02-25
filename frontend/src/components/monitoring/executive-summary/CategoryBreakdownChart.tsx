'use client';

import { useMemo } from 'react';

import { PlotlyChart } from '@/components/charts/plotly-chart';

import type { MonitoringRecord } from '@/types';

interface CategoryBreakdownChartProps {
  data: MonitoringRecord[];
  className?: string;
}

export function CategoryBreakdownChart({ data, className }: CategoryBreakdownChartProps) {
  const chartData = useMemo(() => {
    const counts: Record<string, number> = { SCORE: 0, CLASSIFICATION: 0, ANALYSIS: 0 };

    for (const r of data) {
      const cat = String(r.metric_category || 'SCORE').toUpperCase();
      if (cat in counts) counts[cat]++;
      else counts.SCORE++;
    }

    const labels = Object.keys(counts).filter((k) => counts[k] > 0);
    const values = labels.map((k) => counts[k]);
    const colors: Record<string, string> = {
      SCORE: '#27AE60',
      CLASSIFICATION: '#D4AF37',
      ANALYSIS: '#B8C5D3',
    };

    return [
      {
        type: 'pie' as const,
        labels,
        values,
        hole: 0.55,
        marker: { colors: labels.map((l) => colors[l] || '#7F8C8D') },
        textinfo: 'label+percent' as const,
        textposition: 'outside' as const,
        hoverinfo: 'label+value+percent' as const,
      },
    ];
  }, [data]);

  return (
    <div className={className}>
      <PlotlyChart
        data={chartData}
        layout={{
          showlegend: false,
          margin: { l: 10, r: 10, t: 10, b: 10 },
          height: 220,
          annotations: [
            {
              text: `${data.length}`,
              showarrow: false,
              font: { size: 20, color: '#2C3E50', family: 'Inter, system-ui' },
              x: 0.5,
              y: 0.5,
            },
          ],
        }}
      />
    </div>
  );
}
