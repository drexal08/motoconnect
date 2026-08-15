import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, ShieldCheck } from 'lucide-react';
import { Button, Modal } from './ui';
import { useLocationStore } from '../store/useLocationStore';

/**
 * §3.3 — two-step consent. Screen 1 explains what/why in plain English with a
 * link to the Privacy Policy. Only then is the OS prompt (geolocation) shown.
 * Re-confirmation after 90 days is enforced server-side (the API returns
 * LOCATION_CONSENT_REFRESH_REQUIRED, mapped here to the same screen).
 */
export default function ConsentGate({ children, required = false }: { children: ReactNode; required?: boolean }) {
  const location = useLocationStore();
  const [open, setOpen] = useState(required);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (required) setOpen(true);
  }, [required]);

  const agree = async () => {
    setBusy(true);
    setError(null);
    const ok = await location.grantConsent();
    setBusy(false);
    if (ok) {
      location.startWatching();
      setOpen(false);
    }
  };

  return (
    <>
      {children}
      <Modal open={open} onClose={() => {}} title="Share your location?" dismissible={false}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
            <MapPin size={22} className="text-emerald-700 shrink-0 mt-0.5" />
            <div className="text-sm text-ink/80 space-y-1.5">
              <p>
                MotoConnect needs your location to find you a nearby rider.
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Riders only see your <strong>approximate</strong> distance and direction — never your exact address.</li>
                <li>Your exact pickup point is shared with one rider only, and only after <strong>you</strong> confirm them.</li>
                <li>Exact trip locations are deleted after 90 days.</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-ink-subtle">
            Read the full{' '}
            <Link to="/privacy" className="text-emerald-800 font-semibold underline">
              Privacy Policy
            </Link>{' '}
            before you decide. You can turn location sharing off anytime in Settings.
          </p>
          {error && <p className="text-sm font-medium text-red-700">{error}</p>}
          <Button fullWidth loading={busy} onClick={agree}>
            <ShieldCheck size={18} /> I understand — share my location
          </Button>
        </div>
      </Modal>
    </>
  );
}
