/**
 * User detail (admin spec §6.2, §6.3, §5.3).
 *
 * The screen where the minor/destructive split is visible rather than implied:
 *
 *   Left column  — name, phone and internal notes, edited inline and saved
 *                  directly (§6.3 direct-edit bucket).
 *   Right column — suspend, ban, verification override, quota adjustment. Each
 *                  one opens the gated dialog: confirm, reason, audit.
 *
 * §5.3 is honoured below the score: the reliability number is shown with the
 * cancellation and no-show events that produced it, so a suspension decision
 * rests on evidence rather than trust in a black box.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  Gavel,
  History,
  PauseCircle,
  PlayCircle,
  Save,
  ShieldQuestion,
  Star,
} from 'lucide-react';
import {
  AccountStatusBadge,
  Badge,
  Button,
  Card,
  ErrorNote,
  Field,
  InfoNote,
  KeyValue,
  RideStatusBadge,
  SectionTitle,
  Select,
  Spinner,
  TextArea,
  TextInput,
  VerificationBadge,
  useToast,
} from '../components/ui';
import { GatedActionDialog } from '../components/GatedAction';
import { useQuery } from '../hooks';
import { fmtDate, fmtDateTime, fmtNumber, humanize } from '../format';
import { opsApi } from '../api';
import type { UserDetail } from '../types';

/** §6.2 — the moderation reason-code enum, shared with the server. */
const MODERATION_CODES = [
  { value: 'no_show_abuse', label: 'Repeated no-shows' },
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'unsafe_riding', label: 'Unsafe riding' },
  { value: 'fraud', label: 'Fraud' },
  { value: 'document_fraud', label: 'Fraudulent documents' },
  { value: 'repeated_cancellations', label: 'Repeated cancellations' },
  { value: 'other', label: 'Other (explain below)' },
];

const VERIFICATION_STATES = [
  { value: 'verified', label: 'Verified — can claim rides' },
  { value: 'pending_verification', label: 'Pending — back into the queue' },
  { value: 'rejected', label: 'Rejected — cannot claim rides' },
];

type Dialog = 'suspend' | 'ban' | 'reinstate' | 'warn' | 'verification' | 'quota' | null;

export default function UserDetailPage() {
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const query = useQuery<UserDetail>(`/users/${userId}`);
  const [dialog, setDialog] = useState<Dialog>(null);

  const user = query.data;

  if (query.initialLoading) return <Spinner label="Loading account…" />;
  if (query.error) return <ErrorNote message={query.error} onRetry={query.reload} />;
  if (!user) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="sm" tone="ghost" icon={<ArrowLeft size={14} />} onClick={() => navigate('/users')}>
          Users
        </Button>
      </div>

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[17px] font-bold text-slate-900">{user.name}</h1>
            <AccountStatusBadge status={user.accountStatus} />
            <Badge tone={user.role === 'rider' ? 'violet' : 'neutral'}>{user.role}</Badge>
            {user.reviewFlag ? <Badge tone="amber">flagged for review</Badge> : null}
          </div>
          <p className="ops-mono text-[12px] text-slate-600 mt-0.5">{user.phone}</p>
        </div>

        {/* §6.3 gated bucket — every one of these opens a confirmation with a reason. */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button tone="neutral" icon={<Gavel size={13} />} onClick={() => setDialog('warn')}>
            Warn
          </Button>
          {user.accountStatus === 'active' ? (
            <>
              <Button tone="warn" icon={<PauseCircle size={13} />} onClick={() => setDialog('suspend')}>
                Suspend
              </Button>
              <Button tone="danger" icon={<Ban size={13} />} onClick={() => setDialog('ban')}>
                Ban
              </Button>
            </>
          ) : (
            <Button tone="primary" icon={<PlayCircle size={13} />} onClick={() => setDialog('reinstate')}>
              Reinstate
            </Button>
          )}
        </div>
      </header>

      {user.accountStatus !== 'active' ? (
        <InfoNote tone="amber">
          <strong>{user.accountStatus === 'banned' ? 'Banned' : 'Suspended'}</strong>
          {user.suspendedUntil ? ` until ${fmtDateTime(user.suspendedUntil)}` : ''} — “{user.statusReason}”. This
          account cannot sign in to the consumer app.
        </InfoNote>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-3 items-start">
        <div className="space-y-3">
          <BasicsCard user={user} onSaved={query.reload} />

          <Card>
            <SectionTitle hint="Counts across the whole account history.">Activity</SectionTitle>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <KeyValue label="Completed rides">{fmtNumber(user.counts.completed)}</KeyValue>
              <KeyValue label="No-shows">{fmtNumber(user.counts.no_shows)}</KeyValue>
              <KeyValue label="Cancelled (as passenger)">{fmtNumber(user.counts.passenger_cancels)}</KeyValue>
              <KeyValue label="Cancelled (as rider)">{fmtNumber(user.counts.rider_cancels)}</KeyValue>
              <KeyValue label="Joined">{fmtDate(user.createdAt)}</KeyValue>
              <KeyValue label="Location consent">{user.consent.granted ? 'Granted' : 'Not granted'}</KeyValue>
            </dl>
          </Card>

          {user.rider ? <RiderCard user={user} onOverride={() => setDialog('verification')} /> : null}
        </div>

        <div className="space-y-3">
          {user.rider ? <ReliabilityCard user={user} /> : null}

          {user.subscriptions.length ? (
            <Card pad={false}>
              <div className="px-4 pt-4">
                <SectionTitle
                  hint="Manual quota changes are gated — they are effectively giving away product."
                  right={
                    <Button size="sm" tone="neutral" onClick={() => setDialog('quota')}>
                      Adjust plan
                    </Button>
                  }
                >
                  Subscriptions
                </SectionTitle>
              </div>
              <div className="ops-table-wrap ops-scroll">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Tier</th>
                      <th>Claims</th>
                      <th>Status</th>
                      <th>Started</th>
                      <th>Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {user.subscriptions.map((s) => (
                      <tr key={s.id}>
                        <td className="font-medium capitalize">{s.tier}</td>
                        <td className="ops-num">
                          {s.claimsUsed}
                          {s.claimsCap === null ? ' / ∞' : ` / ${s.claimsCap}`}
                        </td>
                        <td>
                          <Badge tone={s.status === 'active' ? 'green' : 'neutral'}>{s.status}</Badge>
                        </td>
                        <td className="text-slate-600 whitespace-nowrap">{fmtDate(s.startsAt)}</td>
                        <td className="text-slate-600 whitespace-nowrap">{fmtDateTime(s.expiresAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          <Card pad={false}>
            <div className="px-4 pt-4">
              <SectionTitle hint="Most recent 25 rides on this account.">Ride history</SectionTitle>
            </div>
            {user.rides.length === 0 ? (
              <p className="px-4 pb-4 text-[12px] text-slate-500">No rides yet.</p>
            ) : (
              <div className="ops-table-wrap ops-scroll max-h-[320px] overflow-y-auto">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Status</th>
                      <th>Acting as</th>
                      <th>Counterparty</th>
                      <th>Destination note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {user.rides.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap text-slate-600">{fmtDateTime(r.createdAt)}</td>
                        <td>
                          <RideStatusBadge status={r.status} />
                        </td>
                        <td className="text-slate-600">{r.role}</td>
                        <td className="text-slate-900">{r.counterparty ?? '—'}</td>
                        <td className="text-slate-500 max-w-[220px] truncate">{r.destinationNote ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <RatingsCard user={user} />

          {user.strikes.length ? (
            <Card>
              <SectionTitle hint="Warnings issued from the dispute queue.">Strikes</SectionTitle>
              <ul className="space-y-1.5">
                {user.strikes.map((s) => (
                  <li key={s.id} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[12px]">
                    <div className="flex items-center gap-2">
                      <Badge tone="amber">{humanize(s.reason_code)}</Badge>
                      <span className="text-slate-500 ml-auto">{fmtDateTime(s.created_at)}</span>
                    </div>
                    <p className="mt-1 text-slate-800">{s.note}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">by {s.admin_email ?? 'an admin'}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card pad={false}>
            <div className="px-4 pt-4">
              <SectionTitle hint="Every admin action ever taken on this account.">
                <span className="inline-flex items-center gap-1.5">
                  <History size={13} /> Admin trail
                </span>
              </SectionTitle>
            </div>
            {user.adminTrail.length === 0 ? (
              <p className="px-4 pb-4 text-[12px] text-slate-500">No admin actions recorded.</p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[280px] overflow-y-auto ops-scroll">
                {user.adminTrail.map((a) => (
                  <li key={a.id} className="px-4 py-2.5 text-[12px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone="neutral">{humanize(a.actionType)}</Badge>
                      {a.reasonCode ? <span className="text-slate-500">{humanize(a.reasonCode)}</span> : null}
                      <span className="text-slate-400 ml-auto whitespace-nowrap">{fmtDateTime(a.createdAt)}</span>
                    </div>
                    {a.reasonFreetext ? <p className="mt-1 text-slate-700">{a.reasonFreetext}</p> : null}
                    <p className="text-[11px] text-slate-500 mt-0.5">{a.adminEmail ?? 'unknown admin'}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* ── gated dialogs ─────────────────────────────────────────────────── */}

      <GatedActionDialog
        open={dialog === 'warn'}
        title={`Warn ${user.name}`}
        tone="warn"
        confirmLabel="Log warning"
        description="Records a strike on this account. Nothing about their access changes."
        reasonCodes={MODERATION_CODES}
        freetextLabel="What are they being warned about?"
        onCancel={() => setDialog(null)}
        onConfirm={async ({ reasonCode, reasonFreetext }) => {
          await opsApi(`/users/${user.id}/warn`, { method: 'POST', body: { reasonCode, reasonFreetext } });
          toast.push('success', 'Warning logged.');
          setDialog(null);
          query.reload();
        }}
      />

      <SuspendDialog
        open={dialog === 'suspend'}
        user={user}
        onCancel={() => setDialog(null)}
        onDone={() => {
          setDialog(null);
          query.reload();
        }}
      />

      {/* §5.2 — the single most destructive action in the console gets the highest friction. */}
      <GatedActionDialog
        open={dialog === 'ban'}
        title={`Ban ${user.name} permanently`}
        tone="danger"
        confirmLabel="Ban this account"
        description="A ban is permanent. The account can never sign in again, and any ride it is holding is released back to the pool."
        summary={
          <>
            <strong>{user.name}</strong> · {user.phone} · {fmtNumber(user.counts.completed)} completed rides
          </>
        }
        reasonCodes={MODERATION_CODES}
        freetextLabel="Why is this account being banned?"
        typedConfirmation={{
          label: "Type the account's phone number to confirm",
          value: user.phone,
          hint: 'Exactly as shown at the top of this page.',
        }}
        onCancel={() => setDialog(null)}
        onConfirm={async ({ reasonCode, reasonFreetext }) => {
          await opsApi(`/users/${user.id}/status`, {
            method: 'POST',
            body: { status: 'banned', reasonCode, reasonFreetext, confirmPhone: user.phone },
          });
          toast.push('success', `${user.name} has been banned.`);
          setDialog(null);
          query.reload();
        }}
      />

      <GatedActionDialog
        open={dialog === 'reinstate'}
        title={`Reinstate ${user.name}`}
        tone="primary"
        confirmLabel="Reinstate account"
        description="The account can sign in and use MotoConnect again immediately."
        reasonCodes={MODERATION_CODES}
        freetextLabel="Why is this being reversed?"
        onCancel={() => setDialog(null)}
        onConfirm={async ({ reasonCode, reasonFreetext }) => {
          await opsApi(`/users/${user.id}/status`, {
            method: 'POST',
            body: { status: 'active', reasonCode, reasonFreetext },
          });
          toast.push('success', `${user.name} has been reinstated.`);
          setDialog(null);
          query.reload();
        }}
      />

      <GatedActionDialog
        open={dialog === 'verification'}
        title="Override verification status"
        tone="warn"
        confirmLabel="Apply override"
        description="This bypasses the verification queue. Use it to correct a mistake, not as the normal way to approve riders."
        reasonCodes={VERIFICATION_STATES}
        reasonLabel="Set status to"
        freetextLabel="Why is an override needed?"
        onCancel={() => setDialog(null)}
        onConfirm={async ({ reasonCode, reasonFreetext }) => {
          await opsApi(`/users/${user.id}/verification`, {
            method: 'POST',
            body: { status: reasonCode, reasonFreetext },
          });
          toast.push('success', 'Verification status overridden.');
          setDialog(null);
          query.reload();
        }}
      />

      <QuotaDialog
        open={dialog === 'quota'}
        user={user}
        onCancel={() => setDialog(null)}
        onDone={() => {
          setDialog(null);
          query.reload();
        }}
      />
    </div>
  );
}

/** §6.3 direct-edit bucket: saved on click, no confirmation, still audited server-side. */
function BasicsCard({ user, onSaved }: { user: UserDetail; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [notes, setNotes] = useState(user.adminNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(user.name);
    setPhone(user.phone);
    setNotes(user.adminNotes ?? '');
  }, [user.name, user.phone, user.adminNotes]);

  const dirty = name !== user.name || phone !== user.phone || notes !== (user.adminNotes ?? '');

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await opsApi<{ phoneChanged?: boolean }>(`/users/${user.id}`, {
        method: 'PATCH',
        body: { name, phone, adminNotes: notes },
      });
      toast.push(
        'success',
        res.phoneChanged
          ? 'Saved. The new number must be verified by OTP at the next sign-in.'
          : 'Saved.'
      );
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <SectionTitle hint="Corrections save directly — no confirmation needed.">Account details</SectionTitle>
      <div className="space-y-3">
        <Field label="Display name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field
          label="Phone number"
          hint="Changing this forces OTP re-verification on the new number — a correction can never hand the account to someone else."
        >
          <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} className="ops-mono" />
        </Field>
        <Field label="Internal notes" hint="Only visible in this console.">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </Field>
        {error ? <p className="text-[11px] text-red-700">{error}</p> : null}
        <Button tone="primary" size="sm" icon={<Save size={13} />} disabled={!dirty} loading={saving} onClick={save}>
          Save changes
        </Button>
      </div>
    </Card>
  );
}

function RiderCard({ user, onOverride }: { user: UserDetail; onOverride: () => void }) {
  const r = user.rider!;
  return (
    <Card>
      <SectionTitle
        right={
          <Button size="sm" tone="neutral" icon={<ShieldQuestion size={13} />} onClick={onOverride}>
            Override
          </Button>
        }
      >
        Rider profile
      </SectionTitle>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <KeyValue label="Verification">
          <VerificationBadge status={r.verificationStatus} />
        </KeyValue>
        <KeyValue label="Plate" mono>
          {r.plateNumber}
        </KeyValue>
        <KeyValue label="National ID" mono>
          {r.nationalIdMasked}
        </KeyValue>
        <KeyValue label="Licence" mono>
          {r.licenseNumber}
        </KeyValue>
      </dl>
      {r.claimSuspendedUntil && new Date(r.claimSuspendedUntil) > new Date() ? (
        <p className="mt-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          Claim access paused until {fmtDateTime(r.claimSuspendedUntil)} because of cancelled rides.
        </p>
      ) : null}
      {r.rejectionReason ? (
        <p className="mt-3 text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-lg p-2">
          Rejected ({humanize(r.rejectionCode)}): {r.rejectionReason}
        </p>
      ) : null}
    </Card>
  );
}

/** §5.3 — the score, and the events that made it. */
function ReliabilityCard({ user }: { user: UserDetail }) {
  const score = user.rider!.reliabilityScore;
  const tone = score >= 4.5 ? 'text-[#0b6e4f]' : score >= 3.5 ? 'text-amber-700' : 'text-red-700';
  return (
    <Card>
      <SectionTitle hint="Shown with the events behind it — never as a number to be trusted on its own.">
        Reliability score
      </SectionTitle>
      <div className="flex items-baseline gap-2 mb-3">
        <span className={`ops-num text-[30px] font-bold leading-none ${tone}`}>{score.toFixed(2)}</span>
        <span className="text-[12px] text-slate-500">out of 5.00</span>
      </div>
      {user.reliabilityEvents.length === 0 ? (
        <p className="text-[12px] text-slate-500">
          No cancellations or no-shows on record. The score is at its starting value.
        </p>
      ) : (
        <div className="ops-table-wrap ops-scroll max-h-[220px] overflow-y-auto rounded-lg border border-slate-200">
          <table className="ops-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>Ride</th>
              </tr>
            </thead>
            <tbody>
              {user.reliabilityEvents.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-slate-600">{fmtDateTime(e.createdAt)}</td>
                  <td>
                    <RideStatusBadge status={e.toStatus} />
                  </td>
                  <td className="ops-mono text-[11px] text-slate-500">{e.rideRequestId.slice(0, 8)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function RatingsCard({ user }: { user: UserDetail }) {
  const received = user.ratingsReceived;
  if (!received.length) return null;
  return (
    <Card>
      <SectionTitle hint="Ratings this account received from the other party.">
        <span className="inline-flex items-center gap-1.5">
          <Star size={13} /> Ratings received
        </span>
      </SectionTitle>
      <ul className="space-y-1.5 max-h-[240px] overflow-y-auto ops-scroll">
        {received.map((r, i) => (
          <li key={i} className="rounded-lg border border-slate-200 p-2.5 text-[12px]">
            <div className="flex items-center gap-2">
              <Badge tone={r.stars <= 2 ? 'red' : r.stars >= 4 ? 'green' : 'amber'}>{r.stars}★</Badge>
              <span className="text-slate-400 ml-auto">{fmtDateTime(r.created_at)}</span>
            </div>
            {r.comment ? <p className="mt-1 text-slate-700">“{r.comment}”</p> : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SuspendDialog({
  open,
  user,
  onCancel,
  onDone,
}: {
  open: boolean;
  user: UserDetail;
  onCancel: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [days, setDays] = useState(7);

  return (
    <GatedActionDialog
      open={open}
      title={`Suspend ${user.name}`}
      tone="warn"
      confirmLabel="Suspend account"
      description="A suspension is temporary. It lifts automatically when the time is up — nobody has to remember to undo it."
      reasonCodes={MODERATION_CODES}
      freetextLabel="Why is this account being suspended?"
      extraFields={
        <Field label="Suspension length" required>
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[1, 3, 7, 14, 30, 90].map((d) => (
              <option key={d} value={d}>
                {d} day{d === 1 ? '' : 's'}
              </option>
            ))}
          </Select>
        </Field>
      }
      onCancel={onCancel}
      onConfirm={async ({ reasonCode, reasonFreetext }) => {
        await opsApi(`/users/${user.id}/status`, {
          method: 'POST',
          body: { status: 'suspended', reasonCode, reasonFreetext, suspendDays: days },
        });
        toast.push('success', `${user.name} suspended for ${days} day(s).`);
        onDone();
      }}
    />
  );
}

function QuotaDialog({
  open,
  user,
  onCancel,
  onDone,
}: {
  open: boolean;
  user: UserDetail;
  onCancel: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const active = user.subscriptions.find((s) => s.status === 'active') ?? user.subscriptions[0];
  const [claimsUsed, setClaimsUsed] = useState('');
  const [claimsCap, setClaimsCap] = useState('');
  const [extendDays, setExtendDays] = useState('');

  if (!active) return null;

  return (
    <GatedActionDialog
      open={open}
      title="Adjust plan quota"
      tone="warn"
      confirmLabel="Apply adjustment"
      description="Leave a field blank to leave it unchanged. This is effectively giving away product, so it is gated and logged."
      summary={
        <>
          <strong className="capitalize">{active.tier}</strong> · {active.claimsUsed}
          {active.claimsCap === null ? ' / ∞' : ` / ${active.claimsCap}`} claims used · expires{' '}
          {fmtDateTime(active.expiresAt)}
        </>
      }
      freetextLabel="Why is this plan being adjusted?"
      extraFields={
        <div className="grid grid-cols-3 gap-2">
          <Field label="Claims used">
            <TextInput
              value={claimsUsed}
              onChange={(e) => setClaimsUsed(e.target.value.replace(/\D/g, ''))}
              placeholder={String(active.claimsUsed)}
              inputMode="numeric"
            />
          </Field>
          <Field label="Claim cap">
            <TextInput
              value={claimsCap}
              onChange={(e) => setClaimsCap(e.target.value.replace(/\D/g, ''))}
              placeholder={active.claimsCap === null ? '∞' : String(active.claimsCap)}
              inputMode="numeric"
            />
          </Field>
          <Field label="Extend (days)">
            <TextInput
              value={extendDays}
              onChange={(e) => setExtendDays(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              inputMode="numeric"
            />
          </Field>
        </div>
      }
      onCancel={onCancel}
      onConfirm={async ({ reasonFreetext }) => {
        const body: Record<string, unknown> = { reasonFreetext };
        if (claimsUsed !== '') body.claimsUsed = Number(claimsUsed);
        if (claimsCap !== '') body.claimsCap = Number(claimsCap);
        if (extendDays !== '') body.extendDays = Number(extendDays);
        await opsApi(`/finance/subscriptions/${active.id}/quota`, { method: 'POST', body });
        toast.push('success', 'Plan adjusted and logged.');
        setClaimsUsed('');
        setClaimsCap('');
        setExtendDays('');
        onDone();
      }}
    />
  );
}
