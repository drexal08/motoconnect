import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { Button, FormField, Input } from './ui';
import { useAuthStore } from '../store/useAuthStore';

/**
 * Atomic phone→OTP flow, shared by both signup flows and login (§4: only
 * atomic-level inputs are shared; each page composes its own form).
 * In dev builds the server returns devCode, which is shown to keep the
 * flow testable without an SMS gateway.
 */
export default function PhoneOtpForm({
  nextUrl,
  onVerified,
  submitLabel = 'Send code',
  verifyBody,
}: {
  nextUrl: string;
  /** Awaited before navigating, so follow-up work (e.g. creating the rider
   *  profile) has finished before the next screen tries to read it. */
  onVerified?: (token: string, phone: string) => void | Promise<void>;
  submitLabel?: string;
  /** Extra fields merged into the verify-otp request (name + terms on signup). */
  verifyBody?: Record<string, unknown>;
}) {
  const signIn = useAuthStore((s) => s.signIn);
  const navigate = useNavigate();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendCode = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ devCode?: string }>('/api/auth/request-otp', {
        method: 'POST',
        auth: false,
        body: { phone },
      });
      if (res.devCode) setDevCode(res.devCode);
      setStep('code');
      setResendIn(60);
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ token: string; user: { role: string; name: string } }>('/api/auth/verify-otp', {
        method: 'POST',
        auth: false,
        body: { phone, code, ...(verifyBody ?? {}) },
      });
      signIn(res.token, {
        id: '',
        phone,
        name: res.user.name,
        role: res.user.role as 'passenger' | 'rider',
        consent: { granted: false, reconfirmRequired: false },
      });
      // Pull the full profile (incl. consent + rider verification status).
      void useAuthStore.getState().refreshMe();
      await onVerified?.(res.token, phone);
      navigate(nextUrl, { replace: true });
    } catch (e) {
      const err = e as ApiError;
      setError(err.message || 'Wrong code. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'phone') {
    return (
      <div className="space-y-4">
        <FormField label="Phone Number" htmlFor="phone" hint="Example: 0788123456 or +250788123456">
          <Input
            id="phone"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0788 123 456"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </FormField>
        {error && <p className="text-sm font-medium text-red-700">{error}</p>}
        <Button fullWidth loading={busy} onClick={sendCode} disabled={phone.trim().length < 9}>
          {submitLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-ink-muted">
          We sent a 6-digit code to <strong className="text-ink">{phone}</strong>.
        </p>
        {devCode && (
          <p className="mt-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            Dev mode: your code is <strong>{devCode}</strong> (no SMS gateway is configured yet).
          </p>
        )}
      </div>
      <FormField label="Enter the code" htmlFor="otp">
        <Input
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6-digit code"
          value={code}
          maxLength={6}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
      </FormField>
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      <Button fullWidth loading={busy} onClick={verify} disabled={code.length !== 6}>
        Verify code
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button onClick={() => setStep('phone')} className="text-emerald-800 font-semibold hover:underline">
          Change number
        </button>
        {resendIn > 0 ? (
          <span className="text-ink-subtle">Resend in {resendIn}s</span>
        ) : (
          <button onClick={sendCode} className="text-emerald-800 font-semibold hover:underline" disabled={busy}>
            Resend code
          </button>
        )}
      </div>
    </div>
  );
}
