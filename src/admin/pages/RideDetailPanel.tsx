/**
 * Ride detail (admin spec §5.1).
 *
 * Both parties, every state transition with its timestamp, the ratings each
 * side gave, and the location trail — everything needed to settle a dispute
 * without asking either party to recount it.
 *
 * The manual state override (§6.3) lives here because this is where a stuck
 * ride is discovered. It is gated like every other destructive action, and it
 * can only move a ride to a FINAL state — an admin resolves a stuck ride, they
 * do not drive it through the lifecycle by hand.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Route } from 'lucide-react';
import {
  Badge,
  Button,
  ErrorNote,
  InfoNote,
  KeyValue,
  Modal,
  RideStatusBadge,
  Spinner,
  useToast,
} from '../components/ui';
import { GatedActionDialog } from '../components/GatedAction';
import LiveMap, { type MapPoint, type MapTrail } from '../components/LiveMap';
import { useQuery } from '../hooks';
import { fmtDateTime } from '../format';
import { opsApi } from '../api';
import type { RideDetail } from '../types';

const FINAL_STATES = [
  { value: 'COMPLETED', label: 'Completed — the ride actually happened' },
  { value: 'CANCELLED_BY_PASSENGER', label: 'Cancelled by passenger' },
  { value: 'CANCELLED_BY_RIDER', label: 'Cancelled by rider' },
  { value: 'NO_SHOW', label: 'No-show' },
  { value: 'EXPIRED', label: 'Expired' },
];

const TIMESTAMP_LABELS: [string, string][] = [
  ['createdAt', 'Requested'],
  ['firstVisibleAt', 'Visible to riders'],
  ['claimedAt', 'Claimed'],
  ['confirmDeadline', 'Confirm deadline'],
  ['confirmedAt', 'Confirmed'],
  ['riderArrivedAt', 'Rider arrived'],
  ['completedAt', 'Completed'],
  ['noShowFlagAt', 'No-show flagged'],
];

export default function RideDetailPanel({ rideId, onClose }: { rideId: string; onClose: () => void }) {
  const toast = useToast();
  const query = useQuery<RideDetail>(`/live/rides/${rideId}`);
  const [overriding, setOverriding] = useState(false);
  const [targetStatus, setTargetStatus] = useState('COMPLETED');
  const ride = query.data;

  const points: MapPoint[] = ride
    ? [
        {
          id: 'pickup',
          lat: ride.pickup.lat,
          lng: ride.pickup.lng,
          kind: 'pickup',
          status: ride.status,
          label: `${ride.passenger.name} · pickup`,
        },
      ]
    : [];

  const trail: MapTrail[] =
    ride && ride.track.length > 1
      ? [{ id: 'track', points: ride.track.map((t) => [t.lat, t.lng] as [number, number]) }]
      : [];

  return (
    <>
      <Modal
        open
        onClose={onClose}
        width="max-w-4xl"
        title="Ride detail"
        subtitle={
          ride ? (
            <span className="flex items-center gap-2">
              <span className="ops-mono text-[11px]">{ride.id}</span>
              <RideStatusBadge status={ride.status} />
            </span>
          ) : null
        }
      >
        {query.initialLoading ? (
          <Spinner />
        ) : query.error ? (
          <ErrorNote message={query.error} onRetry={query.reload} />
        ) : ride ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Party
                title="Passenger"
                name={ride.passenger.name}
                phone={ride.passenger.phone}
                id={ride.passenger.id}
                status={ride.passenger.accountStatus}
              />
              {ride.rider ? (
                <Party
                  title="Rider"
                  name={ride.rider.name}
                  phone={ride.rider.phone}
                  id={ride.rider.id}
                  status={ride.rider.accountStatus}
                  extra={
                    <span className="flex items-center gap-2">
                      <span className="ops-mono">{ride.rider.plate ?? '—'}</span>
                      {ride.rider.reliabilityScore !== null ? (
                        <Badge tone={ride.rider.reliabilityScore >= 4 ? 'green' : 'amber'}>
                          {ride.rider.reliabilityScore.toFixed(2)} reliability
                        </Badge>
                      ) : null}
                    </span>
                  }
                />
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-500">
                  No rider claimed this request.
                </div>
              )}
            </div>

            <div>
              <h3 className="text-[12px] font-semibold text-slate-700 mb-2">Location</h3>
              <LiveMap points={points} trails={trail} height="240px" autoFit />
              <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
                <Route size={12} />
                {ride.track.length > 1
                  ? `${ride.track.length} breadcrumb points recorded during this ride.`
                  : 'No location trail recorded — the ride ended before enough position updates arrived.'}
                {ride.pickupAccuracyM !== null ? ` GPS accuracy at pickup: ±${Math.round(ride.pickupAccuracyM)} m.` : ''}
              </p>
            </div>

            <div>
              <h3 className="text-[12px] font-semibold text-slate-700 mb-2">Timeline</h3>
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2.5 rounded-lg bg-slate-50 border border-slate-200 p-3">
                {TIMESTAMP_LABELS.map(([key, label]) => (
                  <KeyValue key={key} label={label}>
                    {fmtDateTime(ride.timestamps[key])}
                  </KeyValue>
                ))}
              </dl>
            </div>

            {ride.events.length ? (
              <div>
                <h3 className="text-[12px] font-semibold text-slate-700 mb-2">State transitions</h3>
                <div className="ops-table-wrap ops-scroll rounded-lg border border-slate-200 max-h-[200px] overflow-y-auto">
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>From</th>
                        <th>To</th>
                        <th>Actor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ride.events.map((e) => (
                        <tr key={e.id}>
                          <td className="whitespace-nowrap text-slate-600">{fmtDateTime(e.createdAt)}</td>
                          <td className="text-slate-500">{e.fromStatus ?? '—'}</td>
                          <td>
                            <RideStatusBadge status={e.toStatus} />
                          </td>
                          <td className="text-slate-600">{e.actorName ?? 'system'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {ride.ratings.length ? (
              <div>
                <h3 className="text-[12px] font-semibold text-slate-700 mb-2">Ratings</h3>
                <ul className="space-y-1.5">
                  {ride.ratings.map((r, i) => (
                    <li key={i} className="rounded-lg border border-slate-200 p-2.5 text-[12px]">
                      <div className="flex items-center gap-2">
                        <Badge tone={r.stars <= 2 ? 'red' : r.stars >= 4 ? 'green' : 'amber'}>{r.stars}★</Badge>
                        <span className="text-slate-600">
                          {r.rated_by_name ?? 'someone'} rated {r.rated_user_name ?? 'the other party'}
                        </span>
                        <span className="text-slate-400 ml-auto">{fmtDateTime(r.created_at)}</span>
                      </div>
                      {r.comment ? <p className="mt-1 text-slate-700">“{r.comment}”</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {ride.disputeReview ? (
              <InfoNote>
                Dispute resolved {fmtDateTime(ride.disputeReview.resolved_at)} by{' '}
                {ride.disputeReview.resolved_by_email ?? 'an admin'} — <strong>{ride.disputeReview.outcome}</strong>:
                “{ride.disputeReview.note}”
              </InfoNote>
            ) : null}

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200">
              <p className="text-[11px] text-slate-500">
                Force-closing a ride is a gated action and is written to the audit log.
              </p>
              <Button tone="warn" onClick={() => setOverriding(true)}>
                Force-close this ride
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {ride ? (
        <GatedActionDialog
          open={overriding}
          title="Force-close this ride"
          tone="warn"
          confirmLabel="Override state"
          description="Use this only for a ride that is genuinely stuck. It moves the ride straight to a final state and records an entry in the ride's own event trail as well as the admin audit log."
          summary={
            <>
              Currently <strong>{ride.status.replace(/_/g, ' ')}</strong> · {ride.passenger.name} ↔{' '}
              {ride.rider?.name ?? 'unassigned'}
            </>
          }
          reasonCodes={FINAL_STATES}
          reasonLabel="Move to"
          freetextLabel="Why is this override needed?"
          onCancel={() => setOverriding(false)}
          onConfirm={async ({ reasonCode, reasonFreetext }) => {
            await opsApi(`/live/rides/${ride.id}/override`, {
              method: 'POST',
              body: { status: reasonCode ?? targetStatus, reasonFreetext },
            });
            toast.push('success', 'Ride force-closed and logged.');
            setOverriding(false);
            setTargetStatus('COMPLETED');
            query.reload();
          }}
        />
      ) : null}
    </>
  );
}

function Party({
  title,
  name,
  phone,
  id,
  status,
  extra,
}: {
  title: string;
  name: string;
  phone: string;
  id: string;
  status: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">{title}</span>
        <Badge tone={status === 'active' ? 'green' : status === 'suspended' ? 'amber' : 'red'}>{status}</Badge>
      </div>
      <div className="text-[13px] font-semibold text-slate-900">{name}</div>
      <div className="ops-mono text-[12px] text-slate-600">{phone}</div>
      {extra ? <div className="text-[12px] text-slate-600 mt-1">{extra}</div> : null}
      <Link
        to={`/users/${id}`}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#0b6e4f]"
      >
        Open account <ExternalLink size={11} />
      </Link>
    </div>
  );
}
