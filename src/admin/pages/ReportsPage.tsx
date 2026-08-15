/**
 * Reports (admin spec §3 — "exportable analytics").
 *
 * A fixed set of reports, each answering a real operational question, each
 * exportable as CSV. Same restraint as §10: no query builder, no configurable
 * widgets. If a report is missing, add it to reportsService.ts — that is a
 * smaller change than maintaining a report designer nobody asked for.
 */
import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Button, Card, EmptyState, ErrorNote, Select, Spinner, useToast } from '../components/ui';
import { useQuery } from '../hooks';
import { humanize } from '../format';
import { getAdminToken } from '../api';
import { apiUrl } from '../../config';

interface ReportMeta {
  key: string;
  title: string;
  description: string;
}

interface ReportResult {
  key: string;
  title: string;
  days: number;
  rows: Record<string, unknown>[];
}

export default function ReportsPage() {
  const toast = useToast();
  const list = useQuery<{ reports: ReportMeta[] }>('/reports');
  const [selected, setSelected] = useState<string>('rides_daily');
  const [days, setDays] = useState(30);
  const [downloading, setDownloading] = useState(false);

  const result = useQuery<ReportResult>(`/reports/${selected}?days=${days}`);
  const meta = list.data?.reports.find((r) => r.key === selected);
  const columns = result.data?.rows.length ? Object.keys(result.data.rows[0]) : [];

  /**
   * The API is bearer-authenticated, so a plain <a download> would be
   * unauthenticated and fail. Fetch it with the session token, then hand the
   * browser a blob.
   */
  const download = async () => {
    setDownloading(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/reports/${selected}?days=${days}&format=csv`), {
        headers: { Authorization: `Bearer ${getAdminToken() ?? ''}` },
      });
      if (!res.ok) throw new Error('export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `motoconnect-${selected}-${days}d.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.push('success', 'CSV downloaded.');
    } catch {
      toast.push('error', 'Could not export that report.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[17px] font-bold text-slate-900">Reports</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">Fixed operational reports, exportable as CSV.</p>
        </div>
        <div className="flex items-end gap-2">
          <Select value={selected} onChange={(e) => setSelected(e.target.value)} className="w-[240px]" aria-label="Report">
            {(list.data?.reports ?? []).map((r) => (
              <option key={r.key} value={r.key}>{r.title}</option>
            ))}
          </Select>
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-[150px]" aria-label="Time window">
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </Select>
          <Button
            tone="primary"
            icon={<Download size={13} />}
            onClick={download}
            loading={downloading}
            disabled={!result.data?.rows.length}
          >
            Export CSV
          </Button>
        </div>
      </header>

      {meta ? <p className="text-[12px] text-slate-600">{meta.description}</p> : null}

      <Card pad={false}>
        {result.error ? (
          <div className="p-3"><ErrorNote message={result.error} onRetry={result.reload} /></div>
        ) : result.initialLoading ? (
          <Spinner label="Running report…" />
        ) : !result.data?.rows.length ? (
          <EmptyState
            icon={<FileSpreadsheet size={24} />}
            title="No data in this window"
            body="Try a longer time range."
          />
        ) : (
          <div className="ops-table-wrap ops-scroll max-h-[620px] overflow-y-auto">
            <table className="ops-table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c}>{humanize(c)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.data.rows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((c) => {
                      const v = row[c];
                      const numeric = typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v));
                      return (
                        <td key={c} className={numeric ? 'ops-num text-slate-800' : 'text-slate-700'}>
                          {v === null || v === undefined || v === '' ? '—' : String(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {result.data?.rows.length ? (
        <p className="text-[11px] text-slate-500">
          {result.data.rows.length} row(s) over the last {result.data.days} days.
        </p>
      ) : null}
    </div>
  );
}
