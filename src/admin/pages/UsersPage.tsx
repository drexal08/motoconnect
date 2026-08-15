/**
 * Users list (admin spec §6.1).
 *
 * Paginated, never infinite scroll: an admin acting on row 40 must not have the
 * list shift under them because more rows loaded.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flag, Search, Users as UsersIcon } from 'lucide-react';
import {
  AccountStatusBadge,
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  Pagination,
  Select,
  Spinner,
  TextInput,
  VerificationBadge,
} from '../components/ui';
import { useDebounced, useQuery } from '../hooks';
import { fmtDate, fmtNumber } from '../format';
import { qs } from '../api';
import type { Paged, UserRow } from '../types';

export default function UsersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);

  const debounced = useDebounced(search, 300);
  const query = useQuery<Paged<UserRow>>(
    `/users${qs({ search: debounced, role, status, page, pageSize: 25 })}`
  );
  const rows = query.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[17px] font-bold text-slate-900">Users</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">Passengers and riders. Click a row to open the account.</p>
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
              placeholder="Name or phone"
              className="pl-8 w-[220px]"
              aria-label="Search users"
            />
          </div>
          <Select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by role"
            className="w-[140px]"
          >
            <option value="all">All roles</option>
            <option value="passenger">Passengers</option>
            <option value="rider">Riders</option>
          </Select>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
            className="w-[160px]"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
            <option value="flagged">Flagged for review</option>
          </Select>
        </div>
      </header>

      {query.error ? <ErrorNote message={query.error} onRetry={query.reload} /> : null}

      <Card pad={false}>
        {query.initialLoading ? (
          <Spinner label="Loading accounts…" />
        ) : rows.length === 0 ? (
          <EmptyState icon={<UsersIcon size={24} />} title="No accounts match" body="Try a different filter or search." />
        ) : (
          <>
            <div className="ops-table-wrap ops-scroll">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Verification</th>
                    <th>Plan</th>
                    <th>Reliability</th>
                    <th>Rides</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id} data-clickable="true" onClick={() => navigate(`/users/${u.id}`)}>
                      <td className="font-medium text-slate-900">
                        <span className="flex items-center gap-1.5">
                          {u.name}
                          {u.reviewFlag ? (
                            <span title="Flagged for review (3+ no-shows in 30 days)" className="text-amber-600">
                              <Flag size={12} />
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="ops-mono text-slate-600">{u.phone}</td>
                      <td>
                        <Badge tone={u.role === 'rider' ? 'violet' : 'neutral'}>{u.role}</Badge>
                      </td>
                      <td>
                        <AccountStatusBadge status={u.accountStatus} />
                      </td>
                      <td>
                        <VerificationBadge status={u.verificationStatus} />
                      </td>
                      <td>{u.activeTier ? <Badge tone="green">{u.activeTier}</Badge> : <span className="text-slate-400">—</span>}</td>
                      <td className="ops-num">
                        {u.reliabilityScore !== null ? (
                          <span className={u.reliabilityScore < 3.5 ? 'text-red-700 font-semibold' : 'text-slate-700'}>
                            {u.reliabilityScore.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="ops-num text-slate-600">{fmtNumber(u.rideCount)}</td>
                      <td className="text-slate-500 whitespace-nowrap">{fmtDate(u.createdAt)}</td>
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
    </div>
  );
}
