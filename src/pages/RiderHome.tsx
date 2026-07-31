import { useEffect, useMemo, useRef, useState } from 'react';
import { Bike, Clock3, Compass, Navigation, Radio, Star, User } from 'lucide-react';
import { useLocationStore } from '../store/useLocationStore';
import { useSocketStore } from '../store/useSocketStore';
import { useRideStore } from '../store/useRideStore';
import { Button, CountdownRing, EmptyState, FormField, Input, Modal } from '../components/ui';
import MapView, { type MapMarker } from '../components/MapView';
import { useSocketForRide } from '../hooks/useSocketForRide';
import { api } from '../api/client';
import type { PoolItem, RiderStatusResponse, Subscription } from '../api/types';
import { Link } from 'react-router-dom';

export default function RiderHome() {
  const location = useLocationStore();
  const socket = useSocketStore();
  const ride = useRideStore();
  const [plan, setPlan] = useState<Subscription | null>(null);

  useSocketForRide();

  useEffect(() => {
    ride.refresh().catch(() => {});
    api<RiderStatusResponse>('/api/riders/status')
      .then((r) => setPlan(r.subscription))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep GPS on so the server can compute pool distances.
  useEffect(() => {
    location.startWatching();
    return () => location.stopWatching();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myPos = location.position;
  const active = ride.active;

  if (!plan) {
    return (
      <div className="min-h-screen bg-surface pb-24">
        <div className="max-w-md mx-auto px-4 pt-8">
          <EmptyState
            icon={<Radio size={26} />}
            title="You need a plan to see requests"
            body="Your rider account is verified — now choose a plan to start seeing nearby passengers."
            action={
              <Link to="/pricing" className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-xl px-5 py-3">
                See plans
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  // Active claim/ride takes over the screen.
  if (active) {
    return <ActiveRideView />;
  }

  return (
    <div className="min-h-screen bg-surface pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-extrabold text-ink tracking-tight">Rider radar</h1>
            <p className="text-sm text-ink/55">
              {plan.claimsCap === null
                ? `${plan.claimsUsed} claims used · unlimited plan`
                : `${plan.claimsUsed} of ${plan.claimsCap} claims used`}{' '}
              · {new Date(plan.expiresAt).toLocaleDateString()} expiry
            </p>
          </div>
          <Link to="/pricing" className="text-sm font-semibold text-emerald-800 hover:underline">
            Plans
          </Link>
        </header>

        {ride.error && (
          <div className="rounded-2xl bg-red-50 border border-red-100 text-red-800 text-sm font-medium px-4 py-3 mb-4">
            {ride.error}
          </div>
        )}

        <div className="imigongo-card rounded-3xl p-3 mb-4">
          <MapView
            height="300px"
            center={myPos}
            markers={usePoolMarkers(socket.pool)}
            myLocation={myPos}
            interactive
          />
        </div>

        {/* §3.2: anonymized pool — distance band + direction only */}
        <section className="imigongo-card rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-bold text-ink text-base">Passengers near you</h2>
            <span className="text-xs font-bold text-ink/40 bg-surface rounded-md px-2 py-0.5">
              {socket.pool.length}
            </span>
          </div>

          {!socket.poolKnown && (
            <p className="text-sm text-ink/50 flex items-center gap-2 py-4">
              <Clock3 size={16} className="animate-pulse text-emerald-700" />
              Waiting for your location so we can find nearby requests…
            </p>
          )}

          {socket.poolKnown && socket.pool.length === 0 && (
            <EmptyState
              icon={<Radio size={24} />}
              title="No ride requests near you yet"
              body="Requests appear here as passengers ask for rides within about 10 km of you."
            />
          )}

          <ul className="space-y-2">
            {socket.pool.map((item) => (
              <PoolRow key={item.id} item={item} busy={ride.loading && ride.lastAction === 'claim'} onClaim={() => ride.claim(item.id)} />
            ))}
          </ul>

          <p className="mt-4 text-xs text-ink/45 leading-relaxed">
            Marker positions are approximate (150–200 m) on purpose. Exact pickup points are only
            revealed to you after the passenger confirms you — this protects their privacy and
            yours.
          </p>
        </section>
      </div>
    </div>
  );
}

function usePoolMarkers(pool: PoolItem[]): MapMarker[] {
  return useMemo(
    () =>
      pool.map((p) => ({
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        label: `~${p.distanceBandM}m ${p.direction}`,
        tone: 'passenger' as const,
      })),
    [pool]
  );
}

function PoolRow({ item, busy, onClaim }: { item: PoolItem; busy: boolean; onClaim: () => void }) {
  return (
    <li className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-border hover:border-emerald-300 transition">
      <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
        <User size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-ink text-sm">
            ~{item.distanceBandM}m {item.direction}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink/50 mt-0.5">
          <span className="inline-flex items-center gap-1">
            <Compass size={12} /> {item.direction}
          </span>
          {item.destinationNote && <span className="truncate">{item.destinationNote}</span>}
          <span>{Math.round((Date.now() - new Date(item.createdAt).getTime()) / 60_000)} min ago</span>
        </div>
      </div>
      <Button variant="secondary" loading={busy} onClick={onClaim} className="shrink-0">
        Claim
      </Button>
    </li>
  );
}

/** Claimed → confirmed → en-route → arrived → no-show/complete. */
function ActiveRideView() {
  const ride = useRideStore();
  const socket = useSocketStore();
  const location = useLocationStore();
  const [showCancel, setShowCancel] = useState(false);
  const status = ride.active?.status;

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    if (ride.active && status !== 'CLAIMED') {
      out.push({ id: 'pickup', lat: ride.active.pickup.lat, lng: ride.active.pickup.lng, tone: 'pickup', label: 'Pickup point' });
    }
    if (location.position) {
      out.push({ id: 'me', lat: location.position.lat, lng: location.position.lng, tone: 'rider', label: 'You', pulse: true });
    }
    return out;
  }, [ride.active, status, location.position]);

  const arrived = status === 'ARRIVED';
  const [waitedSec, setWaitedSec] = useState(0);
  const arrivedAtRef = useRef<number>(Date.now());
  useEffect(() => {
    if (!arrived) return;
    arrivedAtRef.current = Date.now();
    const t = setInterval(() => setWaitedSec((Date.now() - arrivedAtRef.current) / 1000), 1_000);
    return () => clearInterval(t);
  }, [arrived]);

  const statusCopy: Record<string, { title: string; body: string }> = {
    CLAIMED: { title: 'Waiting for the passenger to confirm', body: 'They have 30 seconds to confirm you. Their exact pickup point appears here only after they confirm.' },
    CONFIRMED: { title: 'Passenger confirmed you', body: 'The exact pickup point is on the map. Head there and tap "I arrived" when you reach it.' },
    EN_ROUTE: { title: 'On your way', body: 'The passenger can see you arriving in real time.' },
    ARRIVED: { title: 'You are at the pickup point', body: 'If the passenger does not show up, you can report a no-show after 5 minutes.' },
  };

  const canNoShow = arrived && waitedSec >= 300;

  return (
    <div className="min-h-screen bg-surface pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-6">
        {ride.error && (
          <div className="rounded-2xl bg-red-50 border border-red-100 text-red-800 text-sm font-medium px-4 py-3 mb-4">
            {ride.error}
          </div>
        )}

        <div className="imigongo-card rounded-3xl p-3 mb-4">
          <MapView height="280px" center={location.position} markers={markers} myLocation={location.position} interactive={false} />
        </div>

        <section className="imigongo-card rounded-3xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-700 text-white flex items-center justify-center">
              <User size={20} />
            </div>
            <div>
              <h2 className="font-bold text-ink">{statusCopy[status ?? '']?.title ?? status}</h2>
              <p className="text-sm text-ink/55">{statusCopy[status ?? '']?.body ?? ''}</p>
            </div>
          </div>

          {ride.active?.passengerName && (
            <p className="text-sm text-ink/70 mb-3">
              Passenger: <strong>{ride.active.passengerName}</strong>
              {ride.active.destinationNote ? ` · Going to: ${ride.active.destinationNote}` : ''}
            </p>
          )}

          {status === 'CLAIMED' && ride.active && <ClaimCountdown requestId={ride.active.id} />}

          {status === 'CONFIRMED' && (
            <Button fullWidth loading={ride.loading} onClick={() => ride.riderAction(ride.active!.id, 'enroute')}>
              <Navigation size={18} /> Head to pickup
            </Button>
          )}

          {(status === 'CONFIRMED' || status === 'EN_ROUTE') && (
            <Button
              variant="outline"
              fullWidth
              className="mt-3"
              loading={ride.loading}
              onClick={() => ride.riderAction(ride.active!.id, 'arrived')}
            >
              <Bike size={18} /> I arrived at the pickup point
            </Button>
          )}

          {arrived && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-surface border border-border px-4 py-3">
                {!canNoShow ? (
                  <p className="text-sm text-ink/60 flex items-center gap-2">
                    <Clock3 size={16} className="text-amber-600" />
                    Waiting for the passenger · {Math.floor(waitedSec / 60)}:{String(Math.floor(waitedSec % 60)).padStart(2, '0')}
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-amber-800">
                    You have waited 5 minutes. You can report a no-show.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="secondary" disabled={!canNoShow} loading={ride.loading} onClick={() => ride.riderAction(ride.active!.id, 'no_show')}>
                  Passenger not here
                </Button>
                <Button loading={ride.loading} onClick={() => ride.riderAction(ride.active!.id, 'complete')}>
                  Complete ride
                </Button>
              </div>
            </div>
          )}

          {status !== 'CLAIMED' && (
            <Button variant="danger" fullWidth className="mt-4" onClick={() => setShowCancel(true)}>
              Cancel ride
            </Button>
          )}
        </section>

        {socket.riderLocation && status !== 'CLAIMED' && (
          <p className="text-xs text-ink/45 mt-3 text-center">
            Your live location is shared with the passenger until the ride ends.
          </p>
        )}

        <Modal open={showCancel} onClose={() => setShowCancel(false)} title="Cancel this ride?">
          <div className="space-y-4">
            <p className="text-sm text-ink/65">
              {status === 'CONFIRMED' || status === 'EN_ROUTE' || status === 'ARRIVED'
                ? 'Cancelling now counts against your reliability score. Three cancellations in 7 days pauses your claims for 24 hours.'
                : 'The claim is free to cancel — no penalty.'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => setShowCancel(false)}>Keep going</Button>
              <Button variant="danger" onClick={() => ride.riderAction(ride.active!.id, 'cancel').then(() => setShowCancel(false))}>
                Cancel ride
              </Button>
            </div>
          </div>
        </Modal>

        <RiderRateModal />
      </div>
    </div>
  );
}

function ClaimCountdown({ requestId }: { requestId: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const ev = useSocketStore((s) => s.requestEvents.find((e) => e.id === requestId && e.status === 'CLAIMED'));
  const deadline = (ev ? new Date(ev.at).getTime() : Date.now()) + 30_000;
  const seconds = Math.max(0, (deadline - now) / 1000);
  if (seconds <= 0) {
    return <p className="text-sm font-medium text-red-700">The passenger did not confirm in time. Your claim is free and the request is back on the map.</p>;
  }
  return <CountdownRing seconds={seconds} total={30} label="Waiting for passenger to confirm" />;
}

function RiderRateModal() {
  const ride = useRideStore();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const unrated = ride.unrated;

  const submit = async () => {
    if (!unrated || stars < 1) return;
    setBusy(true);
    try {
      await ride.rate(unrated.id, stars, comment.trim() || undefined);
    } finally {
      setBusy(false);
      setStars(0);
      setComment('');
    }
  };

  return (
    <Modal
      open={!!unrated}
      onClose={() => {}}
      title={`How was the ride with ${unrated?.otherName ?? 'your passenger'}?`}
      dismissible={false}
    >
      <div className="space-y-4">
        <p className="text-sm text-ink/60">Rate the passenger before claiming your next request.</p>
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} aria-label={`${n} stars`} onClick={() => setStars(n)} className="p-2 rounded-xl">
              <Star size={30} className={n <= stars ? 'text-amber-500 fill-amber-500' : 'text-ink/15'} />
            </button>
          ))}
        </div>
        <FormField label="Comment (optional)">
          <Input placeholder="How did it go?" value={comment} maxLength={280} onChange={(e) => setComment(e.target.value)} />
        </FormField>
        <Button fullWidth loading={busy} disabled={stars < 1} onClick={submit}>
          Submit rating
        </Button>
      </div>
    </Modal>
  );
}
