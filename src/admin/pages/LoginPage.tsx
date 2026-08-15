/**
 * Ops-console sign-in (admin spec §2.2, §2.3).
 *
 * Three states in one screen, because they are one flow:
 *   credentials → (enrol an authenticator, if the role requires 2FA and none
 *   exists yet) → enter the 6-digit code.
 *
 * Worth stating plainly, since the brief was "wired to byiringirinnocent8@…":
 * that address is the LOGIN NAME on one seeded row. It is an identifier, not a
 * credential. Having access to that inbox gets you a one-time setup link the
 * first time and nothing else, ever.
 */
import { useState } from 'react';
import { KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import { Button, CopyButton, Field, InfoNote, TextInput } from '../components/ui';
import { OpsApiError, opsApi, setAdminToken } from '../api';
import type { AdminRole } from '../types';
import { ImigongoBar } from '../../components/Imigongo';

interface LoginResponse {
  token: string;
  admin: { id: string; email: string; role: AdminRole };
  mfaRequired: boolean;
  mfaSetupRequired: boolean;
  enrolment?: { secret: string; otpauthUri: string; qrDataUrl: string };
}

type Stage = 'credentials' | 'enrol' | 'code';

export default function LoginPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [stage, setStage] = useState<Stage>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<LoginResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await opsApi<LoginResponse>('/auth/login', {
        method: 'POST',
        auth: false,
        body: { email, password },
      });
      setPending(res);
      if (res.mfaSetupRequired) {
        setStage('enrol');
      } else if (res.mfaRequired) {
        setStage('code');
      } else {
        setAdminToken(res.token);
        onAuthenticated();
      }
    } catch (err) {
      setError(err instanceof OpsApiError ? err.message : 'Could not sign in. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await opsApi('/auth/mfa', { method: 'POST', token: pending.token, body: { code } });
      setAdminToken(pending.token);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof OpsApiError ? err.message : 'That code was not accepted.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--ops-rail)]">
      <div className="w-full max-w-[400px]">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-lg bg-[#0b6e4f] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3 L21 12 L12 21 L3 12 Z" stroke="#fff" strokeWidth="1.6" />
              <path d="M12 8 L16 12 L12 16 L8 12 Z" fill="#fff" />
            </svg>
          </div>
          <div>
            <div className="text-[15px] font-bold text-white leading-tight">MotoConnect</div>
            <div className="text-[12px] text-slate-400 leading-tight">Operations console</div>
          </div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <ImigongoBar color="#0b6e4f" height={5} />
          <div className="p-5">
            {stage === 'credentials' ? (
              <form onSubmit={submitCredentials} className="space-y-3.5">
                <div className="flex items-center gap-2 mb-1">
                  <KeyRound size={16} className="text-slate-400" />
                  <h1 className="text-[14px] font-semibold text-slate-900">Sign in</h1>
                </div>
                <Field label="Email" required>
                  <TextInput
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    autoFocus
                    required
                  />
                </Field>
                <Field label="Password" required>
                  <TextInput
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </Field>
                {error ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
                    {error}
                  </div>
                ) : null}
                <Button type="submit" tone="primary" loading={busy} className="w-full">
                  Sign in
                </Button>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  New account? Use the one-time setup link that was emailed to it. There is no default
                  password on this system.
                </p>
              </form>
            ) : null}

            {stage === 'enrol' && pending?.enrolment ? (
              <div className="space-y-3.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-slate-400" />
                  <h1 className="text-[14px] font-semibold text-slate-900">Set up two-factor authentication</h1>
                </div>
                <InfoNote>
                  Two-factor is required for the <strong>{pending.admin.role.replace('_', ' ')}</strong> role. This
                  account can issue refunds and ban users — a password on its own is not enough.
                </InfoNote>
                <div className="flex justify-center">
                  <img
                    src={pending.enrolment.qrDataUrl}
                    alt="QR code for authenticator app enrolment"
                    className="rounded-lg border border-slate-200"
                    width={200}
                    height={200}
                  />
                </div>
                <div className="text-center">
                  <div className="text-[11px] text-slate-500 mb-0.5">Or enter this key manually</div>
                  <div className="ops-mono text-[12px] text-slate-800 break-all px-4">{pending.enrolment.secret}</div>
                  <CopyButton value={pending.enrolment.secret} label="Copy key" />
                </div>
                <Button tone="primary" className="w-full" onClick={() => setStage('code')}>
                  I have added it — enter a code
                </Button>
              </div>
            ) : null}

            {stage === 'code' ? (
              <form onSubmit={submitCode} className="space-y-3.5">
                <div className="flex items-center gap-2">
                  <Smartphone size={16} className="text-slate-400" />
                  <h1 className="text-[14px] font-semibold text-slate-900">Authenticator code</h1>
                </div>
                <Field label="6-digit code" hint="From your authenticator app. It changes every 30 seconds." required>
                  <TextInput
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="ops-mono tracking-[0.4em] text-center text-[16px]"
                    autoFocus
                    required
                  />
                </Field>
                {error ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
                    {error}
                  </div>
                ) : null}
                <Button type="submit" tone="primary" loading={busy} disabled={code.length !== 6} className="w-full">
                  Verify and continue
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setStage('credentials');
                    setPending(null);
                    setCode('');
                    setError(null);
                  }}
                  className="w-full text-[12px] text-slate-500 hover:text-slate-800"
                >
                  Start over
                </button>
              </form>
            ) : null}
          </div>
        </div>

        <p className="text-[11px] text-slate-500 mt-4 text-center leading-relaxed">
          Internal system. All sign-in attempts are logged with IP address and device.
        </p>
      </div>
    </div>
  );
}
