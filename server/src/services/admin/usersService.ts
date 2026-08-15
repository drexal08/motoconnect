/**
 * User management (admin spec §6) + the moderation actions the dispute queue
 * calls into (§5.2).
 *
 * §6.3 draws the minor/destructive line explicitly so it is not left to
 * judgement per field:
 *
 *   DIRECT EDIT  — display name, phone correction, notification settings,
 *                  admin-internal notes.  (Still audited: writing a log row is
 *                  free, and "who changed this phone number" is exactly the
 *                  question you ask six months later.)
 *   GATED        — verification status, account status, subscription quota,
 *                  refunds, manual ride-state override.  Confirm + reason +
 *                  audit, in one transaction.
 *
 * Anything ambiguous is gated by default: an unnecessary confirm click costs
 * far less than an accidental silent ban.
 */
import { pool } from '../../db/pool.js';
import { errors } from '../../lib/errors.js';
import { gatedAction, logPiiAccess } from '../../lib/audit.js';
import type { AdminIdentity } from '../../lib/adminAuth.js';
import { normalizePhone } from '../../lib/phone.js';
import { maskNationalId } from './verificationService.js';

export const MODERATION_REASON_CODES = [
  'no_show_abuse',
  'harassment',
  'unsafe_riding',
  'fraud',
  'document_fraud',
  'repeated_cancellations',
  'other',
] as const;
export type ModerationReasonCode = (typeof MODERATION_REASON_CODES)[number];

export async function listUsers(opts: {
  search?: string;
  role?: 'passenger' | 'rider' | 'all';
  status?: 'active' | 'suspended' | 'banned' | 'flagged' | 'all';
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, opts.pageSize ?? 25));
  const where: string[] = [];
  const params: unknown[] = [];

  if (opts.search?.trim()) {
    params.push(`%${opts.search.trim()}%`);
    where.push(`(u.name ILIKE $${params.length} OR u.phone ILIKE $${params.length})`);
  }
  if (opts.role && opts.role !== 'all') {
    params.push(opts.role);
    where.push(`u.role = $${params.length}`);
  }
  if (opts.status === 'flagged') {
    where.push(`u.review_flag = true`);
  } else if (opts.status && opts.status !== 'all') {
    params.push(opts.status);
    where.push(`u.account_status = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRes = await pool.query(`SELECT count(*)::int AS n FROM users u ${whereSql}`, params);

  params.push(pageSize, (page - 1) * pageSize);
  // §6.1 — paginated, never infinite scroll: row positions must stay stable
  // while an admin is acting on the list.
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.phone, u.role, u.account_status, u.suspended_until, u.review_flag,
            u.created_at, rp.verification_status, rp.reliability_score,
            (SELECT count(*)::int FROM ride_requests r
              WHERE r.passenger_id = u.id OR r.claimed_by = u.id) AS ride_count,
            (SELECT s.tier FROM subscriptions s
              WHERE s.rider_id = u.id AND s.status = 'active' AND s.expires_at > now()
              ORDER BY s.expires_at DESC LIMIT 1) AS active_tier
     FROM users u
     LEFT JOIN rider_profiles rp ON rp.user_id = u.id
     ${whereSql}
     ORDER BY u.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    total: totalRes.rows[0].n as number,
    page,
    pageSize,
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      role: r.role,
      accountStatus: r.account_status,
      suspendedUntil: r.suspended_until,
      reviewFlag: r.review_flag,
      verificationStatus: r.verification_status,
      reliabilityScore: r.reliability_score === null ? null : Number(r.reliability_score),
      activeTier: r.active_tier,
      rideCount: r.ride_count,
      createdAt: r.created_at,
    })),
  };
}

/**
 * §6.2 — full account detail, including §5.3's requirement that the reliability
 * score is shown WITH the underlying events, not as a black-box number.
 */
export async function getUserDetail(admin: AdminIdentity, userId: string) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.phone, u.role, u.account_status, u.suspended_until, u.status_reason,
            u.admin_notes, u.review_flag, u.disabled, u.created_at,
            u.location_consent_granted, u.consent_reconfirm_at,
            rp.verification_status, rp.national_id, rp.license_number, rp.plate_number,
            rp.reliability_score, rp.claim_suspended_until, rp.rejection_reason, rp.rejection_code
     FROM users u LEFT JOIN rider_profiles rp ON rp.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  if (!rows.length) throw errors.notFound('That account was not found.');
  const u = rows[0];
  const isRider = u.role === 'rider' && u.verification_status !== null;

  const [subscription, rides, ratingsGiven, ratingsReceived, counts, cancelEvents, strikes, adminTrail] =
    await Promise.all([
      pool.query(
        `SELECT id, tier, claims_used, claims_cap, status, starts_at, expires_at
         FROM subscriptions WHERE rider_id = $1 ORDER BY starts_at DESC LIMIT 5`,
        [userId]
      ),
      pool.query(
        `SELECT r.id, r.status, r.created_at, r.completed_at, r.destination_note,
                r.passenger_id, r.claimed_by,
                p.name AS passenger_name, d.name AS rider_name
         FROM ride_requests r
         LEFT JOIN users p ON p.id = r.passenger_id
         LEFT JOIN users d ON d.id = r.claimed_by
         WHERE r.passenger_id = $1 OR r.claimed_by = $1
         ORDER BY r.created_at DESC LIMIT 25`,
        [userId]
      ),
      pool.query(
        `SELECT rt.stars, rt.comment, rt.created_at, rt.ride_request_id
         FROM ratings rt WHERE rt.rated_by = $1 ORDER BY rt.created_at DESC LIMIT 20`,
        [userId]
      ),
      pool.query(
        `SELECT rt.stars, rt.comment, rt.created_at, rt.ride_request_id
         FROM ratings rt WHERE rt.rated_user = $1 ORDER BY rt.created_at DESC LIMIT 20`,
        [userId]
      ),
      pool.query(
        `SELECT
           (SELECT count(*)::int FROM ride_requests r WHERE r.passenger_id = $1 AND r.status = 'NO_SHOW') AS no_shows,
           (SELECT count(*)::int FROM ride_events e WHERE e.actor_id = $1 AND e.to_status = 'CANCELLED_BY_PASSENGER') AS passenger_cancels,
           (SELECT count(*)::int FROM ride_events e WHERE e.actor_id = $1 AND e.to_status = 'CANCELLED_BY_RIDER') AS rider_cancels,
           (SELECT count(*)::int FROM ride_requests r WHERE (r.passenger_id = $1 OR r.claimed_by = $1) AND r.status = 'COMPLETED') AS completed`,
        [userId]
      ),
      // §5.3 — the events behind the score, so a suspension decision is not
      // made on trust in a number.
      pool.query(
        `SELECT e.id, e.to_status, e.created_at, e.meta, e.ride_request_id
         FROM ride_events e
         WHERE e.actor_id = $1 AND e.to_status IN ('CANCELLED_BY_RIDER','CANCELLED_BY_PASSENGER','NO_SHOW')
         ORDER BY e.created_at DESC LIMIT 30`,
        [userId]
      ),
      pool.query(
        `SELECT s.id, s.reason_code, s.note, s.created_at, a.email AS admin_email
         FROM user_strikes s LEFT JOIN admin_users a ON a.id = s.admin_user_id
         WHERE s.user_id = $1 ORDER BY s.created_at DESC`,
        [userId]
      ),
      // §6.2 — every admin action ever taken on this account.
      pool.query(
        `SELECT id, action_type, reason_code, reason_freetext, admin_email, created_at, before_state, after_state
         FROM admin_audit_log
         WHERE target_id = $1 AND target_type IN ('user','rider','subscription')
         ORDER BY created_at DESC LIMIT 50`,
        [userId]
      ),
    ]);

  await logPiiAccess(admin, {
    actionType: 'user.detail_opened',
    targetType: 'user',
    targetId: userId,
    afterState: { role: u.role },
  });

  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    role: u.role,
    accountStatus: u.account_status,
    suspendedUntil: u.suspended_until,
    statusReason: u.status_reason,
    adminNotes: u.admin_notes,
    reviewFlag: u.review_flag,
    disabled: u.disabled,
    createdAt: u.created_at,
    consent: {
      granted: u.location_consent_granted,
      reconfirmAt: u.consent_reconfirm_at,
    },
    rider: isRider
      ? {
          verificationStatus: u.verification_status,
          nationalIdMasked: maskNationalId(u.national_id ?? ''),
          licenseNumber: u.license_number,
          plateNumber: u.plate_number,
          reliabilityScore: Number(u.reliability_score),
          claimSuspendedUntil: u.claim_suspended_until,
          rejectionReason: u.rejection_reason,
          rejectionCode: u.rejection_code,
        }
      : null,
    subscriptions: subscription.rows.map((s) => ({
      id: s.id,
      tier: s.tier,
      claimsUsed: Number(s.claims_used),
      claimsCap: s.claims_cap === null ? null : Number(s.claims_cap),
      status: s.status,
      startsAt: s.starts_at,
      expiresAt: s.expires_at,
    })),
    rides: rides.rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.created_at,
      completedAt: r.completed_at,
      destinationNote: r.destination_note,
      role: r.passenger_id === userId ? 'passenger' : 'rider',
      counterparty: r.passenger_id === userId ? r.rider_name : r.passenger_name,
    })),
    ratingsGiven: ratingsGiven.rows,
    ratingsReceived: ratingsReceived.rows,
    counts: counts.rows[0],
    reliabilityEvents: cancelEvents.rows.map((e) => ({
      id: String(e.id),
      toStatus: e.to_status,
      createdAt: e.created_at,
      rideRequestId: e.ride_request_id,
      meta: e.meta,
    })),
    strikes: strikes.rows,
    adminTrail: adminTrail.rows.map((a) => ({
      id: String(a.id),
      actionType: a.action_type,
      reasonCode: a.reason_code,
      reasonFreetext: a.reason_freetext,
      adminEmail: a.admin_email,
      createdAt: a.created_at,
      beforeState: a.before_state,
      afterState: a.after_state,
    })),
  };
}

/**
 * §6.2 / §6.3 — the direct-edit bucket. No confirmation step, no reason field.
 *
 * The one thing that is NOT casual here is the phone number: it is the login
 * identifier. It is validated with the same normaliser the signup flow uses, it
 * must stay unique, and the account is pushed back through OTP verification, so
 * a correction cannot be used to hand an account to a different number.
 */
export async function updateUserBasics(
  admin: AdminIdentity,
  userId: string,
  input: { name?: string; phone?: string; adminNotes?: string }
) {
  const before = await pool.query(`SELECT name, phone, admin_notes FROM users WHERE id = $1`, [userId]);
  if (!before.rows.length) throw errors.notFound('That account was not found.');
  const b = before.rows[0];

  const updates: string[] = [];
  const params: unknown[] = [userId];
  const after: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 2 || name.length > 50) throw errors.badRequest('A name must be 2 to 50 characters.');
    params.push(name);
    updates.push(`name = $${params.length}`);
    after.name = name;
  }

  let phoneChanged = false;
  if (input.phone !== undefined && input.phone.trim() !== b.phone) {
    const phone = normalizePhone(input.phone);
    if (!phone) throw errors.badRequest('Enter a valid Rwandan number (07x…). Corrections use the same rules as signup.');
    const taken = await pool.query(`SELECT 1 FROM users WHERE phone = $1 AND id <> $2`, [phone, userId]);
    if (taken.rows.length) throw errors.conflict('Another account already uses that phone number.');
    params.push(phone);
    updates.push(`phone = $${params.length}`);
    after.phone = phone;
    phoneChanged = true;
  }

  if (input.adminNotes !== undefined) {
    params.push(input.adminNotes.slice(0, 4000));
    updates.push(`admin_notes = $${params.length}`);
    after.adminNotes = true;
  }

  if (!updates.length) return { updated: false };

  if (phoneChanged) {
    // Force the account back through OTP on the new number.
    updates.push(`otp_code_hash = NULL`, `otp_expires_at = NULL`, `otp_attempts = 0`);
  }

  return gatedAction(admin, async (client) => {
    await client.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $1`, params);
    return {
      result: { updated: true, phoneChanged, reverificationRequired: phoneChanged },
      audit: {
        actionType: phoneChanged ? 'user.phone_corrected' : 'user.details_edited',
        targetType: 'user',
        targetId: userId,
        beforeState: { name: b.name, phone: b.phone, hadNotes: !!b.admin_notes },
        afterState: after,
      },
    };
  });
}

/**
 * §5.2 / §6.2 — suspend / ban / reinstate. The single most destructive action
 * in the console, so a ban additionally requires the operator to type the
 * user's phone number, and that is checked HERE, server-side — a UI-only
 * confirmation would be no control at all.
 */
export async function setAccountStatus(
  admin: AdminIdentity,
  userId: string,
  input: {
    status: 'active' | 'suspended' | 'banned';
    reasonCode: ModerationReasonCode;
    reasonFreetext: string;
    suspendDays?: number;
    confirmPhone?: string;
  }
) {
  if (!MODERATION_REASON_CODES.includes(input.reasonCode)) {
    throw errors.badRequest('Choose a reason code.');
  }
  const freetext = input.reasonFreetext?.trim() ?? '';
  if (freetext.length < 5) throw errors.badRequest('Write the reason for this decision.');

  const before = await pool.query(
    `SELECT name, phone, account_status, suspended_until FROM users WHERE id = $1`,
    [userId]
  );
  if (!before.rows.length) throw errors.notFound('That account was not found.');
  const b = before.rows[0];

  if (input.status === 'banned') {
    if (!input.confirmPhone || input.confirmPhone.replace(/\s/g, '') !== b.phone) {
      throw errors.badRequest(
        'To ban an account, type the exact phone number on the account to confirm. This cannot be undone by a single click.'
      );
    }
  }
  if (input.status === 'suspended' && (!input.suspendDays || input.suspendDays < 1 || input.suspendDays > 365)) {
    throw errors.badRequest('A suspension needs a length between 1 and 365 days.');
  }

  return gatedAction(admin, async (client) => {
    const suspendedUntil =
      input.status === 'suspended' ? new Date(Date.now() + input.suspendDays! * 86_400_000) : null;

    // `disabled` is the flag the consumer app already checks at login, so
    // keeping it in sync is what actually makes a ban take effect there.
    await client.query(
      `UPDATE users
       SET account_status = $2::account_status, suspended_until = $3, status_reason = $4,
           disabled = ($2::account_status <> 'active'),
           review_flag = CASE WHEN $2::account_status = 'active' THEN false ELSE review_flag END
       WHERE id = $1`,
      [userId, input.status, suspendedUntil, freetext]
    );

    if (input.status !== 'active') {
      // Free any ride they are holding so a passenger is not left stranded.
      await client.query(
        `UPDATE ride_requests SET status = 'VISIBLE', claimed_by = NULL, claimed_at = NULL, confirm_deadline = NULL
         WHERE claimed_by = $1 AND status = 'CLAIMED'`,
        [userId]
      );
    }

    return {
      result: { accountStatus: input.status, suspendedUntil },
      audit: {
        actionType:
          input.status === 'banned'
            ? 'user.banned'
            : input.status === 'suspended'
              ? 'user.suspended'
              : 'user.reinstated',
        targetType: 'user',
        targetId: userId,
        reasonCode: input.reasonCode,
        reasonFreetext: freetext,
        beforeState: { accountStatus: b.account_status, suspendedUntil: b.suspended_until },
        afterState: { accountStatus: input.status, suspendedUntil, name: b.name, phone: b.phone },
      },
    };
  });
}

/** §5.2 — a warning: notifies nothing destructive, but logs a strike on the record. */
export async function warnUser(
  admin: AdminIdentity,
  userId: string,
  input: { reasonCode: ModerationReasonCode; reasonFreetext: string; rideRequestId?: string }
) {
  const freetext = input.reasonFreetext?.trim() ?? '';
  if (freetext.length < 5) throw errors.badRequest('Write what the user is being warned about.');
  if (!MODERATION_REASON_CODES.includes(input.reasonCode)) throw errors.badRequest('Choose a reason code.');

  const exists = await pool.query(`SELECT name FROM users WHERE id = $1`, [userId]);
  if (!exists.rows.length) throw errors.notFound('That account was not found.');

  return gatedAction(admin, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO user_strikes (user_id, admin_user_id, ride_request_id, reason_code, note)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, admin.id, input.rideRequestId ?? null, input.reasonCode, freetext]
    );
    const count = await client.query(`SELECT count(*)::int AS n FROM user_strikes WHERE user_id = $1`, [userId]);
    return {
      result: { strikeId: rows[0].id, totalStrikes: count.rows[0].n },
      audit: {
        actionType: 'user.warned',
        targetType: 'user',
        targetId: userId,
        reasonCode: input.reasonCode,
        reasonFreetext: freetext,
        afterState: { totalStrikes: count.rows[0].n, rideRequestId: input.rideRequestId ?? null },
      },
    };
  });
}

/** §6.2 — manual verification override (distinct from the queue's own decisions). */
export async function overrideVerification(
  admin: AdminIdentity,
  riderId: string,
  input: { status: 'pending_verification' | 'verified' | 'rejected'; reasonFreetext: string }
) {
  const freetext = input.reasonFreetext?.trim() ?? '';
  if (freetext.length < 5) throw errors.badRequest('Write why the verification status is being overridden.');

  return gatedAction(admin, async (client) => {
    const { rows } = await client.query(
      `SELECT verification_status FROM rider_profiles WHERE user_id = $1 FOR UPDATE`,
      [riderId]
    );
    if (!rows.length) throw errors.notFound('That rider profile was not found.');

    await client.query(
      `UPDATE rider_profiles
       SET verification_status = $2::verification_status,
           verified_at = CASE WHEN $2::verification_status = 'verified' THEN now() ELSE verified_at END,
           decided_at = now(), decided_by = $3, updated_at = now()
       WHERE user_id = $1`,
      [riderId, input.status, admin.id]
    );

    return {
      result: { verificationStatus: input.status },
      audit: {
        actionType: 'user.verification_overridden',
        targetType: 'rider',
        targetId: riderId,
        reasonFreetext: freetext,
        beforeState: { verificationStatus: rows[0].verification_status },
        afterState: { verificationStatus: input.status },
      },
    };
  });
}

/**
 * Expires time-limited suspensions. Called by the sweeper so a 7-day suspension
 * actually ends after 7 days instead of waiting for someone to notice.
 */
export async function expireSuspensions() {
  const { rowCount } = await pool.query(
    `UPDATE users SET account_status = 'active', disabled = false, suspended_until = NULL
     WHERE account_status = 'suspended' AND suspended_until IS NOT NULL AND suspended_until <= now()`
  );
  return rowCount ?? 0;
}
