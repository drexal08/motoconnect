/**
 * Settings — admin account management (admin spec §2.1, super_admin only).
 *
 * This screen is the proof that §2.1 was honoured. Adding a support or
 * finance_ops operator is filling in an email and picking a role: no code
 * change, no redeploy, no hardcoded account anywhere. The roles were defined at
 * launch precisely so that this stayed a data-entry task.
 *
 * No password is ever chosen on someone else's behalf here either — a new
 * account gets a one-time setup link, exactly like the seed super_admin did.
 */
import { useState } from 'react';
import { KeyRound, Mail, ShieldOff, UserPlus } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CopyButton,
  ErrorNote,
  Field,
  InfoNote,
  Modal,
  SectionTitle,
  Select,
  Spinner,
  TextInput,
  useToast,
} from '../components/ui';
import { GatedActionDialog } from '../components/GatedAction';
import { useQuery } from '../hooks';
import { fmtDateTime } from '../format';
import { opsApi } from '../api';
import type { AdminAccount, AdminRole, AdminSession } from '../types';

const ROLE_OPTIONS: { value: AdminRole; label: string; blurb: string }[] = [
  { value: 'super_admin', label: 'Super admin', blurb: 'Full access. The only role that can manage admin accounts.' },
  { value: 'support', label: 'Support', blurb: 'View-only on rides, users and disputes. Cannot touch payments or verification decisions.' },
  { value: 'finance_ops', label: 'Finance ops', blurb: 'Payments, subscriptions and refunds. Cannot touch verification or bans.' },
];

export default function SettingsPage({ session }: { session: AdminSession }) {
  const toast = useToast();
  const query = useQuery<{ admins: AdminAccount[]; roles: AdminRole[] }>('/admins');
  const [creating, setCreating] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [action, setAction] = useState<{ kind: 'suspend' | 'activate' | 'resetMfa' | 'resend'; admin: AdminAccount } | null>(null);
  const [createdLink, setCreatedLink] = useState<{ email: string; link: string | null; delivered: boolean } | null>(null);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[17px] font-bold text-slate-900">Settings</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">Admin accounts and your own credentials.</p>
        </div>
        <div className="flex gap-2">
          <Button tone="neutral" icon={<KeyRound size={13} />} onClick={() => setChangingPassword(true)}>
            Change my password
          </Button>
          <Button tone="primary" icon={<UserPlus size={13} />} onClick={() => setCreating(true)}>
            Add admin
          </Button>
        </div>
      </header>

      <InfoNote>
        Roles are stored on the account row, not in code. Adding a second operator is filling in this form —
        there is nothing to change and redeploy. Two-factor authentication is mandatory for super admin and
        finance ops, and optional for support.
      </InfoNote>

      <Card pad={false}>
        <div className="px-4 pt-4">
          <SectionTitle hint="An account cannot sign in until its holder sets a password from their one-time link.">
            Admin accounts
          </SectionTitle>
        </div>
        {query.error ? (
          <div className="p-3"><ErrorNote message={query.error} onRetry={query.reload} /></div>
        ) : query.initialLoading ? (
          <Spinner />
        ) : (
          <div className="ops-table-wrap ops-scroll">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Password</th>
                  <th>2FA</th>
                  <th>Sessions</th>
                  <th>Last sign-in</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {query.data!.admins.map((a) => (
                  <tr key={a.id}>
                    <td className="font-medium text-slate-900">
                      {a.email}
                      {a.id === session.id ? <span className="text-[11px] text-slate-400 ml-1.5">(you)</span> : null}
                    </td>
                    <td>
                      <Badge tone={a.role === 'super_admin' ? 'violet' : a.role === 'finance_ops' ? 'blue' : 'neutral'}>
                        {a.role.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td><Badge tone={a.status === 'active' ? 'green' : 'red'}>{a.status}</Badge></td>
                    <td>
                      {a.passwordSet ? (
                        <Badge tone="green">set</Badge>
                      ) : (
                        <Badge tone="amber" title={a.setupTokenExpiresAt ? `Link expires ${fmtDateTime(a.setupTokenExpiresAt)}` : undefined}>
                          awaiting setup
                        </Badge>
                      )}
                    </td>
                    <td>{a.mfaEnabled ? <Badge tone="green">on</Badge> : <Badge tone="amber">off</Badge>}</td>
                    <td className="ops-num text-slate-600">{a.activeSessions}</td>
                    <td className="text-slate-600 whitespace-nowrap">{fmtDateTime(a.lastLoginAt)}</td>
                    <td className="text-right whitespace-nowrap">
                      <div className="inline-flex gap-1">
                        {!a.passwordSet ? (
                          <Button size="sm" tone="ghost" icon={<Mail size={12} />} onClick={() => setAction({ kind: 'resend', admin: a })}>
                            Resend link
                          </Button>
                        ) : null}
                        {a.mfaEnabled ? (
                          <Button size="sm" tone="ghost" icon={<ShieldOff size={12} />} onClick={() => setAction({ kind: 'resetMfa', admin: a })}>
                            Reset 2FA
                          </Button>
                        ) : null}
                        {a.id !== session.id ? (
                          a.status === 'active' ? (
                            <Button size="sm" tone="ghost" onClick={() => setAction({ kind: 'suspend', admin: a })}>
                              Suspend
                            </Button>
                          ) : (
                            <Button size="sm" tone="ghost" onClick={() => setAction({ kind: 'activate', admin: a })}>
                              Reactivate
                            </Button>
                          )
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle hint="What each role can and cannot do. Defined at launch so the second admin is a data change.">
          Role permissions
        </SectionTitle>
        <ul className="space-y-2">
          {ROLE_OPTIONS.map((r) => (
            <li key={r.value} className="flex gap-3 text-[12px]">
              <Badge tone={r.value === 'super_admin' ? 'violet' : r.value === 'finance_ops' ? 'blue' : 'neutral'}>
                {r.label}
              </Badge>
              <span className="text-slate-600">{r.blurb}</span>
            </li>
          ))}
        </ul>
      </Card>

      {creating ? (
        <CreateAdminDialog
          onCancel={() => setCreating(false)}
          onCreated={(result) => {
            setCreating(false);
            setCreatedLink(result);
            query.reload();
          }}
        />
      ) : null}

      {changingPassword ? <ChangePasswordDialog onClose={() => setChangingPassword(false)} /> : null}

      {createdLink ? (
        <Modal open title="Admin account created" onClose={() => setCreatedLink(null)}>
          <div className="space-y-3 text-[13px]">
            <p>
              <strong>{createdLink.email}</strong> can now set their own password.
            </p>
            {createdLink.delivered ? (
              <InfoNote>The setup link was emailed to them. It can be used once and expires in 24 hours.</InfoNote>
            ) : (
              <>
                <InfoNote tone="amber">
                  The email could not be sent, so nothing has reached them. Give them this link another way —
                  it is the only way into the account, and no password exists until they use it.
                </InfoNote>
                {createdLink.link ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <div className="ops-mono text-[11px] text-slate-700 break-all">{createdLink.link}</div>
                    <div className="mt-1.5"><CopyButton value={createdLink.link} label="Copy link" /></div>
                  </div>
                ) : null}
              </>
            )}
            <div className="flex justify-end">
              <Button tone="primary" onClick={() => setCreatedLink(null)}>Done</Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {action ? (
        <GatedActionDialog
          open
          title={
            action.kind === 'suspend'
              ? `Suspend ${action.admin.email}`
              : action.kind === 'activate'
                ? `Reactivate ${action.admin.email}`
                : action.kind === 'resetMfa'
                  ? `Reset 2FA for ${action.admin.email}`
                  : `Send a new setup link to ${action.admin.email}`
          }
          tone={action.kind === 'suspend' ? 'danger' : action.kind === 'activate' ? 'primary' : 'warn'}
          confirmLabel={
            action.kind === 'suspend' ? 'Suspend account'
              : action.kind === 'activate' ? 'Reactivate account'
                : action.kind === 'resetMfa' ? 'Reset authenticator'
                  : 'Send link'
          }
          description={
            action.kind === 'suspend'
              ? 'All of their sessions end immediately and they cannot sign in again until reactivated.'
              : action.kind === 'activate'
                ? 'They will be able to sign in again with their existing password and authenticator.'
                : action.kind === 'resetMfa'
                  ? 'Their authenticator is cleared and every session ends. They will enrol a new one at their next sign-in — only do this if you have confirmed who you are talking to.'
                  : 'A fresh one-time link is issued. Any previous link stops working.'
          }
          freetextLabel="Why?"
          onCancel={() => setAction(null)}
          onConfirm={async ({ reasonFreetext }) => {
            const { kind, admin } = action;
            if (kind === 'resend') {
              const res = await opsApi<{ delivered: boolean; setupLink: string | null; email: string }>(
                `/admins/${admin.id}/resend-setup`,
                { method: 'POST', body: { reasonFreetext } }
              );
              setCreatedLink({ email: res.email, link: res.setupLink, delivered: res.delivered });
            } else if (kind === 'resetMfa') {
              await opsApi(`/admins/${admin.id}/reset-mfa`, { method: 'POST', body: { reasonFreetext } });
              toast.push('success', 'Authenticator reset.');
            } else {
              await opsApi(`/admins/${admin.id}/status`, {
                method: 'POST',
                body: { status: kind === 'suspend' ? 'suspended' : 'active', reasonFreetext },
              });
              toast.push('success', kind === 'suspend' ? 'Admin suspended.' : 'Admin reactivated.');
            }
            setAction(null);
            query.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function CreateAdminDialog({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (result: { email: string; link: string | null; delivered: boolean }) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('support');

  return (
    <GatedActionDialog
      open
      title="Add an admin account"
      tone="primary"
      confirmLabel="Create account"
      description="The account is created with no password. A one-time setup link is emailed so they choose their own."
      freetextLabel="Why is this account being created?"
      extraFields={
        <div className="space-y-3">
          <Field label="Email address" required hint="This is their login identifier, not a credential.">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Role" required hint={ROLE_OPTIONS.find((r) => r.value === role)?.blurb}>
            <Select value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </Field>
        </div>
      }
      onCancel={onCancel}
      onConfirm={async ({ reasonFreetext }) => {
        const res = await opsApi<{ email: string; delivered: boolean; setupLink: string | null }>('/admins', {
          method: 'POST',
          body: { email, role, reasonFreetext },
        });
        onCreated({ email: res.email, link: res.setupLink, delivered: res.delivered });
      }}
    />
  );
}

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ok = current.length > 0 && next.length >= 12 && next === confirm;

  return (
    <Modal open title="Change your password" onClose={onClose}>
      <form
        className="space-y-3.5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ok) return;
          setBusy(true);
          setError(null);
          try {
            await opsApi('/auth/password', {
              method: 'POST',
              body: { currentPassword: current, newPassword: next },
            });
            toast.push('success', 'Password changed. Sign in again with the new one.');
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not change the password.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <InfoNote>Changing your password ends every one of your sessions, including this one.</InfoNote>
        <Field label="Current password" required>
          <TextInput type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="New password" required hint="At least 12 characters. A passphrase beats punctuation.">
          <TextInput type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field
          label="Confirm new password"
          required
          error={confirm.length > 0 && confirm !== next ? 'Both entries must match.' : null}
        >
          <TextInput type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <Button tone="ghost" onClick={onClose} type="button">Cancel</Button>
          <Button tone="primary" type="submit" disabled={!ok} loading={busy}>Change password</Button>
        </div>
      </form>
    </Modal>
  );
}
