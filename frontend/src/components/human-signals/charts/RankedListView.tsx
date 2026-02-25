'use client';

interface RankedListViewProps {
  data: { name: string; count: number }[];
  title?: string;
}

export function RankedListView({ data }: RankedListViewProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-muted">
        No data available
      </div>
    );
  }

  const maxCount = data[0]?.count || 1;

  return (
    <div className="space-y-2.5 p-3">
      {data.map((item, i) => (
        <div key={item.name} className="flex items-center gap-3">
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
            {i + 1}
          </span>
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-text-primary">{item.name}</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
                {item.count}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-1.5 rounded-full bg-primary transition-all duration-300"
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
