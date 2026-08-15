/**
 * Verification queue (admin spec §4) — the launch blocker.
 *
 * Riders sit in `pending_verification` and cannot see a single ride request
 * until a decision is made here, so this is the screen that unblocks the whole
 * rider side of the consumer app.
 *
 * §4.4 is a deliberate scope exclusion and there is no bulk-approve function in
 * this file on purpose: every verification is a distinct liability decision and
 * batching it invites rubber-stamping. Do not add one.
 */
import { pool } from '../../db/pool.js';
import { errors } from '../../lib/errors.js';
import { gatedAction, logPiiAccess } from '../../lib/audit.js';
import type { AdminIdentity } from '../../lib/adminAuth.js';
import { readStoredImage } from '../../lib/uploads.js';
import { REQUIRED_RIDER_DOCUMENT_KINDS, VERIFICATION_SLA_MS } from '../../config.js';

/** §4.2 — reason-code enum for rejections, alongside the required freetext. */
export const REJECTION_CODES = [
  'id_mismatch',
  'blurry_document',
  'underage',
  'duplicate_account',
  'other',
] as const;
export type RejectionCode = (typeof REJECTION_CODES)[number];

export const INFO_REQUEST_CODES = [
  'resubmit_id',
  'resubmit_license',
  'resubmit_plate',
  'clarify_details',
  'other',
] as const;
export type InfoRequestCode = (typeof INFO_REQUEST_CODES)[number];

/** §4.1 — 1198******3421: first four and last four only. */
export function maskNationalId(id: string): string {
  if (!id) return '';
  if (id.length <= 8) return '*'.repeat(id.length);
  return `${id.slice(0, 4)}${'*'.repeat(id.length - 8)}${id.slice(-4)}`;
}

export type QueueSort = 'oldest' | 'newest' | 'name';

/**
 * §4.1 — oldest first by DEFAULT, and the caller cannot change that by
 * accident: an unrecognised sort value falls back to oldest, never newest.
 * Newest-first would quietly build a backlog of ignored old applicants.
 */
export async function listQueue(opts: {
  sort?: QueueSort;
  search?: string;
  status?: 'pending_verification' | 'rejected' | 'verified' | 'all';
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, opts.pageSize ?? 25));
  const status = opts.status ?? 'pending_verification';
  const search = opts.search?.trim() ?? '';

  const order =
    opts.sort === 'newest' ? 'rp.submitted_at DESC' : opts.sort === 'name' ? 'u.name ASC' : 'rp.submitted_at ASC';

  const where: string[] = [];
  const params: unknown[] = [];
  if (status !== 'all') {
    params.push(status);
    where.push(`rp.verification_status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(u.name ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR rp.plate_number ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRes = await pool.query(
    `SELECT count(*)::int AS n FROM rider_profiles rp JOIN users u ON u.id = rp.user_id ${whereSql}`,
    params
  );

  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await pool.query(
    `SELECT rp.user_id, u.name, u.phone, rp.national_id, rp.plate_number, rp.license_number,
            rp.verification_status, rp.submitted_at, rp.info_requested_at, rp.rejection_code,
            rp.rejection_reason, rp.decided_at,
            (SELECT count(*)::int FROM rider_documents d WHERE d.rider_id = rp.user_id) AS document_count
     FROM rider_profiles rp
     JOIN users u ON u.id = rp.user_id
     ${whereSql}
     ORDER BY ${order}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const now = Date.now();
  return {
    total: totalRes.rows[0].n as number,
    page,
    pageSize,
    rows: rows.map((r) => {
      const submitted = new Date(r.submitted_at).getTime();
      const ageMs = now - submitted;
      return {
        riderId: r.user_id,
        name: r.name,
        phone: r.phone,
        nationalIdMasked: maskNationalId(r.national_id),
        plateNumber: r.plate_number,
        licenseNumber: r.license_number,
        verificationStatus: r.verification_status,
        submittedAt: r.submitted_at,
        daysPending: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
        hoursPending: Math.floor(ageMs / (60 * 60 * 1000)),
        /** §4.1 — red flag past the 48 h SLA. */
        overSla: r.verification_status === 'pending_verification' && ageMs > VERIFICATION_SLA_MS,
        infoRequestedAt: r.info_requested_at,
        rejectionCode: r.rejection_code,
        rejectionReason: r.rejection_reason,
        decidedAt: r.decided_at,
        documentCount: r.document_count,
      };
    }),
  };
}

/**
 * §4.2 — the unmasked review panel. Opening it IS a PII access event and is
 * logged as one before the data is returned.
 */
export async function getRiderReview(admin: AdminIdentity, riderId: string) {
  const { rows } = await pool.query(
    `SELECT rp.user_id, u.name, u.phone, u.created_at AS account_created_at, u.account_status,
            rp.national_id, rp.license_number, rp.plate_number, rp.verification_status,
            rp.submitted_at, rp.verified_at, rp.rejection_reason, rp.rejection_code,
            rp.info_requested_at, rp.info_request_note, rp.reliability_score, rp.decided_at,
            da.email AS decided_by_email
     FROM rider_profiles rp
     JOIN users u ON u.id = rp.user_id
     LEFT JOIN admin_users da ON da.id = rp.decided_by
     WHERE rp.user_id = $1`,
    [riderId]
  );
  if (!rows.length) throw errors.notFound('That rider application was not found.');
  const r = rows[0];

  const docs = await pool.query(
    `SELECT id, kind, mime_type, byte_size, uploaded_at FROM rider_documents
     WHERE rider_id = $1 ORDER BY uploaded_at ASC`,
    [riderId]
  );

  // Duplicate-account signal: the same National ID or plate on another profile.
  const dupes = await pool.query(
    `SELECT rp.user_id, u.name, u.phone, rp.verification_status,
            (rp.national_id = $2) AS same_national_id,
            (rp.plate_number = $3) AS same_plate
     FROM rider_profiles rp JOIN users u ON u.id = rp.user_id
     WHERE rp.user_id <> $1 AND (rp.national_id = $2 OR rp.plate_number = $3)`,
    [riderId, r.national_id, r.plate_number]
  );

  await logPiiAccess(admin, {
    actionType: 'verification.review_opened',
    targetType: 'rider',
    targetId: riderId,
    afterState: { fields: ['national_id', 'license_number', 'plate_number'], status: r.verification_status },
  });

  return {
    riderId: r.user_id,
    name: r.name,
    phone: r.phone,
    accountCreatedAt: r.account_created_at,
    accountStatus: r.account_status,
    nationalId: r.national_id,
    licenseNumber: r.license_number,
    plateNumber: r.plate_number,
    verificationStatus: r.verification_status,
    submittedAt: r.submitted_at,
    verifiedAt: r.verified_at,
    decidedAt: r.decided_at,
    decidedByEmail: r.decided_by_email,
    rejectionReason: r.rejection_reason,
    rejectionCode: r.rejection_code,
    infoRequestedAt: r.info_requested_at,
    infoRequestNote: r.info_request_note,
    reliabilityScore: Number(r.reliability_score),
    /**
     * No URL is handed out here: `storage_url` is an opaque filename and the
     * bytes are only reachable through the authenticated
     * /documents/:docId/file route, which logs each view.
     */
    documents: docs.rows.map((d) => ({
      id: d.id as string,
      kind: d.kind as string,
      mimeType: d.mime_type as string | null,
      byteSize: d.byte_size === null ? null : Number(d.byte_size),
      uploadedAt: d.uploaded_at,
    })),
    documentsMissing: docs.rows.length === 0,
    /**
     * Which of the three required photographs are still absent. A verification
     * decision taken without them rests on typed numbers alone, and the review
     * panel says so rather than implying a document was checked.
     */
    missingRequiredKinds: REQUIRED_RIDER_DOCUMENT_KINDS.filter(
      (k) => !docs.rows.some((d) => d.kind === k)
    ),
    possibleDuplicates: dupes.rows.map((d) => ({
      riderId: d.user_id,
      name: d.name,
      phone: d.phone,
      verificationStatus: d.verification_status,
      sameNationalId: d.same_national_id,
      samePlate: d.same_plate,
    })),
  };
}

/**
 * §4.2 — returns the raw bytes of one document for the review panel.
 *
 * Looking at a rider's ID photograph is a PII access event, so it is logged
 * before the image is handed over, exactly like revealing the number.
 */
export async function getRiderDocumentFile(admin: AdminIdentity, riderId: string, docId: string) {
  const { rows } = await pool.query(
    `SELECT id, kind, storage_url, mime_type FROM rider_documents WHERE id = $1 AND rider_id = $2`,
    [docId, riderId]
  );
  if (!rows.length) throw errors.notFound('That document was not found.');
  const doc = rows[0];

  await logPiiAccess(admin, {
    actionType: 'verification.document_viewed',
    targetType: 'rider',
    targetId: riderId,
    afterState: { documentId: doc.id, kind: doc.kind },
  });

  return {
    kind: doc.kind as string,
    mimeType: (doc.mime_type as string) || 'application/octet-stream',
    bytes: await readStoredImage(doc.storage_url),
  };
}

/** §4.1 — click-to-reveal on the masked National ID. The reveal itself is logged. */
export async function revealNationalId(admin: AdminIdentity, riderId: string) {
  const { rows } = await pool.query(`SELECT national_id FROM rider_profiles WHERE user_id = $1`, [riderId]);
  if (!rows.length) throw errors.notFound('That rider application was not found.');
  await logPiiAccess(admin, {
    actionType: 'verification.national_id_revealed',
    targetType: 'rider',
    targetId: riderId,
  });
  return { nationalId: rows[0].national_id as string };
}

async function loadForDecision(client: import('pg').PoolClient, riderId: string) {
  const { rows } = await client.query(
    `SELECT rp.user_id, rp.verification_status, rp.rejection_code, rp.rejection_reason,
            u.name, u.phone
     FROM rider_profiles rp JOIN users u ON u.id = rp.user_id
     WHERE rp.user_id = $1 FOR UPDATE OF rp`,
    [riderId]
  );
  if (!rows.length) throw errors.notFound('That rider application was not found.');
  return rows[0];
}

/**
 * §4.3 — the audit row and the state change are one transaction (see
 * `gatedAction`). If the audit write fails, the rider does not get verified.
 */
export async function approveRider(admin: AdminIdentity, riderId: string, reasonFreetext?: string) {
  return gatedAction(admin, async (client) => {
    const before = await loadForDecision(client, riderId);
    if (before.verification_status === 'verified') {
      throw errors.conflict('This rider is already verified.');
    }

    await client.query(
      `UPDATE rider_profiles
       SET verification_status = 'verified', verified_at = now(), decided_at = now(), decided_by = $2,
           rejection_reason = NULL, rejection_code = NULL,
           info_requested_at = NULL, info_request_note = NULL, updated_at = now()
       WHERE user_id = $1`,
      [riderId, admin.id]
    );

    return {
      result: { verificationStatus: 'verified' as const, name: before.name as string },
      audit: {
        actionType: 'verification.approved',
        targetType: 'rider',
        targetId: riderId,
        reasonFreetext: reasonFreetext?.trim() || null,
        beforeState: { verificationStatus: before.verification_status },
        afterState: { verificationStatus: 'verified', name: before.name, phone: before.phone },
      },
    };
  });
}

/** §4.3 — a rejection with no reason cannot be submitted. Both code and freetext are required. */
export async function rejectRider(
  admin: AdminIdentity,
  riderId: string,
  input: { reasonCode: RejectionCode; reasonFreetext: string }
) {
  if (!REJECTION_CODES.includes(input.reasonCode)) {
    throw errors.badRequest('Choose a rejection reason code.');
  }
  const freetext = input.reasonFreetext?.trim() ?? '';
  if (freetext.length < 5) {
    throw errors.badRequest('Write the reason for this rejection — the rider will be told what went wrong.');
  }

  return gatedAction(admin, async (client) => {
    const before = await loadForDecision(client, riderId);
    if (before.verification_status === 'rejected') {
      throw errors.conflict('This application is already rejected.');
    }

    await client.query(
      `UPDATE rider_profiles
       SET verification_status = 'rejected', rejection_code = $2, rejection_reason = $3,
           decided_at = now(), decided_by = $4,
           info_requested_at = NULL, info_request_note = NULL, updated_at = now()
       WHERE user_id = $1`,
      [riderId, input.reasonCode, freetext, admin.id]
    );

    return {
      result: { verificationStatus: 'rejected' as const },
      audit: {
        actionType: 'verification.rejected',
        targetType: 'rider',
        targetId: riderId,
        reasonCode: input.reasonCode,
        reasonFreetext: freetext,
        beforeState: { verificationStatus: before.verification_status },
        afterState: { verificationStatus: 'rejected', name: before.name, phone: before.phone },
      },
    };
  });
}

/**
 * §4.2 — "request more info": the rider is told exactly what to resubmit and
 * STAYS in pending_verification rather than being rejected outright.
 */
export async function requestMoreInfo(
  admin: AdminIdentity,
  riderId: string,
  input: { reasonCode: InfoRequestCode; note: string }
) {
  if (!INFO_REQUEST_CODES.includes(input.reasonCode)) {
    throw errors.badRequest('Choose what the rider needs to resubmit.');
  }
  const note = input.note?.trim() ?? '';
  if (note.length < 5) {
    throw errors.badRequest('Write a plain-English note telling the rider exactly what to send again.');
  }

  return gatedAction(admin, async (client) => {
    const before = await loadForDecision(client, riderId);
    if (before.verification_status !== 'pending_verification') {
      throw errors.conflict('Only a pending application can be asked for more information.');
    }

    await client.query(
      `UPDATE rider_profiles
       SET info_requested_at = now(), info_request_note = $2, updated_at = now()
       WHERE user_id = $1`,
      [riderId, note]
    );

    return {
      result: { verificationStatus: 'pending_verification' as const },
      audit: {
        actionType: 'verification.more_info_requested',
        targetType: 'rider',
        targetId: riderId,
        reasonCode: input.reasonCode,
        reasonFreetext: note,
        beforeState: { verificationStatus: before.verification_status },
        afterState: { verificationStatus: 'pending_verification', infoRequested: true },
      },
    };
  });
}

/** §10 — approval rate + median time-to-decision over a trailing window. */
export async function decisionMetrics(days = 7) {
  const { rows } = await pool.query(
    `SELECT
       count(*) FILTER (WHERE verification_status = 'verified')::int AS approved,
       count(*) FILTER (WHERE verification_status = 'rejected')::int AS rejected,
       percentile_cont(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (decided_at - submitted_at))
       ) AS median_seconds
     FROM rider_profiles
     WHERE decided_at IS NOT NULL AND decided_at > now() - ($1::int * interval '1 day')`,
    [days]
  );
  const r = rows[0];
  const decided = Number(r.approved) + Number(r.rejected);
  return {
    windowDays: days,
    approved: Number(r.approved),
    rejected: Number(r.rejected),
    approvalRate: decided > 0 ? Number(r.approved) / decided : null,
    medianHoursToDecision: r.median_seconds === null ? null : Number(r.median_seconds) / 3600,
  };
}
