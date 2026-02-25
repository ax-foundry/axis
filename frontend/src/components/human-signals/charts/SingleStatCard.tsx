'use client';

interface SingleStatCardProps {
  label: string;
  value: string;
  subtitle?: string;
  highlight?: boolean;
}

export function SingleStatCard({ label, value, subtitle, highlight }: SingleStatCardProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-4 text-center">
      <div
        className={`text-4xl font-bold tracking-tight ${highlight ? 'text-primary' : 'text-text-primary'}`}
      >
        {value}
      </div>
      <div className="mt-1.5 text-sm font-medium text-text-secondary">{label}</div>
      {subtitle && (
        <div className="mt-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-text-muted">
          {subtitle}
        </div>
      )}
    </div>
  );
}
