/**
 * Live ops (admin spec §5).
 *
 * Two tabs over one dataset: the live map of rides in flight (§5.1), and the
 * dispute queue of no-shows and low-rated rides (§5.2). Both poll rather than
 * hold a socket — the ops console is not a consumer surface, a few seconds of
 * latency costs nothing, and a polled view cannot silently die on a dropped
 * connection without the operator noticing.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Map as MapIcon, MessageSquareWarning, RefreshCw } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  RideStatusBadge,
  Spinner,
  useToast,
} from '../components/ui';
import LiveMap, { MapLegend, type MapPoint } from '../components/LiveMap';
import { GatedActionDialog } from '../components/GatedAction';
import { useQuery, useTicker } from '../hooks';
import { fmtAge, fmtDateTime } from '../format';
import { opsApi } from '../api';
import type { Dispute, LiveRide } from '../types';
import RideDetailPanel from './RideDetailPanel';

const DISPUTE_OUTCOMES = [
  { value: 'dismissed', label: 'Dismiss — no action needed' },
  { value: 'warned', label: 'Warned — a strike was logged separately' },
  { value: 'suspended', label: 'Suspended — account paused separately' },
  { value: 'banned', label: 'Banned — account closed separately' },
];

export default function LiveOpsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'disputes' ? 'disputes' : 'map';
  const setTab = (t: 'map' | 'disputes') => setParams(t === 'map' ? {} : { tab: 'disputes' });

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[17px] font-bold text-slate-900">Live ops</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Rides in flight with exact coordinates, and every flagged ride waiting on a decision.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          <TabButton active={tab === 'map'} onClick={() => setTab('map')} icon={<MapIcon size={13} />}>
            Live map
          </TabButton>
          <TabButton
            active={tab === 'disputes'}
            onClick={() => setTab('disputes')}
            icon={<MessageSquareWarning size={13} />}
          >
            Disputes
          </TabButton>
        </div>
      </header>

      {tab === 'map' ? <LiveMapTab /> : <DisputesTab />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
        active ? 'bg-[#0b6e4f] text-white' : 'text-slate-600 hover:bg-slate-50'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

// ─── §5.1 live map ───────────────────────────────────────────────────────────

function LiveMapTab() {
  const [selected, setSelected] = useState<string | null>(null);
  const [openRide, setOpenRide] = useState<string | null>(null);
  useTicker(15_000);

  const query = useQuery<{ rides: LiveRide[]; at: string }>('/live/rides', { pollMs: 8000 });
  const rides = query.data?.rides ?? [];

  // §5.1 — exact pickup pin plus the rider's live position, colour-coded by state.
  const points = useMemo<MapPoint[]>(() => {
    const out: MapPoint[] = [];
    for (const r of rides) {
      out.push({
        id: r.id,
        lat: r.pickup.lat,
        lng: r.pickup.lng,
        kind: 'pickup',
        status: r.status,
        label: `${r.passenger.name} · pickup`,
        detail: `${r.status.replace(/_/g, ' ')} · ${r.destinationNote ?? 'no destination note'}`,
      });
      if (r.rider?.position) {
        out.push({
          id: `${r.id}:rider`,
          lat: r.rider.position.lat,
          lng: r.rider.position.lng,
          kind: 'rider',
          status: r.status,
          label: `${r.rider.name} · ${r.rider.plate ?? 'no plate'}`,
          detail: `Last seen ${fmtAge(r.rider.lastSeenAt)} ago`,
        });
      }
    }
    return out;
  }, [rides]);

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-3 items-start">
        <Card pad={false} className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-200">
            <MapLegend />
            <Button
              size="sm"
              tone="ghost"
              icon={<RefreshCw size={12} className={query.loading ? 'animate-spin' : ''} />}
              onClick={query.reload}
              aria-label="Refresh now"
            >
              {query.data ? fmtAge(query.data.at) : ''}
            </Button>
          </div>
          <LiveMap
            points={points}
            height="560px"
            selectedId={selected}
            onSelect={(id) => setSelected(id.replace(/:rider$/, ''))}
          />
        </Card>

        <Card pad={false} className="max-h-[620px] overflow-y-auto ops-scroll">
          <div className="px-3 py-2 border-b border-slate-200 sticky top-0 bg-white z-10">
            <h2 className="text-[13px] font-semibold text-slate-900">
              In flight <span className="ops-num text-slate-400">({rides.length})</span>
            </h2>
          </div>
          {query.error ? (
            <div className="p-3">
              <ErrorNote message={query.error} onRetry={query.reload} />
            </div>
          ) : query.initialLoading ? (
            <Spinner />
          ) : rides.length === 0 ? (
            <EmptyState title="Nothing in flight" body="Rides appear here the moment a rider claims one." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {rides.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelected(r.id)}
                    onDoubleClick={() => setOpenRide(r.id)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 ${
                      selected === r.id ? 'bg-emerald-50/60' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <RideStatusBadge status={r.status} />
                      <span className="text-[11px] text-slate-500 ops-num">{fmtAge(r.claimedAt ?? r.createdAt)}</span>
                    </div>
                    <div className="text-[12px] text-slate-900 font-medium truncate">
                      {r.passenger.name} → {r.rider?.name ?? 'unassigned'}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {r.rider?.plate ? <span className="ops-mono">{r.rider.plate}</span> : null}
                      {r.rider?.plate && r.destinationNote ? ' · ' : ''}
                      {r.destinationNote ?? ''}
                    </div>
                    <div className="mt-1">
                      <span
                        className="text-[11px] font-semibold text-[#0b6e4f]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenRide(r.id);
                        }}
                      >
                        Open full detail
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {openRide ? <RideDetailPanel rideId={openRide} onClose={() => setOpenRide(null)} /> : null}
    </>
  );
}

// ─── §5.2 dispute queue ──────────────────────────────────────────────────────

function DisputesTab() {
  const toast = useToast();
  const [includeResolved, setIncludeResolved] = useState(false);
  const [openRide, setOpenRide] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Dispute | null>(null);

  const query = useQuery<{ disputes: Dispute[] }>(
    `/disputes${includeResolved ? '?includeResolved=true' : ''}`,
    { pollMs: 30_000 }
  );
  const disputes = query.data?.disputes ?? [];
  const open = disputes.filter((d) => !d.resolved);

  return (
    <>
      <Card pad={false}>
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-200">
          <h2 className="text-[13px] font-semibold text-slate-900">
            Flagged rides <span className="ops-num text-slate-400">({open.length} open)</span>
          </h2>
          <label className="flex items-center gap-1.5 text-[12px] text-slate-600">
            <input
              type="checkbox"
              checked={includeResolved}
              onChange={(e) => setIncludeResolved(e.target.checked)}
              className="rounded border-slate-300"
            />
            Show resolved
          </label>
        </div>

        {query.error ? (
          <div className="p-3">
            <ErrorNote message={query.error} onRetry={query.reload} />
          </div>
        ) : query.initialLoading ? (
          <Spinner />
        ) : disputes.length === 0 ? (
          <EmptyState
            title="No disputes"
            body="A ride lands here when it ends in a no-show, or when either party rates it 2 stars or below."
          />
        ) : (
          <div className="ops-table-wrap ops-scroll">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Flagged</th>
                  <th>Trigger</th>
                  <th>Ride status</th>
                  <th>Passenger</th>
                  <th>Rider</th>
                  <th>Rating</th>
                  <th>Comment</th>
                  <th>Outcome</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {disputes.map((d) => (
                  <tr key={d.rideId} data-clickable="true" onClick={() => setOpenRide(d.rideId)}>
                    <td className="whitespace-nowrap text-slate-600">{fmtDateTime(d.flaggedAt)}</td>
                    <td>
                      <Badge tone={d.trigger === 'no_show' ? 'red' : 'amber'}>
                        {d.trigger === 'no_show' ? 'no-show' : 'low rating'}
                      </Badge>
                    </td>
                    <td>
                      <RideStatusBadge status={d.status} />
                    </td>
                    <td className="text-slate-900">{d.passenger.name}</td>
                    <td className="text-slate-900">{d.rider?.name ?? '—'}</td>
                    <td className="ops-num">{d.lowestRating !== null ? `${d.lowestRating}★` : '—'}</td>
                    <td className="max-w-[220px] truncate text-slate-600" title={d.lowestComment ?? ''}>
                      {d.lowestComment ?? '—'}
                    </td>
                    <td>
                      {d.resolved ? (
                        <Badge tone="neutral" title={`by ${d.resolvedByEmail ?? 'admin'}`}>
                          {d.outcome}
                        </Badge>
                      ) : (
                        <Badge tone="amber">open</Badge>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {!d.resolved ? (
                        <Button
                          size="sm"
                          tone="neutral"
                          onClick={(e) => {
                            e.stopPropagation();
                            setResolving(d);
                          }}
                        >
                          Resolve
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {openRide ? <RideDetailPanel rideId={openRide} onClose={() => setOpenRide(null)} /> : null}

      {resolving ? (
        <GatedActionDialog
          open
          title="Resolve this dispute"
          tone="warn"
          confirmLabel="Record outcome"
          description={
            <>
              Closing the dispute records what was decided. Warning, suspending or banning an account is done
              from that person's <strong>user page</strong> — this only records the outcome here, so a
              moderation action always goes through the same gated path.
            </>
          }
          summary={
            <>
              {resolving.passenger.name} ↔ {resolving.rider?.name ?? 'unassigned rider'} ·{' '}
              {resolving.trigger === 'no_show' ? 'no-show' : `rated ${resolving.lowestRating}★`}
            </>
          }
          reasonCodes={DISPUTE_OUTCOMES}
          reasonLabel="Outcome"
          freetextLabel="Note"
          freetextHint="What did you find, and what did you do about it?"
          onCancel={() => setResolving(null)}
          onConfirm={async ({ reasonCode, reasonFreetext }) => {
            await opsApi(`/disputes/${resolving.rideId}/resolve`, {
              method: 'POST',
              body: { outcome: reasonCode, note: reasonFreetext },
            });
            toast.push('success', 'Dispute resolved and logged.');
            setResolving(null);
            query.reload();
          }}
        />
      ) : null}
    </>
  );
}
