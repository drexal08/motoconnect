/**
 * Audit log viewer (admin spec §9.2).
 *
 * Read-only is not a UI choice here — `admin_audit_log` has no UPDATE or DELETE
 * path at the database level, enforced by a trigger, so there is nothing this
 * screen could write even if it tried.
 *
 * The per-admin filter is moot with one operator and is built anyway: it is
 * nearly free now and expensive to retrofit the day there is a second admin and
 * a real investigation to run.
 */
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Search } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  InfoNote,
  Pagination,
  Select,
  Spinner,
  TextInput,
} from '../components/ui';
import { useDebounced, useQuery } from '../hooks';
import { fmtDateTime, humanize } from '../format';
import { qs } from '../api';
import type { AuditRow, Paged } from '../types';

/** Colour by consequence, so a ban does not read like a page view. */
function actionTone(action: string): 'red' | 'amber' | 'green' | 'blue' | 'neutral' {
  if (/ban|reject|void|suspend/.test(action)) return 'red';
  if (/refund|override|quota|warn|reset|status/.test(action)) return 'amber';
  if (/approve|verified|settled|reinstate/.test(action)) return 'green';
  if (/login|logout|reveal|opened|password|mfa/.test(action)) return 'blue';
  return 'neutral';
}

export default function AuditPage() {
  const [actionType, setActionType] = useState('');
  const [adminUserId, setAdminUserId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const debouncedTarget = useDebounced(targetId, 300);
  const options = useQuery<{ actionTypes: string[]; admins: { id: string; email: string }[] }>('/audit/options');
  const query = useQuery<Paged<AuditRow>>(
    `/audit${qs({
      actionType,
      adminUserId,
      targetId: debouncedTarget,
      from: from ? new Date(from).toISOString() : '',
      to: to ? new Date(`${to}T23:59:59`).toISOString() : '',
      page,
      pageSize: 50,
    })}`
  );

  const rows = query.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[17px] font-bold text-slate-900">Audit log</h1>
        <p className="text-[12px] text-slate-500 mt-0.5">
          Every gated action, written in the same transaction as the change it describes.
        </p>
      </header>

      <InfoNote>
        <span className="inline-flex items-center gap-1.5">
          <Lock size={13} />
          Append-only. The database refuses updates and deletes on this table — corrections are new rows, never
          edits to history. With a single admin and no second reviewer, the log itself is the control.
        </span>
      </InfoNote>

      <Card pad={false}>
        <div className="flex flex-wrap items-end gap-2 px-3 py-2.5 border-b border-slate-200">
          <Select
            value={actionType}
            onChange={(e) => { setActionType(e.target.value); setPage(1); }}
            className="w-[220px]"
            aria-label="Filter by action"
          >
            <option value="">All actions</option>
            {options.data?.actionTypes.map((a) => (
              <option key={a} value={a}>{humanize(a)}</option>
            ))}
          </Select>
          <Select
            value={adminUserId}
            onChange={(e) => { setAdminUserId(e.target.value); setPage(1); }}
            className="w-[220px]"
            aria-label="Filter by admin"
          >
            <option value="">All admins</option>
            {options.data?.admins.map((a) => (
              <option key={a.id} value={a.id}>{a.email}</option>
            ))}
          </Select>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <TextInput
              value={targetId}
              onChange={(e) => { setTargetId(e.target.value); setPage(1); }}
              placeholder="Target ID"
              className="pl-8 w-[240px] ops-mono"
              aria-label="Filter by target ID"
            />
          </div>
          <TextInput type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-[150px]" aria-label="From date" />
          <TextInput type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-[150px]" aria-label="To date" />
          {(actionType || adminUserId || targetId || from || to) ? (
            <Button
              size="sm"
              tone="ghost"
              onClick={() => { setActionType(''); setAdminUserId(''); setTargetId(''); setFrom(''); setTo(''); setPage(1); }}
            >
              Clear
            </Button>
          ) : null}
        </div>

        {query.error ? (
          <div className="p-3"><ErrorNote message={query.error} onRetry={query.reload} /></div>
        ) : query.initialLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title="No entries match" body="Adjust the filters or widen the date range." />
        ) : (
          <>
            <div className="ops-table-wrap ops-scroll">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Admin</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Reason</th>
                    <th>IP</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Fragment key={r.id}>
                      <tr data-clickable="true" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                        <td className="whitespace-nowrap text-slate-600">{fmtDateTime(r.createdAt)}</td>
                        <td className="text-slate-700 max-w-[180px] truncate" title={r.adminEmail ?? ''}>
                          {r.adminEmail ?? '—'}
                        </td>
                        <td>
                          <Badge tone={actionTone(r.actionType)}>{humanize(r.actionType)}</Badge>
                        </td>
                        <td className="text-[11px]">
                          <div className="text-slate-600">{r.targetType}</div>
                          {r.targetId ? (
                            r.targetType === 'user' || r.targetType === 'rider' ? (
                              <Link
                                to={`/users/${r.targetId}`}
                                onClick={(e) => e.stopPropagation()}
                                className="ops-mono text-[#0b6e4f] hover:underline"
                              >
                                {r.targetId.slice(0, 8)}…
                              </Link>
                            ) : (
                              <span className="ops-mono text-slate-500">{r.targetId.slice(0, 8)}…</span>
                            )
                          ) : null}
                        </td>
                        <td className="max-w-[280px]">
                          {r.reasonCode ? (
                            <div className="text-[11px] font-semibold text-slate-600">{humanize(r.reasonCode)}</div>
                          ) : null}
                          <div className="truncate text-slate-700" title={r.reasonFreetext ?? ''}>
                            {r.reasonFreetext ?? '—'}
                          </div>
                        </td>
                        <td className="ops-mono text-[11px] text-slate-500">{r.ipAddress ?? '—'}</td>
                        <td className="text-right text-[11px] text-slate-400">
                          {expanded === r.id ? 'Hide' : 'Detail'}
                        </td>
                      </tr>
                      {expanded === r.id ? (
                        <tr>
                          <td colSpan={7} className="bg-slate-50">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3">
                              <StateBlock title="Before" value={r.beforeState} />
                              <StateBlock title="After" value={r.afterState} />
                            </div>
                            {r.userAgent ? (
                              <p className="px-3 pb-3 text-[11px] text-slate-500 break-all">
                                <span className="font-semibold">Device:</span> {r.userAgent}
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={query.data!.page} pageSize={query.data!.pageSize} total={query.data!.total} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

function StateBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-1">{title}</div>
      {value === null || value === undefined ? (
        <p className="text-[12px] text-slate-400">—</p>
      ) : (
        <pre className="ops-mono text-[11px] text-slate-700 bg-white border border-slate-200 rounded-lg p-2.5 overflow-x-auto ops-scroll">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}
