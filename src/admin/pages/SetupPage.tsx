/**
 * First-login password-set flow (admin spec §2.2).
 *
 * Reached from the one-time link emailed to a new admin account. Until this
 * completes, `password_hash` is NULL server-side and the account cannot
 * authenticate at all — there is no default password to fall back to.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { Button, Field, InfoNote, TextInput } from '../components/ui';
import { OpsApiError, opsApi } from '../api';
import { ImigongoBar } from '../../components/Imigongo';

const MIN_LENGTH = 12;

export default function SetupPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Mirrors the server's rule exactly: length first, no composition theatre.
  const problems = useMemo(() => {
    const list: string[] = [];
    if (password.length && password.length < MIN_LENGTH) list.push(`At least ${MIN_LENGTH} characters.`);
    if (password.length && new Set(password).size < 5) list.push('Use more variety than a repeated character.');
    if (confirm.length && confirm !== password) list.push('Both entries must match.');
    return list;
  }, [password, confirm]);

  const canSubmit = password.length >= MIN_LENGTH && confirm === password && problems.length === 0 && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await opsApi('/auth/setup', { method: 'POST', auth: false, body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(err instanceof OpsApiError ? err.message : 'Could not set the password. Ask for a new link.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--ops-rail)]">
      <div className="w-full max-w-[420px]">
        <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <ImigongoBar color="#0b6e4f" height={5} />
          <div className="p-5">
            {done ? (
              <div className="text-center space-y-3 py-3">
                <CheckCircle2 size={34} className="mx-auto text-[#0b6e4f]" />
                <h1 className="text-[15px] font-semibold text-slate-900">Password set</h1>
                <p className="text-[12px] text-slate-600">
                  Sign in with it now. You will be asked to set up an authenticator app on the way in.
                </p>
                <Button tone="primary" className="w-full" onClick={() => navigate('/')}>
                  Go to sign in
                </Button>
              </div>
            ) : !token ? (
              <div className="space-y-3">
                <h1 className="text-[14px] font-semibold text-slate-900">Setup link missing</h1>
                <p className="text-[12px] text-slate-600">
                  Open the link exactly as it was emailed — it carries a one-time token that this page needs.
                </p>
                <Button tone="neutral" className="w-full" onClick={() => navigate('/')}>
                  Back to sign in
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3.5">
                <div className="flex items-center gap-2 mb-1">
                  <KeyRound size={16} className="text-slate-400" />
                  <h1 className="text-[14px] font-semibold text-slate-900">Choose your password</h1>
                </div>
                <InfoNote>
                  Length beats symbols. A memorable passphrase of four or five words is stronger than a short
                  password with punctuation in it.
                </InfoNote>
                <Field label="New password" required hint={`Minimum ${MIN_LENGTH} characters.`}>
                  <TextInput
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    autoFocus
                    required
                  />
                </Field>
                <Field
                  label="Confirm password"
                  required
                  error={confirm.length && confirm !== password ? 'Both entries must match.' : null}
                >
                  <TextInput
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </Field>
                {problems.length ? (
                  <ul className="text-[11px] text-slate-600 list-disc pl-4 space-y-0.5">
                    {problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                ) : null}
                {error ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
                    {error}
                  </div>
                ) : null}
                <Button type="submit" tone="primary" loading={busy} disabled={!canSubmit} className="w-full">
                  Set password
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
