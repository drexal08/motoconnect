/**
 * Live ops (admin spec §5).
 *
 * §5.1: admins see EXACT coordinates. That is not a contradiction of the main
 * PRD's anonymisation rule — the jitter exists to stop riders learning exactly
 * where a passenger is standing before they are matched. It was never about
 * hiding operational data from the operator resolving a dispute.
 */
import { pool } from '../../db/pool.js';
import { errors } from '../../lib/errors.js';
import { gatedAction, logPiiAccess } from '../../lib/audit.js';
import type { AdminIdentity } from '../../lib/adminAuth.js';
import { DISPUTE_RATING_THRESHOLD, RIDE_TRACK_RETENTION_DAYS } from '../../config.js';

export const LIVE_STATUSES = ['CLAIMED', 'CONFIRMED', 'EN_ROUTE', 'ARRIVED'] as const;

/** §5.1 — every in-flight ride, with both the pickup pin and the rider's last position. */
export async function listLiveRides() {
  const { rows } = await pool.query(
    `SELECT r.id, r.status, r.created_at, r.claimed_at, r.confirmed_at, r.rider_arrived_at,
            r.confirm_deadline, r.destination_note,
            ST_Y(r.pickup_geog::geometry) AS pickup_lat,
            ST_X(r.pickup_geog::geometry) AS pickup_lng,
            p.id AS passenger_id, p.name AS passenger_name, p.phone AS passenger_phone,
            d.id AS rider_id, d.name AS rider_name, d.phone AS rider_phone,
            rp.plate_number, rp.reliability_score,
            rl.last_lat AS rider_lat, rl.last_lng AS rider_lng, rl.updated_at AS rider_seen_at
     FROM ride_requests r
     JOIN users p ON p.id = r.passenger_id
     LEFT JOIN users d ON d.id = r.claimed_by
     LEFT JOIN rider_profiles rp ON rp.user_id = r.claimed_by
     LEFT JOIN user_locations rl ON rl.user_id = r.claimed_by
     WHERE r.status = ANY($1)
     ORDER BY r.claimed_at ASC NULLS LAST`,
    [LIVE_STATUSES]
  );

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    createdAt: r.created_at,
    claimedAt: r.claimed_at,
    confirmedAt: r.confirmed_at,
    riderArrivedAt: r.rider_arrived_at,
    confirmDeadline: r.confirm_deadline,
    destinationNote: r.destination_note,
    pickup: { lat: Number(r.pickup_lat), lng: Number(r.pickup_lng) },
    passenger: { id: r.passenger_id, name: r.passenger_name, phone: r.passenger_phone },
    rider: r.rider_id
      ? {
          id: r.rider_id,
          name: r.rider_name,
          phone: r.rider_phone,
          plate: r.plate_number,
          reliabilityScore: r.reliability_score === null ? null : Number(r.reliability_score),
          position:
            r.rider_lat === null ? null : { lat: Number(r.rider_lat), lng: Number(r.rider_lng) },
          lastSeenAt: r.rider_seen_at,
        }
      : null,
  }));
}

/** §5.1 — one ride, with every state transition timestamped and the location trail. */
export async function getRideDetail(admin: AdminIdentity, rideId: string) {
  const { rows } = await pool.query(
    `SELECT r.*, ST_Y(r.pickup_geog::geometry) AS pickup_lat, ST_X(r.pickup_geog::geometry) AS pickup_lng,
            p.name AS passenger_name, p.phone AS passenger_phone, p.account_status AS passenger_status,
            d.name AS rider_name, d.phone AS rider_phone, d.account_status AS rider_status,
            rp.plate_number, rp.reliability_score
     FROM ride_requests r
     JOIN users p ON p.id = r.passenger_id
     LEFT JOIN users d ON d.id = r.claimed_by
     LEFT JOIN rider_profiles rp ON rp.user_id = r.claimed_by
     WHERE r.id = $1`,
    [rideId]
  );
  if (!rows.length) throw errors.notFound('That ride was not found.');
  const r = rows[0];

  const [events, ratings, track, review] = await Promise.all([
    pool.query(
      `SELECT e.id, e.from_status, e.to_status, e.created_at, e.meta, u.name AS actor_name
       FROM ride_events e LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.ride_request_id = $1 ORDER BY e.created_at ASC`,
      [rideId]
    ),
    pool.query(
      `SELECT rt.stars, rt.comment, rt.created_at, rt.rated_by, rt.rated_user,
              b.name AS rated_by_name, t.name AS rated_user_name
       FROM ratings rt
       LEFT JOIN users b ON b.id = rt.rated_by
       LEFT JOIN users t ON t.id = rt.rated_user
       WHERE rt.ride_request_id = $1 ORDER BY rt.created_at ASC`,
      [rideId]
    ),
    pool.query(
      `SELECT lat, lng, recorded_at, user_id FROM ride_tracks
       WHERE ride_request_id = $1 ORDER BY recorded_at ASC LIMIT 500`,
      [rideId]
    ),
    pool.query(
      `SELECT dr.outcome, dr.reason_code, dr.note, dr.resolved_at, a.email AS resolved_by_email
       FROM dispute_reviews dr LEFT JOIN admin_users a ON a.id = dr.resolved_by
       WHERE dr.ride_request_id = $1`,
      [rideId]
    ),
  ]);

  await logPiiAccess(admin, {
    actionType: 'liveops.ride_opened',
    targetType: 'ride_request',
    targetId: rideId,
    afterState: { status: r.status },
  });

  return {
    id: r.id,
    status: r.status,
    destinationNote: r.destination_note,
    pickup: { lat: Number(r.pickup_lat), lng: Number(r.pickup_lng) },
    pickupAccuracyM: r.pickup_accuracy_m === null ? null : Number(r.pickup_accuracy_m),
    claimAttempts: r.claim_attempts,
    cancelReason: r.cancel_reason,
    timestamps: {
      createdAt: r.created_at,
      firstVisibleAt: r.first_visible_at,
      claimedAt: r.claimed_at,
      confirmDeadline: r.confirm_deadline,
      confirmedAt: r.confirmed_at,
      riderArrivedAt: r.rider_arrived_at,
      completedAt: r.completed_at,
      noShowFlagAt: r.no_show_flag_at,
    },
    passenger: {
      id: r.passenger_id,
      name: r.passenger_name,
      phone: r.passenger_phone,
      accountStatus: r.passenger_status,
    },
    rider: r.claimed_by
      ? {
          id: r.claimed_by,
          name: r.rider_name,
          phone: r.rider_phone,
          accountStatus: r.rider_status,
          plate: r.plate_number,
          reliabilityScore: r.reliability_score === null ? null : Number(r.reliability_score),
        }
      : null,
    events: events.rows.map((e) => ({
      id: String(e.id),
      fromStatus: e.from_status,
      toStatus: e.to_status,
      actorName: e.actor_name,
      createdAt: e.created_at,
      meta: e.meta,
    })),
    ratings: ratings.rows,
    track: track.rows.map((t) => ({
      lat: Number(t.lat),
      lng: Number(t.lng),
      recordedAt: t.recorded_at,
      userId: t.user_id,
    })),
    disputeReview: review.rows[0] ?? null,
  };
}

/**
 * §5.2 — the dispute queue is derived, not a table: every NO_SHOW ride, plus
 * every ride carrying a rating at or below the auto-flag threshold, minus the
 * ones already resolved. Nothing to backfill, nothing to drift out of sync.
 */
export async function listDisputes(opts: { includeResolved?: boolean } = {}) {
  const { rows } = await pool.query(
    `WITH flagged AS (
       SELECT r.id,
              CASE WHEN r.status = 'NO_SHOW' THEN 'no_show' ELSE 'low_rating' END AS trigger,
              COALESCE(r.no_show_flag_at, r.completed_at, r.updated_at) AS flagged_at
       FROM ride_requests r
       WHERE r.status = 'NO_SHOW'
       UNION
       SELECT r.id, 'low_rating' AS trigger, rt.created_at AS flagged_at
       FROM ride_requests r
       JOIN ratings rt ON rt.ride_request_id = r.id
       WHERE rt.stars <= $1
     )
     SELECT f.id, f.trigger, f.flagged_at, r.status, r.destination_note,
            p.id AS passenger_id, p.name AS passenger_name, p.phone AS passenger_phone,
            d.id AS rider_id, d.name AS rider_name, d.phone AS rider_phone,
            (SELECT min(rt.stars) FROM ratings rt WHERE rt.ride_request_id = f.id) AS lowest_rating,
            (SELECT rt.comment FROM ratings rt WHERE rt.ride_request_id = f.id
              ORDER BY rt.stars ASC LIMIT 1) AS lowest_comment,
            dr.outcome, dr.resolved_at, a.email AS resolved_by_email
     FROM flagged f
     JOIN ride_requests r ON r.id = f.id
     JOIN users p ON p.id = r.passenger_id
     LEFT JOIN users d ON d.id = r.claimed_by
     LEFT JOIN dispute_reviews dr ON dr.ride_request_id = f.id
     LEFT JOIN admin_users a ON a.id = dr.resolved_by
     WHERE ($2::boolean OR dr.id IS NULL)
     ORDER BY (dr.id IS NULL) DESC, f.flagged_at DESC
     LIMIT 200`,
    [DISPUTE_RATING_THRESHOLD, opts.includeResolved ?? false]
  );

  return rows.map((r) => ({
    rideId: r.id,
    trigger: r.trigger,
    flaggedAt: r.flagged_at,
    status: r.status,
    destinationNote: r.destination_note,
    passenger: { id: r.passenger_id, name: r.passenger_name, phone: r.passenger_phone },
    rider: r.rider_id ? { id: r.rider_id, name: r.rider_name, phone: r.rider_phone } : null,
    lowestRating: r.lowest_rating === null ? null : Number(r.lowest_rating),
    lowestComment: r.lowest_comment,
    resolved: !!r.outcome,
    outcome: r.outcome,
    resolvedAt: r.resolved_at,
    resolvedByEmail: r.resolved_by_email,
  }));
}

/**
 * §5.2 — "Dismiss" closes the dispute with no action. Warn/suspend/ban are
 * applied through usersService (so they share one moderation code path) and
 * then recorded here; this function only writes the dismissal itself.
 */
export async function resolveDispute(
  admin: AdminIdentity,
  rideId: string,
  input: { outcome: 'dismissed' | 'warned' | 'suspended' | 'banned'; reasonCode?: string; note: string }
) {
  const note = input.note?.trim() ?? '';
  if (note.length < 3) throw errors.badRequest('Write a short note explaining the outcome.');

  return gatedAction(admin, async (client) => {
    const exists = await client.query(`SELECT status FROM ride_requests WHERE id = $1`, [rideId]);
    if (!exists.rows.length) throw errors.notFound('That ride was not found.');

    await client.query(
      `INSERT INTO dispute_reviews (ride_request_id, outcome, reason_code, note, resolved_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (ride_request_id) DO UPDATE
         SET outcome = EXCLUDED.outcome, reason_code = EXCLUDED.reason_code,
             note = EXCLUDED.note, resolved_by = EXCLUDED.resolved_by, resolved_at = now()`,
      [rideId, input.outcome, input.reasonCode ?? null, note, admin.id]
    );

    return {
      result: { outcome: input.outcome },
      audit: {
        actionType: 'dispute.resolved',
        targetType: 'ride_request',
        targetId: rideId,
        reasonCode: input.reasonCode ?? null,
        reasonFreetext: note,
        afterState: { outcome: input.outcome, rideStatus: exists.rows[0].status },
      },
    };
  });
}

/**
 * §6.3 — "any manual ride-state override (e.g. admin manually resolving a stuck
 * ride)" is in the gated bucket. Only the terminal states are reachable: an
 * admin resolves a stuck ride, they do not drive it through the lifecycle by
 * hand.
 */
const OVERRIDE_TARGETS = ['COMPLETED', 'CANCELLED_BY_PASSENGER', 'CANCELLED_BY_RIDER', 'NO_SHOW', 'EXPIRED'] as const;
export type OverrideStatus = (typeof OVERRIDE_TARGETS)[number];

export async function overrideRideStatus(
  admin: AdminIdentity,
  rideId: string,
  input: { status: OverrideStatus; reasonFreetext: string }
) {
  if (!OVERRIDE_TARGETS.includes(input.status)) {
    throw errors.badRequest('An override can only move a stuck ride to a final state.');
  }
  const freetext = input.reasonFreetext?.trim() ?? '';
  if (freetext.length < 5) throw errors.badRequest('Write why this ride is being force-closed.');

  return gatedAction(admin, async (client) => {
    const { rows } = await client.query(`SELECT status, passenger_id, claimed_by FROM ride_requests WHERE id = $1 FOR UPDATE`, [
      rideId,
    ]);
    if (!rows.length) throw errors.notFound('That ride was not found.');
    const before = rows[0];

    await client.query(
      `UPDATE ride_requests
       SET status = $2::request_status,
           completed_at = CASE WHEN $2::request_status = 'COMPLETED'
                               THEN COALESCE(completed_at, now()) ELSE completed_at END,
           updated_at = now()
       WHERE id = $1`,
      [rideId, input.status]
    );
    // The ride's own event trail records it too, so the consumer-side history
    // is not silently inconsistent with the admin log.
    await client.query(
      `INSERT INTO ride_events (ride_request_id, from_status, to_status, actor_id, meta)
       VALUES ($1, $2, $3, NULL, $4)`,
      [rideId, before.status, input.status, JSON.stringify({ adminOverride: true, adminEmail: admin.email })]
    );

    return {
      result: { status: input.status },
      audit: {
        actionType: 'ride.status_overridden',
        targetType: 'ride_request',
        targetId: rideId,
        reasonFreetext: freetext,
        beforeState: { status: before.status },
        afterState: { status: input.status },
      },
    };
  });
}

/** Short-retention breadcrumb cleanup — called from the sweeper. */
export async function pruneRideTracks() {
  const { rowCount } = await pool.query(
    `DELETE FROM ride_tracks WHERE recorded_at < now() - ($1::int * interval '1 day')`,
    [RIDE_TRACK_RETENTION_DAYS]
  );
  return rowCount ?? 0;
}
