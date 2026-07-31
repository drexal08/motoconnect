import { useState } from 'react';
import { MapPin, Phone, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useLocationStore } from '../store/useLocationStore';
import { Button } from '../components/ui';
import { Link } from 'react-router-dom';

/** §3.3 — location consent lifecycle: grant, revoke, re-confirm. */
export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const location = useLocationStore();
  const [grantBusy, setGrantBusy] = useState(false);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const grant = async () => {
    setGrantBusy(true);
    try {
      const ok = await location.grantConsent();
      if (ok) {
        await useAuthStore.getState().refreshMe();
        setFlash('Consent recorded. Location sharing is on while you have an active ride.');
      }
    } catch {
      setFlash('We could not record consent. Try again.');
    } finally {
      setGrantBusy(false);
    }
  };

  const revoke = async () => {
    setRevokeBusy(true);
    try {
      await location.revokeConsent();
      await useAuthStore.getState().refreshMe();
      setFlash('Location sharing turned off. We keep nothing after you revoke.');
    } catch {
      setFlash('We could not turn off location sharing. Try again.');
    } finally {
      setRevokeBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface pb-24">
      <div className="max-w-md mx-auto px-4 pt-8 space-y-4">
        <h1 className="text-2xl font-extrabold text-ink tracking-tight">Settings</h1>

        {flash && <p className="rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-sm font-medium px-4 py-3">{flash}</p>}

        <section className="imigongo-card rounded-3xl p-5">
          <h2 className="font-bold text-ink mb-1">Account</h2>
          <div className="flex items-center gap-3 text-sm text-ink/70">
            <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Phone size={16} />
            </div>
            <div>
              <p className="font-semibold">{user?.name}</p>
              <p>{user?.phone}</p>
            </div>
          </div>
        </section>

        <section className="imigongo-card rounded-3xl p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <MapPin size={16} />
              </div>
              <div>
                <h2 className="font-bold text-ink text-sm">Location sharing</h2>
                <p className="text-xs text-ink/55">Used only while you have an active ride.</p>
              </div>
            </div>
            <span
              className={
                'text-xs font-bold rounded-full px-3 py-1 ' +
                (location.watching ? 'bg-emerald-100 text-emerald-800' : 'bg-ink/10 text-ink/55')
              }
            >
              {location.watching ? 'ON' : 'OFF'}
            </span>
          </div>
          {location.error && <p className="text-xs text-red-700 mt-2">{location.error}</p>}
          {user?.consent.reconfirmRequired && (
            <p className="rounded-2xl bg-amber-50 border border-amber-100 text-amber-800 text-sm font-medium px-4 py-3 mt-3">
              Your consent expired. Please confirm again to keep sharing your location.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <Button variant="outline" loading={revokeBusy} disabled={!location.watching} onClick={revoke}>
              <Trash2 size={16} /> Revoke
            </Button>
            <Button variant="secondary" loading={grantBusy} disabled={!user?.consent.reconfirmRequired && location.watching} onClick={grant}>
              Re-confirm
            </Button>
          </div>
        </section>

        <section className="imigongo-card rounded-3xl p-5 space-y-2">
          <h2 className="font-bold text-ink text-sm">About</h2>
          <div className="flex items-center gap-2 text-sm text-ink/70">
            <ShieldCheck size={16} className="text-emerald-700 shrink-0" />
            <Link to="/privacy" className="hover:underline">Privacy policy</Link>
          </div>
          <div className="flex items-center gap-2 text-sm text-ink/70">
            <ShieldCheck size={16} className="text-emerald-700 shrink-0" />
            <Link to="/terms" className="hover:underline">Terms of service</Link>
          </div>
          <p className="text-xs text-ink/40 pt-2">MotoConnect v0.2.0</p>
        </section>
      </div>
    </div>
  );
}
