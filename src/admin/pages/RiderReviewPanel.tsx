/**
 * Rider review panel (admin spec §4.2, §4.3).
 *
 * Opening it is itself a PII access event and is logged server-side before the
 * data comes back. The National ID is masked until explicitly revealed, and the
 * reveal is logged separately.
 *
 * The three decisions — approve, reject, request more info — all route through
 * GatedActionDialog, so each one gets an explicit confirmation step, a reason,
 * and an audit row written in the same transaction as the state change.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, Copy, FileWarning, ShieldAlert } from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  InfoNote,
  KeyValue,
  Modal,
  Spinner,
  VerificationBadge,
  useToast,
} from '../components/ui';
import { GatedActionDialog } from '../components/GatedAction';
import { useQuery } from '../hooks';
import { fmtDate, fmtDateTime } from '../format';
import { getAdminToken, opsApi } from '../api';
import { apiUrl } from '../../config';
import type { RiderReview } from '../types';

/**
 * Loads one document image.
 *
 * An <img src> cannot carry the admin bearer token, and the upload directory is
 * deliberately not served statically, so the bytes are fetched with the session
 * token and turned into an object URL. That keeps the only path to a rider's ID
 * photograph behind an authenticated request that the server logs.
 */
function DocumentThumb({
  riderId,
  doc,
}: {
  riderId: string;
  doc: RiderReview['documents'][number];
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    fetch(apiUrl(`/api/admin/verification/${riderId}/documents/${doc.id}/file`), {
      headers: { Authorization: `Bearer ${getAdminToken() ?? ''}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('not ok');
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [riderId, doc.id]);

  const label = doc.kind.replace('_', ' ');

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="h-32 bg-slate-100 flex items-center justify-center">
        {src ? (
          // Opens the full-size image in a tab for the close look that an ID
          // number needs; the object URL is already in memory, so it is free.
          <a href={src} target="_blank" rel="noreferrer" className="block w-full h-full">
            <img src={src} alt={label} className="w-full h-full object-cover" />
          </a>
        ) : failed ? (
          <span className="text-[11px] text-red-700 px-2 text-center">Image unavailable</span>
        ) : (
          <span className="text-[11px] text-slate-400">Loading…</span>
        )}
      </div>
      <div className="px-2 py-1 flex items-center justify-between gap-1">
        <span className="text-[11px] font-medium text-slate-600 capitalize truncate">{label}</span>
        <span className="text-[10px] text-slate-400 shrink-0">{fmtDate(doc.uploadedAt)}</span>
      </div>
    </div>
  );
}

/** §4.2 — the rejection reason-code enum, verbatim. */
const REJECTION_CODES = [
  { value: 'id_mismatch', label: 'ID does not match the applicant' },
  { value: 'blurry_document', label: 'Document is unreadable' },
  { value: 'underage', label: 'Applicant is underage' },
  { value: 'duplicate_account', label: 'Duplicate account' },
  { value: 'other', label: 'Other (explain below)' },
];

const INFO_REQUEST_CODES = [
  { value: 'resubmit_id', label: 'Resubmit National ID' },
  { value: 'resubmit_license', label: 'Resubmit driving licence' },
  { value: 'resubmit_plate', label: 'Resubmit plate details' },
  { value: 'clarify_details', label: 'Clarify submitted details' },
  { value: 'other', label: 'Other (explain below)' },
];

type Action = 'approve' | 'reject' | 'info' | null;

export default function RiderReviewPanel({
  riderId,
  onClose,
  onDecided,
}: {
  riderId: string;
  onClose: () => void;
  onDecided: () => void;
}) {
  const toast = useToast();
  const query = useQuery<RiderReview>(`/verification/${riderId}`);
  const [action, setAction] = useState<Action>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);

  const rider = query.data;

  const reveal = async () => {
    setRevealing(true);
    try {
      const res = await opsApi<{ nationalId: string }>(`/verification/${riderId}/reveal-id`, { method: 'POST' });
      setRevealed(res.nationalId);
    } catch {
      toast.push('error', 'Could not reveal the ID number.');
    } finally {
      setRevealing(false);
    }
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        width="max-w-3xl"
        title={rider ? rider.name : 'Rider application'}
        subtitle={
          rider ? (
            <span className="flex items-center gap-2">
              <span className="ops-mono">{rider.phone}</span>
              <VerificationBadge status={rider.verificationStatus} />
            </span>
          ) : null
        }
      >
        {query.initialLoading ? (
          <Spinner label="Opening application…" />
        ) : query.error ? (
          <ErrorNote message={query.error} onRetry={query.reload} />
        ) : rider ? (
          <div className="space-y-4">
            {/* Documents are the whole point of the review: a typed number can
                be invented, a photograph of the card cannot. */}
            {rider.documentsMissing ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-2 text-[12px] text-amber-900">
                  <FileWarning size={15} className="mt-px shrink-0" />
                  <div>
                    <strong>No documents submitted.</strong> This rider has not photographed their ID, licence
                    or plate yet, so there is nothing here to check the numbers against. Approving now would be
                    approving on trust — use <em>Request more info</em> to ask for the photos.
                  </div>
                </div>
              </div>
            ) : (
              <>
                {rider.missingRequiredKinds.length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900">
                    <strong>Incomplete.</strong> Still missing:{' '}
                    {rider.missingRequiredKinds.map((k) => k.replace('_', ' ')).join(', ')}.
                  </div>
                ) : null}
                <div className="grid grid-cols-3 gap-2">
                  {rider.documents.map((d) => (
                    <DocumentThumb key={d.id} riderId={rider.riderId} doc={d} />
                  ))}
                </div>
              </>
            )}

            {rider.possibleDuplicates.length ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="flex items-start gap-2 text-[12px] text-red-900">
                  <ShieldAlert size={15} className="mt-px shrink-0" />
                  <div className="flex-1">
                    <strong>Possible duplicate account.</strong>
                    <ul className="mt-1 space-y-0.5">
                      {rider.possibleDuplicates.map((d) => (
                        <li key={d.riderId}>
                          {d.name} ({d.phone}) — {d.sameNationalId ? 'same National ID' : ''}
                          {d.sameNationalId && d.samePlate ? ' and ' : ''}
                          {d.samePlate ? 'same plate' : ''} · {d.verificationStatus.replace(/_/g, ' ')}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : null}

            <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 rounded-lg bg-slate-50 border border-slate-200 p-3">
              <KeyValue label="National ID" mono>
                {revealed ? (
                  <span className="flex items-center gap-2">
                    {revealed}
                    <button
                      onClick={() => navigator.clipboard?.writeText(revealed).catch(() => {})}
                      className="text-slate-400 hover:text-slate-700"
                      aria-label="Copy National ID"
                    >
                      <Copy size={12} />
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={reveal}
                    disabled={revealing}
                    className="text-[#0b6e4f] font-semibold underline underline-offset-2 disabled:opacity-50"
                  >
                    {revealing ? 'Revealing…' : 'Reveal (logged)'}
                  </button>
                )}
              </KeyValue>
              <KeyValue label="Licence number" mono>
                {rider.licenseNumber}
              </KeyValue>
              <KeyValue label="Plate number" mono>
                {rider.plateNumber}
              </KeyValue>
              <KeyValue label="Submitted">{fmtDateTime(rider.submittedAt)}</KeyValue>
              <KeyValue label="Account created">{fmtDateTime(rider.accountCreatedAt)}</KeyValue>
              <KeyValue label="Account status">
                <Badge tone={rider.accountStatus === 'active' ? 'green' : 'red'}>{rider.accountStatus}</Badge>
              </KeyValue>
            </dl>

            {rider.infoRequestedAt ? (
              <InfoNote tone="amber">
                More information was requested on {fmtDateTime(rider.infoRequestedAt)}: “{rider.infoRequestNote}”.
                The rider is still pending and can resubmit.
              </InfoNote>
            ) : null}

            {rider.verificationStatus === 'rejected' ? (
              <InfoNote tone="amber">
                Rejected {fmtDateTime(rider.decidedAt)} by {rider.decidedByEmail ?? 'an admin'} —{' '}
                {rider.rejectionCode?.replace(/_/g, ' ')}: “{rider.rejectionReason}”.
              </InfoNote>
            ) : null}
            {rider.verificationStatus === 'verified' ? (
              <InfoNote>
                Approved {fmtDateTime(rider.verifiedAt)} by {rider.decidedByEmail ?? 'an admin'}.
              </InfoNote>
            ) : null}

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200 mt-1 pt-3">
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <AlertTriangle size={13} />
                Every decision is confirmed, reasoned and written to the audit log.
              </p>
              <div className="flex items-center gap-2">
                {rider.verificationStatus === 'pending_verification' ? (
                  <Button tone="neutral" onClick={() => setAction('info')}>
                    Request more info
                  </Button>
                ) : null}
                {rider.verificationStatus !== 'rejected' ? (
                  <Button tone="danger" onClick={() => setAction('reject')}>
                    Reject
                  </Button>
                ) : null}
                {rider.verificationStatus !== 'verified' ? (
                  <Button tone="primary" onClick={() => setAction('approve')}>
                    Approve
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState title="Application not found" />
        )}
      </Modal>

      {rider ? (
        <>
          <GatedActionDialog
            open={action === 'approve'}
            title={`Approve ${rider.name}?`}
            tone="primary"
            confirmLabel="Approve rider"
            description="Approving lets this rider start seeing and claiming ride requests immediately."
            summary={
              <>
                <strong>{rider.name}</strong> · {rider.phone} · plate {rider.plateNumber}
                {rider.missingRequiredKinds.length > 0 ? (
                  <div className="mt-1.5 text-amber-800">
                    {rider.documentsMissing
                      ? 'No documents were submitted — this approval rests on the typed numbers alone.'
                      : `Missing ${rider.missingRequiredKinds
                          .map((k) => k.replace('_', ' '))
                          .join(' and ')} — that part is unverified.`}
                  </div>
                ) : null}
              </>
            }
            freetextLabel="Note (optional)"
            freetextRequired={false}
            freetextHint="Anything worth recording about this decision."
            onCancel={() => setAction(null)}
            onConfirm={async ({ reasonFreetext }) => {
              await opsApi(`/verification/${rider.riderId}/approve`, {
                method: 'POST',
                body: { note: reasonFreetext || undefined },
              });
              toast.push('success', `${rider.name} approved and can now claim rides.`);
              setAction(null);
              onDecided();
            }}
          />

          <GatedActionDialog
            open={action === 'reject'}
            title={`Reject ${rider.name}'s application?`}
            tone="danger"
            confirmLabel="Reject application"
            description="The rider will be told why, and can correct and resubmit."
            reasonCodes={REJECTION_CODES}
            reasonLabel="Rejection reason"
            freetextLabel="What to tell the rider"
            freetextHint="Plain English — this is shown to the rider in the app."
            onCancel={() => setAction(null)}
            onConfirm={async ({ reasonCode, reasonFreetext }) => {
              await opsApi(`/verification/${rider.riderId}/reject`, {
                method: 'POST',
                body: { reasonCode, reasonFreetext },
              });
              toast.push('success', `Application rejected. ${rider.name} has been given the reason.`);
              setAction(null);
              onDecided();
            }}
          />

          <GatedActionDialog
            open={action === 'info'}
            title="Ask for more information"
            tone="warn"
            confirmLabel="Send request"
            description="The application stays pending — the rider is asked for exactly what is missing rather than being rejected."
            reasonCodes={INFO_REQUEST_CODES}
            reasonLabel="What is needed"
            freetextLabel="Message to the rider"
            freetextHint="Be specific: what to send, and what was wrong with what they sent."
            onCancel={() => setAction(null)}
            onConfirm={async ({ reasonCode, reasonFreetext }) => {
              await opsApi(`/verification/${rider.riderId}/request-info`, {
                method: 'POST',
                body: { reasonCode, note: reasonFreetext },
              });
              toast.push('success', 'Request sent. The rider stays in the queue.');
              setAction(null);
              onDecided();
            }}
          />
        </>
      ) : null}
    </>
  );
}
