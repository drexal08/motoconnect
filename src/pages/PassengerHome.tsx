import { useEffect, useMemo, useState } from 'react';
import { Bike, MapPin, Navigation, Search, Star, X } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useLocationStore } from '../store/useLocationStore';
import { useSocketStore } from '../store/useSocketStore';
import { useRideStore } from '../store/useRideStore';
import { Button, CountdownRing, EmptyState, FormField, Input, Modal, Spinner } from '../components/ui';
import MapView, { type MapMarker } from '../components/MapView';
import ConsentGate from '../components/ConsentGate';
import RideProgress from '../components/RideProgress';
import { useSocketForRide } from '../hooks/useSocketForRide';
import { ApiError } from '../api/client';

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  VISIBLE: { title: 'Looking for a rider near you…', body: 'Riders see only your approximate distance. Your exact pickup point stays private until you confirm someone.' },
  CLAIMED: { title: 'A rider is on the way — confirm?', body: 'Confirm to show them your exact pickup point and start tracking their arrival.' },
  CONFIRMED: { title: 'Rider confirmed', body: 'They can see your exact pickup point now. Head there when ready.' },
  EN_ROUTE: { title: 'Rider is heading to you', body: 'Watch them arrive in real time.' },
  ARRIVED: { title: 'Your rider is here', body: 'Look for their bike and plate number.' },
};

export default function PassengerHome() {
  const auth = useAuthStore();
  const location = useLocationStore();
  const ride = useRideStore();
  const socket = useSocketStore();
  const [destinationNote, setDestinationNote] = useState('');
  const [showConsent, setShowConsent] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelWarning, setCancelWarning] = useState<string | null>(null);

  useSocketForRide();

  useEffect(() => {
    ride.refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (auth.user?.consent?.granted) {
      location.startWatching();
      setShowConsent(false);
    } else if (auth.user?.consent && !auth.user.consent.granted && auth.user.consent.reconfirmRequired) {
      setShowConsent(true);
    }
  }, [auth.user, location]);

  const myPos = location.position;

  const requestRide = async () => {
    if (!myPos) {
      if (!auth.user?.consent?.granted) {
        setShowConsent(true);
        return;
      }
      location.startWatching();
      return;
    }
    try {
      await ride.create(
        { lat: myPos.lat, lng: myPos.lng },
        { destinationNote: destinationNote.trim() || undefined, accuracyM: myPos.accuracyM }
      );
      setDestinationNote('');
    } catch (e) {
      if (e instanceof ApiError && e.code?.startsWith('LOCATION_CONSENT')) setShowConsent(true);
    }
  };

  const status = ride.active?.status ?? 'IDLE';

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    if (ride.active?.status === 'CONFIRMED' || ride.active?.status === 'EN_ROUTE') {
      out.push({ id: 'pickup', lat: ride.active.pickup.lat, lng: ride.active.pickup.lng, tone: 'pickup', label: 'Pickup' });
    }
    if (socket.riderLocation) {
      out.push({
        id: 'rider',
        lat: socket.riderLocation.lat,
        lng: socket.riderLocation.lng,
        tone: 'rider',
        label: 'Your rider',
        pulse: true,
      });
    }
    return out;
  }, [ride.active, socket.riderLocation]);

  const riderCenter = socket.riderLocation
    ? { lat: socket.riderLocation.lat, lng: socket.riderLocation.lng }
    : myPos
      ? { lat: myPos.lat, lng: myPos.lng }
      : null;

  return (
    <ConsentGate required={showConsent}>
      <div className="min-h-screen bg-surface pb-28">
        <div className="max-w-3xl mx-auto px-4 pt-6">
          <header className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-extrabold text-ink tracking-tight">
                {status === 'IDLE' ? `Muraho, ${auth.user?.name?.split(' ')[0] ?? ''}!` : 'Your ride'}
              </h1>
              <p className="text-sm text-ink-muted">Find a nearby moto rider.</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold">
              {auth.user?.name?.charAt(0) ?? '?'}
            </div>
          </header>

          {ride.error && (
            <div className="rounded-2xl bg-red-50 border border-red-100 text-red-800 text-sm font-medium px-4 py-3 mb-4 flex items-start gap-2">
              <span className="mt-0.5"><X size={16} /></span>
              <span className="flex-1">{ride.error}</span>
              <button onClick={() => ride.clear()} className="text-red-500 hover:text-red-700 font-bold">Dismiss</button>
            </div>
          )}

          {/* Map */}
          <div className="imigongo-card rounded-3xl p-3 mb-4">
            <MapView
              height="280px"
              center={riderCenter}
              markers={markers}
              myLocation={myPos}
              showMyLocation={status === 'IDLE' || status === 'VISIBLE'}
              interactive={status === 'IDLE'}
              onEmptyKey={() => (
                <div className="flex items-center justify-center h-full">
                  <EmptyState icon={<MapPin size={26} />} title="Live map" body="Riders see your request on their radar. Set your Maps key to see it here too." />
                </div>
              )}
            />
          </div>

          {status === 'IDLE' && <IdleView loading={ride.loading} myPos={myPos} locationError={location.error} destinationNote={destinationNote} onNote={setDestinationNote} onRequest={requestRide} />}

          {status === 'VISIBLE' && (
            <section className="imigongo-card rounded-3xl p-6 text-center">
              <Spinner label={STATUS_COPY.VISIBLE.title} />
              <p className="text-sm text-ink-muted max-w-sm mx-auto">{STATUS_COPY.VISIBLE.body}</p>
              <div className="mt-4 flex justify-center">
                <Button variant="danger" onClick={() => setShowCancelModal(true)}>Cancel request</Button>
              </div>
            </section>
          )}

          {status === 'CLAIMED' && ride.active && (
            <section className="imigongo-card rounded-3xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-700 text-white flex items-center justify-center">
                  <Bike size={26} />
                </div>
                <div className="flex-1">
                  <h2 className="font-bold text-ink text-lg leading-tight">{ride.active.rider?.name ?? 'A rider'}</h2>
                  <div className="flex items-center gap-3 mt-1 text-sm text-ink-muted">
                    <span className="font-semibold text-ink/80">Plate {ride.active.rider?.plate ?? '—'}</span>
                    {ride.active.rider?.rating != null && (
                      <span className="inline-flex items-center gap-1"><Star size={14} className="text-amber-500 fill-amber-500" /> {Number(ride.active.rider.rating).toFixed(1)}</span>
                    )}
                  </div>
                  <p className="text-sm text-ink-muted mt-1">This is the rider who wants to take you.</p>
                </div>
              </div>
              <div className="my-5">
                <ConfirmCountdown requestId={ride.active.id} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="secondary" onClick={() => setShowCancelModal(true)}>Not this one</Button>
                <Button loading={ride.loading && ride.lastAction === 'confirm'} onClick={() => ride.confirm(ride.active!.id)}>
                  Confirm — show my pickup
                </Button>
              </div>
            </section>
          )}

          {(status === 'CONFIRMED' || status === 'EN_ROUTE' || status === 'ARRIVED') && ride.active && (
            <>
              {/*
                The waiting screen. A passenger stands at the roadside watching
                this, so the timeline shows where the ride has got to rather
                than only naming the current state — and it announces each
                change, which a colour shift alone never did.
              */}
              <RideProgress
                status={status}
                riderName={ride.active.rider?.name}
                plate={ride.active.rider?.plate}
                className="mb-4"
              />
              <section className="imigongo-card rounded-3xl p-6">
              <p className="text-sm text-ink-muted mb-4">{STATUS_COPY[status]?.body}</p>
              {socket.riderLocation && (
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 mb-4">
                  <Navigation size={16} className="animate-pulse" />
                  Rider is moving — about{' '}
                  <span className="tabular-nums">{(socket.riderLocation.speed ?? 0).toFixed(0)} km/h</span>
                </div>
              )}
              {(status === 'CONFIRMED' || status === 'EN_ROUTE') && (
                <Button variant="danger" fullWidth onClick={() => setShowCancelModal(true)}>Cancel ride</Button>
              )}
              {status === 'ARRIVED' && (
                <p className="text-sm font-semibold text-emerald-800">Look for the bike — your rider is waiting at the pickup point.</p>
              )}
              </section>
            </>
          )}

          <CancelModal
            open={showCancelModal}
            reason={cancelReason}
            onReason={setCancelReason}
            onClose={() => setShowCancelModal(false)}
            onConfirm={async () => {
              if (!ride.active) return;
              const warning = await ride.cancelAsPassenger(ride.active.id, cancelReason || undefined);
              setShowCancelModal(false);
              setCancelReason('');
              if (warning) setCancelWarning(warning);
            }}
          />

          {cancelWarning && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-medium px-4 py-3 mb-4 flex items-start gap-2">
              <span className="flex-1">{cancelWarning}</span>
              <button onClick={() => setCancelWarning(null)} className="font-bold hover:underline">Dismiss</button>
            </div>
          )}

          <RateModal />
        </div>
      </div>
    </ConsentGate>
  );
}

function IdleView({
  loading,
  myPos,
  locationError,
  destinationNote,
  onNote,
  onRequest,
}: {
  loading: boolean;
  myPos: { lat: number; lng: number } | null;
  locationError: string | null;
  destinationNote: string;
  onNote: (v: string) => void;
  onRequest: () => void;
}) {
  return (
    <section className="imigongo-card rounded-3xl p-6">
      <h2 className="font-bold text-ink text-lg mb-1">Request a ride</h2>
      <p className="text-sm text-ink-muted mb-4">A rider near you will be asked to pick you up.</p>
      <div className="space-y-4">
        <FormField label="Going to (optional)" htmlFor="dest" hint="A short note helps the rider find you, e.g. 'Kimihurura, near the gas station'.">
          <Input
            id="dest"
            placeholder="Where are you going?"
            value={destinationNote}
            maxLength={120}
            onChange={(e) => onNote(e.target.value)}
          />
        </FormField>
        {locationError && <p className="text-sm font-medium text-amber-700">{locationError}</p>}
        {!myPos && !locationError && (
          <p className="text-sm text-ink-subtle flex items-center gap-2">
            <MapPin size={16} className="animate-pulse text-emerald-700" /> Getting your location…
          </p>
        )}
        <Button fullWidth loading={loading} onClick={onRequest} disabled={!myPos}>
          <Search size={18} /> Find me a rider
        </Button>
      </div>
    </section>
  );
}

function ConfirmCountdown({ requestId }: { requestId: string }) {
  const ride = useRideStore();
  const [now, setNow] = useState(Date.now());
  const deadline = useMemo(() => {
    const ev = useSocketStore.getState().requestEvents.find((e) => e.id === requestId && e.status === 'CLAIMED');
    return ev ? new Date(ev.at).getTime() + 30_000 : Date.now() + 30_000;
  }, [requestId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const seconds = Math.max(0, (deadline - now) / 1000);
  if (seconds <= 0) {
    // The claim expired — ride store picks up the VISIBLE event; nothing else to do.
    void ride;
    return <p className="text-sm font-medium text-red-700">This claim expired. Your request is back on the map.</p>;
  }
  return <CountdownRing seconds={seconds} total={30} label="Confirm within 30 seconds" />;
}

function CancelModal({
  open,
  reason,
  onReason,
  onClose,
  onConfirm,
}: {
  open: boolean;
  reason: string;
  onReason: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Cancel this ride?">
      <div className="space-y-4">
        <p className="text-sm text-ink/65">
          The rider may already be on their way. Cancelling often makes riders lose fuel and time.
        </p>
        <FormField label="Reason (optional)" htmlFor="cancel-reason">
          <Input id="cancel-reason" placeholder="e.g. I found another ride" value={reason} maxLength={200} onChange={(e) => onReason(e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={onClose}>Keep the ride</Button>
          <Button variant="danger" onClick={onConfirm}>Cancel ride</Button>
        </div>
      </div>
    </Modal>
  );
}

function RateModal() {
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
      title={`How was your ride with ${unrated?.otherName ?? 'your rider'}?`}
      dismissible={false}
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">Your rating is mandatory — you cannot request another ride until you finish it.</p>
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              aria-label={`${n} stars`}
              onClick={() => setStars(n)}
              className={`p-2 rounded-xl transition ${n <= stars ? 'text-amber-500' : 'text-ink/15'}`}
            >
              <Star size={30} className={n <= stars ? 'fill-amber-500' : ''} />
            </button>
          ))}
        </div>
        <FormField label="Comment (optional)">
          <Input placeholder="Tell us how it went" value={comment} maxLength={280} onChange={(e) => setComment(e.target.value)} />
        </FormField>
        <Button fullWidth loading={busy} disabled={stars < 1} onClick={submit}>
          Submit rating
        </Button>
      </div>
    </Modal>
  );
}
