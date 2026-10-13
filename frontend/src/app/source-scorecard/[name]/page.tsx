'use client';

import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { fetchApi } from '@/lib/api';

type View = 'overview' | 'flow' | 'quality' | 'reliability';
type Row = {
  metric_key: string;
  label: string;
  value: number | null;
  status: string;
  availability_reason: string | null;
  cohort: string | null;
  instrumentation_horizon: string | null;
};

const views: View[] = ['overview', 'flow', 'quality', 'reliability'];

function statusText(row: Row): string {
  if (row.status === 'available' && row.value === 0) return 'Available — valid zero';
  if (row.status === 'available' && !row.cohort) return 'Available — empty cohort';
  return row.availability_reason ? `${row.status}: ${row.availability_reason}` : row.status;
}

export default function SourceScorecardPage() {
  const { name } = useParams<{ name: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const view = (search.get('view') as View) || 'overview';
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [contributors, setContributors] = useState<Record<string, unknown>[]>([]);
  const [contributorError, setContributorError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lookbackDays = Number(search.get('lookback') || 30);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    fetchApi<{ rows: Row[] }>(`/api/source-scorecard/${encodeURIComponent(name)}/${view}`, {
      method: 'POST',
      body: JSON.stringify({ lookback_days: lookbackDays }),
      signal: controller.signal,
    })
      .then((data) => active && setRows(data.rows))
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      controller.abort();
    };
  }, [lookbackDays, name, view]);

  useEffect(() => {
    setSelected(null);
    setContributors([]);
    setContributorError(null);
    setPage(1);
  }, [name, view]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    let active = true;
    setContributorError(null);
    fetchApi<{ rows: Record<string, unknown>[] }>(
      `/api/source-scorecard/${encodeURIComponent(name)}/${view}/contributors`,
      {
        method: 'POST',
        body: JSON.stringify({
          metric_key: selected.metric_key,
          lookback_days: lookbackDays,
          page,
          page_size: 25,
        }),
        signal: controller.signal,
      }
    )
      .then((data) => active && setContributors(data.rows))
      .catch((cause: Error) => active && setContributorError(cause.message));
    return () => {
      active = false;
      controller.abort();
    };
  }, [lookbackDays, name, page, selected, view]);

  const selectView = (next: View) =>
    router.replace(`?view=${next}&lookback=${search.get('lookback') || 30}`);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-text-primary">{name} scorecard</h1>
      <p className="mt-1 text-sm text-text-muted">
        Configured source metrics and exact contributor drill-down.
      </p>
      <div role="tablist" aria-label="Scorecard views" className="mt-6 flex gap-2">
        {views.map((item) => (
          <button
            key={item}
            role="tab"
            aria-selected={view === item}
            onClick={() => selectView(item)}
            className="rounded border border-border px-3 py-2 text-sm capitalize"
          >
            {item}
          </button>
        ))}
      </div>
      {loading && <Loader2 aria-label="Loading scorecard" className="mt-8 animate-spin" />}
      {error && (
        <p role="alert" className="mt-8 flex gap-2 text-error">
          <AlertCircle />
          Query error: {error}
        </p>
      )}
      {!loading && !error && (
        <div className="mt-6 overflow-x-auto rounded border border-border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{view} metrics</caption>
            <thead>
              <tr className="border-b border-border">
                <th className="p-3">Metric</th>
                <th className="p-3">Value</th>
                <th className="p-3">Status</th>
                <th className="p-3">Boundary</th>
                <th className="p-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.metric_key}-${index}`} className="border-b border-border">
                  <td className="p-3">{row.label}</td>
                  <td className="p-3">{row.value ?? '—'}</td>
                  <td className="p-3">{statusText(row)}</td>
                  <td className="p-3">{row.instrumentation_horizon || '—'}</td>
                  <td className="p-3">
                    <button
                      onClick={() => {
                        setSelected(row);
                        setPage(1);
                      }}
                      className="text-primary underline"
                    >
                      Contributors
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="p-6 text-text-muted">No rows in this configured window.</p>
          )}
        </div>
      )}
      {selected && (
        <section
          aria-label={`${selected.label} contributors`}
          className="mt-8 rounded border border-border p-4"
        >
          <h2 className="font-semibold">{selected.label} contributors</h2>
          {contributorError && <p role="alert">Contributor query error: {contributorError}</p>}
          <ul className="mt-3 space-y-2">
            {contributors.map((row, index) => (
              <li key={index} className="font-mono text-xs">
                {JSON.stringify(row)}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <button
              aria-label="Previous contributor page"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft />
            </button>
            <button aria-label="Next contributor page" onClick={() => setPage(page + 1)}>
              <ChevronRight />
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
