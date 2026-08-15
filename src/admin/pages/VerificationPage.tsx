/**
 * Verification queue (admin spec §4) — the launch blocker.
 *
 * Two deliberate choices you can see on screen:
 *  • Oldest first, always, on load. Newest-first would build a silent backlog
 *    of ignored old applicants (§4.1).
 *  • No bulk approve, anywhere (§4.4). Every verification is a distinct
 *    liability decision and there is no checkbox column to batch them with.
 */
import { useState } from 'react';
import { AlertTriangle, Eye, FileWarning, Search, UserCheck } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Pagination,
  Select,
  Spinner,
  TextInput,
  VerificationBadge,
} from '../components/ui';
import { useDebounced, useQuery, useTicker } from '../hooks';
import { fmtDateTime, fmtNumber } from '../format';
import { qs } from '../api';
import type { Paged, QueueRow } from '../types';
import RiderReviewPanel from './RiderReviewPanel';

type Sort = 'oldest' | 'newest' | 'name';
type StatusFilter = 'pending_verification' | 'rejected' | 'verified' | 'all';

export default function VerificationPage() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('oldest');
  const [status, setStatus] = useState<StatusFilter>('pending_verification');
  const [page, setPage] = useState(1);
  const [openRider, setOpenRider] = useState<string | null>(null);

  const debouncedSearch = useDebounced(search, 300);
  useTicker(60_000);

  const query = useQuery<Paged<QueueRow>>(
    `/verification${qs({ sort, status, search: debouncedSearch, page, pageSize: 25 })}`
  );

  const rows = query.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[17px] font-bold text-slate-900">Verification queue</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Riders cannot see a single ride request until they are approved here.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <TextInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Name, phone or plate"
              className="pl-8 w-[220px]"
              aria-label="Search applications"
            />
          </div>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as StatusFilter);
              setPage(1);
            }}
            aria-label="Filter by status"
            className="w-[170px]"
          >
            <option value="pending_verification">Pending</option>
            <option value="verified">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All applications</option>
          </Select>
          <Select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as Sort);
              setPage(1);
            }}
            aria-label="Sort order"
            className="w-[170px]"
          >
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
            <option value="name">Name (A–Z)</option>
          </Select>
        </div>
      </header>

      {query.error ? <ErrorNote message={query.error} onRetry={query.reload} /> : null}

      <Card pad={false}>
        {query.initialLoading ? (
          <Spinner label="Loading applications…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<UserCheck size={24} />}
            title={status === 'pending_verification' ? 'Nothing waiting' : 'No applications match'}
            body={
              status === 'pending_verification'
                ? 'Every rider application has been decided. New ones appear here as they are submitted.'
                : 'Try a different filter or search term.'
            }
          />
        ) : (
          <>
            <div className="ops-table-wrap ops-scroll">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>National ID</th>
                    <th>Plate</th>
                    <th>Licence</th>
                    <th>Submitted</th>
                    <th>Waiting</th>
                    <th>Docs</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.riderId}
                      data-clickable="true"
                      data-selected={openRider === r.riderId}
                      onClick={() => setOpenRider(r.riderId)}
                    >
                      <td className="font-medium text-slate-900">{r.name}</td>
                      <td className="ops-mono text-slate-600">{r.phone}</td>
                      {/* §4.1 — masked in the list. Revealing is a logged action inside the panel. */}
                      <td className="ops-mono text-slate-500">{r.nationalIdMasked}</td>
                      <td className="ops-mono text-slate-700">{r.plateNumber}</td>
                      <td className="ops-mono text-slate-500">{r.licenseNumber}</td>
                      <td className="text-slate-600 whitespace-nowrap">{fmtDateTime(r.submittedAt)}</td>
                      <td>
                        <WaitingCell row={r} />
                      </td>
                      <td>
                        {r.documentCount > 0 ? (
                          <Badge tone="neutral">{r.documentCount}</Badge>
                        ) : (
                          <span title="No ID images captured at signup" className="text-amber-600">
                            <FileWarning size={14} />
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <VerificationBadge status={r.verificationStatus} />
                          {r.infoRequestedAt ? <Badge tone="blue">info asked</Badge> : null}
                        </div>
                      </td>
                      <td className="text-right">
                        <Button
                          size="sm"
                          tone="neutral"
                          icon={<Eye size={13} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenRider(r.riderId);
                          }}
                        >
                          Review
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={query.data!.page}
              pageSize={query.data!.pageSize}
              total={query.data!.total}
              onPage={setPage}
            />
          </>
        )}
      </Card>

      {status === 'pending_verification' && rows.some((r) => r.overSla) ? (
        <p className="text-[12px] text-red-700 flex items-center gap-1.5">
          <AlertTriangle size={14} />
          {fmtNumber(rows.filter((r) => r.overSla).length)} application(s) have been waiting more than 48 hours.
        </p>
      ) : null}

      {openRider ? (
        <RiderReviewPanel
          riderId={openRider}
          onClose={() => setOpenRider(null)}
          onDecided={() => {
            setOpenRider(null);
            query.reload();
          }}
        />
      ) : null}
    </div>
  );
}

/** §4.1 — days pending, flagged red past 48 h. */
function WaitingCell({ row }: { row: QueueRow }) {
  if (row.verificationStatus !== 'pending_verification') {
    return <span className="text-slate-400">—</span>;
  }
  const label = row.hoursPending < 24 ? `${row.hoursPending}h` : `${row.daysPending}d`;
  return (
    <span
      className={`ops-num font-semibold ${row.overSla ? 'text-red-700' : 'text-slate-600'}`}
      title={row.overSla ? 'Past the 48-hour target' : undefined}
    >
      {label}
    </span>
  );
}
