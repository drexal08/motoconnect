import { pool } from '../db/pool.js';
import type { PoolClient } from 'pg';
import { errors } from '../lib/errors.js';
import {
  CLAIM_WINDOW_MS,
  CONFIRM_WINDOW_MS,
  NO_SHOW_WAIT_MS,
  POOL_RADIUS_M,
  RIDER_CANCEL_SUSPENSION_MS,
  TIER_DEFS,
  type Tier,
} from '../config.js';
import { generateJitter, jitteredPoint, distanceBand, bearing8, type LatLng } from '../lib/geo.js';
import { emit, REQUEST_EVENT } from '../lib/events.js';

export const REQUEST_OPEN_STATUSES = ['CLAIMED', 'CONFIRMED', 'EN_ROUTE', 'ARRIVED'] as const;

type Row = Record<string, any>;

function rowPoint(r: Row): LatLng {
  return { lat: Number(r.lat), lng: Number(r.lng) };
}

/** Passive checks that gate every claim — the atomic CAS does the real work. */
async function assertRiderCanClaim(riderId: string) {
  const { rows } = await pool.query(
    `SELECT rp.verification_status, rp.claim_suspended_until,
            (SELECT count(*) FROM ride_requests rr
              WHERE rr.claimed_by = $1 AND rr.status = ANY($2)) AS open_rides
     FROM rider_profiles rp WHERE rp.user_id = $1`,
    [riderId, REQUEST_OPEN_STATUSES]
  );
  const rp = rows[0] as
    | { verification_status: string; claim_suspended_until: Date | null; open_rides: string }
    | undefined;
  if (!rp) throw errors.forbidden('You are not registered as a rider.');
  if (rp.verification_status !== 'verified') {
    throw errors.forbidden('Your rider account is still being verified. You cannot see requests yet.');
  }
  if (rp.claim_suspended_until && new Date(rp.claim_suspended_until) > new Date()) {
    const until = new Date(rp.claim_suspended_until);
    throw errors.forbidden(
      `Your claim access is paused until ${until.toLocaleString()}, because of cancelled rides.`
    );
  }
  if (Number(rp.open_rides) > 0) {
    throw errors.conflict('Finish your current ride before claiming another one.');
  }

  const sub = await pool.query(
    `SELECT tier, claims_used, claims_cap, expires_at FROM subscriptions
     WHERE rider_id = $1 AND status = 'active' AND expires_at > now()
     ORDER BY expires_at DESC LIMIT 1`,
    [riderId]
  );
  if (!sub.rows.length) {
    throw errors.forbidden('You need an active plan to claim rides. Choose a plan in Pricing.');
  }
  const s = sub.rows[0];
  if (s.claims_cap !== null && Number(s.claims_used) >= Number(s.claims_cap)) {
    throw errors.conflict('You have used all your claims for this plan. Renew or upgrade in Pricing.');
  }

  // Mandatory rating gate: an unrated COMPLETED ride blocks new claims.
  const unrated = await pool.query(
    `SELECT rr.id FROM ride_requests rr
     WHERE rr.status = 'COMPLETED' AND rr.claimed_by = $1
       AND NOT EXISTS (SELECT 1 FROM ratings rt WHERE rt.ride_request_id = rr.id AND rt.rated_by = $1)
     LIMIT 1`,
    [riderId]
  );
  if (unrated.rows.length) {
    throw errors.conflict('Rate your last ride before taking a new one.');
  }
}

export interface PoolItem {
  id: string;
  lat: number;
  lng: number;
  distanceBandM: number;
  direction: string;
  destinationNote: string | null;
  createdAt: string;
}

/**
 * PRD §3.2: riders only ever see jittered markers + distance band + direction.
 * Exact coordinates stay server-side.
 */
export async function getPoolForRider(
  riderId: string,
  location: LatLng
): Promise<PoolItem[]> {
  const { rows } = await pool.query(
    `SELECT r.id,
            ST_Y(r.pickup_geog::geometry) AS lat,
            ST_X(r.pickup_geog::geometry) AS lng,
            r.jitter_dlat, r.jitter_dlng,
            ST_Distance(r.pickup_geog, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS dist_m,
            r.destination_note, r.created_at
     FROM ride_requests r
     WHERE r.status = 'VISIBLE'
       AND r.first_visible_at IS NOT NULL
       AND r.first_visible_at > now() - interval '10 minutes'
       AND ST_DWithin(r.pickup_geog, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3)
     ORDER BY dist_m ASC`,
    [location.lat, location.lng, POOL_RADIUS_M]
  );

  return rows.map((r: Row) => {
    const jittered = jitteredPoint(rowPoint(r), { dlat: Number(r.jitter_dlat || 0), dlng: Number(r.jitter_dlng || 0) });
    return {
      id: r.id,
      lat: jittered.lat,
      lng: jittered.lng,
      distanceBandM: distanceBand(Number(r.dist_m)),
      direction: bearing8(location, rowPoint(r)),
      destinationNote: r.destination_note,
      createdAt: new Date(r.created_at).toISOString(),
    };
  });
}

export async function createRequest(
  passengerId: string,
  pickup: LatLng,
  opts: { accuracyM?: number; destinationNote?: string }
) {
  const cons = await pool.query(
    `SELECT location_consent_granted, consent_reconfirm_at FROM users WHERE id = $1`,
    [passengerId]
  );
  if (!cons.rows.length) throw errors.unauthorized();
  if (!cons.rows[0].location_consent_granted) {
    throw errors.forbidden('Share your location first so we can find you a rider.', 'LOCATION_CONSENT_REQUIRED');
  }
  if (cons.rows[0].consent_reconfirm_at && new Date(cons.rows[0].consent_reconfirm_at) <= new Date()) {
    throw errors.forbidden('Please confirm your location sharing again before requesting a ride.', 'LOCATION_CONSENT_REFRESH_REQUIRED');
  }

  const active = await pool.query(
    `SELECT 1 FROM ride_requests WHERE passenger_id = $1 AND status = ANY($2) LIMIT 1`,
    [passengerId, REQUEST_OPEN_STATUSES]
  );
  if (active.rows.length) throw errors.conflict('You already have an active ride request.');

  const unrated = await pool.query(
    `SELECT 1 FROM ride_requests WHERE passenger_id = $1 AND status = 'COMPLETED'
       AND NOT EXISTS (SELECT 1 FROM ratings rt WHERE rt.ride_request_id = ride_requests.id AND rt.rated_by = $1)
     LIMIT 1`,
    [passengerId]
  );
  if (unrated.rows.length) throw errors.conflict('Rate your last ride before requesting a new one.');

  const jitter = generateJitter();
  const { rows } = await pool.query(
    `INSERT INTO ride_requests
       (passenger_id, status, pickup_geog, pickup_accuracy_m, destination_note,
        first_visible_at, jitter_dlat, jitter_dlng)
     VALUES ($1, 'VISIBLE', ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, $4, $5, now(), $6, $7)
     RETURNING id, status, created_at`,
    [passengerId, pickup.lat, pickup.lng, opts.accuracyM ?? null, opts.destinationNote ?? null, jitter.dlat, jitter.dlng]
  );

  const req = rows[0];
  await logEvent(req.id, 'CREATED', 'VISIBLE', passengerId, { pickupAccuracyM: opts.accuracyM ?? null });
  emit(REQUEST_EVENT, { id: req.id, status: 'VISIBLE', passengerId });
  return { id: req.id, status: req.status, createdAt: req.created_at };
}

/**
 * PRD §6.4 — the core race condition of the product. This is a single atomic
 * UPDATE with a status guard (compare-and-swap at the database level). The ORM
 * is deliberately raw SQL: a read-then-write pattern would be a TOCTOU bug.
 */
export async function claimRequest(riderId: string, requestId: string) {
  await assertRiderCanClaim(riderId);

  const res = await pool.query(
    `UPDATE ride_requests
     SET status = 'CLAIMED', claimed_by = $1, claimed_at = now(),
    confirm_deadline = now() + ($4::int * interval '1 millisecond'),
     updated_at = now()
     WHERE id = $2 AND status = 'VISIBLE'
       AND now() <= first_visible_at + interval '10 minutes'
     RETURNING id, passenger_id, claimed_at`,
    [riderId, requestId, CONFIRM_WINDOW_MS]
  );

  if (!res.rows.length) {
    throw errors.conflict('This request is no longer available. It was claimed or expired.');
  }

  const { rows } = await pool.query(
    `SELECT name FROM users WHERE id = $1`,
    [res.rows[0].passenger_id]
  );

  await logEvent(requestId, 'VISIBLE', 'CLAIMED', riderId);
  emit(REQUEST_EVENT, {
    id: requestId,
    status: 'CLAIMED',
    claimedBy: riderId,
    passengerId: res.rows[0].passenger_id,
    claimedAt: res.rows[0].claimed_at,
    passengerName: rows[0]?.name ?? null,
  });

  return { claimedAt: res.rows[0].claimed_at };
}

/**
 * PRD §3.2 step 4 + §5.2. Only here (passenger confirm) does a claim consume
 * quota, and only here are exact coordinates revealed to the rider.
 * One transaction: confirm + quota consume, both guarded atomically.
 */
export async function confirmRequest(passengerId: string, requestId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const confirmed = await client.query(
      `UPDATE ride_requests
       SET status = 'CONFIRMED', confirmed_at = now(), updated_at = now()
       WHERE id = $1 AND passenger_id = $2 AND status = 'CLAIMED'
         AND now() <= confirm_deadline
       RETURNING id, claimed_by`,
      [requestId, passengerId]
    );

    if (!confirmed.rows.length) {
      await client.query('ROLLBACK');
      // Distinguish "expired" from "not yours".
      const chk = await client.query(`SELECT status, claimed_by FROM ride_requests WHERE id = $1`, [requestId]);
      const st = chk.rows[0]?.status;
      if (st === 'CLAIMED') {
        throw errors.badRequest('The rider you approved waited too long and the claim expired. Request a new ride.');
      }
      throw errors.conflict('This request can no longer be confirmed.');
    }

    const riderId = confirmed.rows[0].claimed_by as string;

    // §5.2: quota is consumed here, server-side, atomically.
    const quota = await client.query(
      `UPDATE subscriptions
       SET claims_used = claims_used + 1
       WHERE rider_id = $1 AND status = 'active' AND expires_at > now()
         AND (claims_cap IS NULL OR claims_used < claims_cap)
       RETURNING id`,
      [riderId]
    );

    if (!quota.rows.length) {
      // Rider's plan ran out between claim and confirm — put the request back.
      await client.query(
        `UPDATE ride_requests SET status = 'VISIBLE', claimed_by = NULL, claimed_at = NULL,
                confirm_deadline = NULL, updated_at = now()
         WHERE id = $1`,
        [requestId]
      );
      await client.query('COMMIT');
      emit(REQUEST_EVENT, { id: requestId, status: 'VISIBLE' });
      throw errors.conflict('The rider hit their plan limit. Request a new ride.');
    }

    await logEvent(requestId, 'CLAIMED', 'CONFIRMED', passengerId, {}, client);
    await client.query('COMMIT');

    const rider = await pool.query(
      `SELECT u.name, u.phone, rp.plate_number, rp.reliability_score,
              ST_Y(rr.pickup_geog::geometry) AS lat, ST_X(rr.pickup_geog::geometry) AS lng
       FROM ride_requests rr
       JOIN rider_profiles rp ON rp.user_id = rr.claimed_by
       JOIN users u ON u.id = rp.user_id
       WHERE rr.id = $1`,
      [requestId]
    );

    emit(REQUEST_EVENT, {
      id: requestId,
      status: 'CONFIRMED',
      passengerId,
      claimedBy: riderId,
      rider: {
        id: riderId,
        name: rider.rows[0]?.name ?? null,
        plate: rider.rows[0]?.plate_number ?? null,
        rating: rider.rows[0]?.reliability_score ?? null,
      },
      pickupExact: rider.rows[0] ? { lat: Number(rider.rows[0].lat), lng: Number(rider.rows[0].lng) } : null,
    });

    return { confirmedAt: new Date().toISOString() };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    throw err;
  } finally {
    client.release();
  }
}

/** Rider lifecycle actions after CONFIRMED. */
export async function riderAction(
  riderId: string,
  requestId: string,
  action: 'enroute' | 'arrived' | 'no_show' | 'complete' | 'cancel'
) {
  const claim = await pool.query(
    `SELECT id, status, claimed_by, passenger_id, rider_arrived_at FROM ride_requests WHERE id = $1 AND claimed_by = $2`,
    [requestId, riderId]
  );
  if (!claim.rows.length) throw errors.notFound('This ride is not yours.');

  const req = claim.rows[0];
  const cur: string = req.status;

  switch (action) {
    case 'enroute': {
      if (cur !== 'CONFIRMED') throw errors.conflict('This ride is not waiting for you to head over.');
      await setStatus(requestId, 'EN_ROUTE', riderId, req.passenger_id);
      break;
    }
    case 'arrived': {
      if (cur !== 'EN_ROUTE' && cur !== 'CONFIRMED') {
        throw errors.conflict('You can only mark arrival while heading to the passenger.');
      }
      const res = await pool.query(
        `UPDATE ride_requests SET status = 'ARRIVED', rider_arrived_at = now(), updated_at = now()
         WHERE id = $1 AND status IN ('EN_ROUTE','CONFIRMED') RETURNING id`,
        [requestId]
      );
      if (!res.rows.length) throw errors.conflict('This ride moved on already.');
      await logEvent(requestId, cur, 'ARRIVED', riderId);
      emit(REQUEST_EVENT, { id: requestId, status: 'ARRIVED', passengerId: req.passenger_id, claimedBy: riderId });
      break;
    }
    case 'no_show': {
      if (cur !== 'ARRIVED') {
        throw errors.conflict('Mark yourself arrived first, then wait 5 minutes before reporting a no-show.');
      }
      const arrivedAt = new Date(req.rider_arrived_at ?? 0).getTime();
      const waitedMs = Date.now() - arrivedAt;
      if (waitedMs < NO_SHOW_WAIT_MS) {
        const remaining = Math.ceil((NO_SHOW_WAIT_MS - waitedMs) / 1000);
        throw errors.conflict(`Wait ${remaining} more seconds before reporting a no-show.`);
      }
      await pool.query(
        `UPDATE ride_requests SET status = 'NO_SHOW', no_show_flag_at = now(), updated_at = now()
         WHERE id = $1 AND status = 'ARRIVED'`,
        [requestId]
      );
      await logEvent(requestId, 'ARRIVED', 'NO_SHOW', riderId);

      // §6.2: 3 no-shows in a month flags the passenger for manual review.
      const noshowCount = await pool.query(
        `SELECT count(*) FROM ride_requests
         WHERE passenger_id = $1 AND status = 'NO_SHOW'
           AND no_show_flag_at > now() - interval '30 days'`,
        [req.passenger_id]
      );
      if (Number(noshowCount.rows[0].count) >= 3) {
        await pool.query(`UPDATE users SET review_flag = true WHERE id = $1`, [req.passenger_id]);
      }
      emit(REQUEST_EVENT, { id: requestId, status: 'NO_SHOW', passengerId: req.passenger_id, claimedBy: riderId });
      break;
    }
    case 'complete': {
      if (!['ARRIVED', 'EN_ROUTE', 'CONFIRMED'].includes(cur)) {
        throw errors.conflict('You can only complete a ride after confirming it.');
      }
      await pool.query(
        `UPDATE ride_requests SET status = 'COMPLETED', completed_at = now(), updated_at = now()
         WHERE id = $1 AND status IN ('ARRIVED','EN_ROUTE','CONFIRMED')`,
        [requestId]
      );
      await logEvent(requestId, cur, 'COMPLETED', riderId);
      emit(REQUEST_EVENT, { id: requestId, status: 'COMPLETED', passengerId: req.passenger_id, claimedBy: riderId });
      break;
    }
    case 'cancel': {
      if (cur === 'COMPLETED' || cur === 'CANCELLED_BY_RIDER' || cur === 'NO_SHOW') {
        throw errors.conflict('This ride cannot be cancelled anymore.');
      }
      // §6.1: cancelling after CONFIRMED hits the reliability score; 3 in 7 days
      // → 24 h claim suspension.
      if (cur !== 'CLAIMED') {
        await applyRiderCancellationPenalty(riderId);
      }
      await pool.query(
        `UPDATE ride_requests SET status = 'CANCELLED_BY_RIDER', cancelled_by = $1, updated_at = now()
         WHERE id = $2 AND status NOT IN ('COMPLETED','CANCELLED_BY_RIDER','NO_SHOW')`,
        [riderId, requestId]
      );
      await logEvent(requestId, cur, 'CANCELLED_BY_RIDER', riderId, { penalty: cur !== 'CLAIMED' });
      emit(REQUEST_EVENT, {
        id: requestId,
        status: 'CANCELLED_BY_RIDER',
        passengerId: req.passenger_id,
        claimedBy: riderId,
      });
      break;
    }
  }
  return { status: action === 'cancel' ? 'CANCELLED_BY_RIDER' : toStatus(action) };
}

async function applyRiderCancellationPenalty(riderId: string) {
  const { rows } = await pool.query(
    `SELECT count(*) FROM ride_events
     WHERE actor_id = $1 AND to_status = 'CANCELLED_BY_RIDER'
       AND created_at > now() - interval '7 days'`,
    [riderId]
  );
  if (Number(rows[0].count) >= 3) {
    await pool.query(
      `UPDATE rider_profiles SET claim_suspended_until = now() + ($2::int || ' milliseconds')::interval
       WHERE user_id = $1`,
      [riderId, RIDER_CANCEL_SUSPENSION_MS]
    );
  }
}

function toStatus(action: string): string {
  switch (action) {
    case 'enroute': return 'EN_ROUTE';
    case 'arrived': return 'ARRIVED';
    case 'complete': return 'COMPLETED';
    case 'no_show': return 'NO_SHOW';
    default: return 'UNKNOWN';
  }
}

/** §6.1: passenger can cancel any time before COMPLETED; first 2/week are free. */
export async function cancelRequestAsPassenger(passengerId: string, requestId: string, reason?: string) {
  const { rows } = await pool.query(
    `SELECT status FROM ride_requests WHERE id = $1 AND passenger_id = $2`,
    [requestId, passengerId]
  );
  if (!rows.length) throw errors.notFound('This request was not found.');
  const cur = rows[0].status as string;
  if (cur === 'COMPLETED') throw errors.conflict('This ride is already finished.');

  await pool.query(
    `UPDATE ride_requests SET status = 'CANCELLED_BY_PASSENGER', cancelled_by = $1,
            cancel_reason = $3, updated_at = now()
     WHERE id = $2 AND status NOT IN ('COMPLETED','NO_SHOW','EXPIRED','EXPIRED_UNCLAIMED')`,
    [passengerId, requestId, reason ?? null]
  );
  await logEvent(requestId, cur, 'CANCELLED_BY_PASSENGER', passengerId, { reason: reason ?? null });

  const { rows: week } = await pool.query(
    `SELECT count(*) FROM ride_events
     WHERE actor_id = $1 AND to_status = 'CANCELLED_BY_PASSENGER'
       AND created_at > now() - interval '7 days'`,
    [passengerId]
  );
  const cancellationsThisWeek = Number(week[0]?.count ?? 0);

  emit(REQUEST_EVENT, { id: requestId, status: 'CANCELLED_BY_PASSENGER', passengerId });

  return {
    status: 'CANCELLED_BY_PASSENGER',
    // §6.1: first 2 cancellations/week are free, soft warning after that.
    warning:
      cancellationsThisWeek > 2
        ? 'You have cancelled several rides this week. Riders lose fuel and time when a ride is cancelled, so please only request rides you will take.'
        : null,
  };
}

/** Active ride for a user (either side). */
export async function getActiveRequestForUser(userId: string) {
  const { rows } = await pool.query(
    `SELECT rr.*, ST_Y(rr.pickup_geog::geometry) AS lat, ST_X(rr.pickup_geog::geometry) AS lng,
            p.name AS passenger_name, u.name AS rider_name, rp.plate_number, rp.reliability_score
     FROM ride_requests rr
     JOIN users p ON p.id = rr.passenger_id
     LEFT JOIN rider_profiles rp ON rp.user_id = rr.claimed_by
     LEFT JOIN users u ON u.id = rr.claimed_by
     WHERE (rr.passenger_id = $1 OR rr.claimed_by = $1)
       AND rr.status IN ('VISIBLE','CLAIMED','CONFIRMED','EN_ROUTE','ARRIVED')
     ORDER BY rr.created_at DESC LIMIT 1`,
    [userId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id,
    status: r.status,
    claimedAt: r.claimed_at,
    confirmDeadline: r.confirm_deadline,
    pickup: { lat: Number(r.lat), lng: Number(r.lng) },
    destinationNote: r.destination_note,
    passengerName: r.passenger_name,
    rider: r.claimed_by
      ? { id: r.claimed_by, name: r.rider_name, plate: r.plate_number, rating: r.reliability_score }
      : null,
  };
}

/** Unrated completed rides for a user (rating gate). */
export async function getUnratedCompleted(userId: string) {
  const { rows } = await pool.query(
    `SELECT rr.id, rr.completed_at, u.name AS other_name
     FROM ride_requests rr
     LEFT JOIN users u ON u.id = CASE WHEN rr.passenger_id = $1 THEN rr.claimed_by ELSE rr.passenger_id END
     WHERE rr.status = 'COMPLETED' AND (rr.passenger_id = $1 OR rr.claimed_by = $1)
       AND NOT EXISTS (SELECT 1 FROM ratings rt WHERE rt.ride_request_id = rr.id AND rt.rated_by = $1)
     ORDER BY rr.completed_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0] ? { id: rows[0].id, completedAt: rows[0].completed_at, otherName: rows[0].other_name } : null;
}

export async function rateRide(userId: string, requestId: string, stars: number, comment?: string) {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw errors.badRequest('Give a rating between 1 and 5 stars.');
  }
  const { rows } = await pool.query(
    `SELECT passenger_id, claimed_by, status FROM ride_requests WHERE id = $1`,
    [requestId]
  );
  if (!rows.length) throw errors.notFound('This ride was not found.');
  const r = rows[0];
  if (r.status !== 'COMPLETED') throw errors.conflict('You can only rate a finished ride.');

  const otherId = r.passenger_id === userId ? r.claimed_by : r.passenger_id;
  if (r.passenger_id !== userId && r.claimed_by !== userId) {
    throw errors.forbidden('This is not your ride.');
  }

  await pool.query(
    `INSERT INTO ratings (ride_request_id, rated_by, rated_user, stars, comment)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (ride_request_id, rated_by) DO NOTHING`,
    [requestId, userId, otherId, stars, comment ?? null]
  );

  // Keep the rider's reliability score in sync (simple rolling average).
  if (r.claimed_by === userId) {
    const agg = await pool.query(
      `SELECT avg(stars)::numeric(3,2) AS avg_stars FROM ratings WHERE rated_user = $1 AND stars IS NOT NULL`,
      [userId]
    );
    await pool.query(`UPDATE rider_profiles SET reliability_score = $2 WHERE user_id = $1`, [
      userId,
      agg.rows[0].avg_stars ?? 5,
    ]);
  }
  return { ok: true };
}

async function setStatus(requestId: string, to: string, actorId: string, passengerId: string) {
  await pool.query(`UPDATE ride_requests SET status = $2, updated_at = now() WHERE id = $1`, [
    requestId,
    to,
  ]);
  await logEvent(requestId, 'CONFIRMED', to, actorId);
  emit(REQUEST_EVENT, { id: requestId, status: to, passengerId, claimedBy: actorId });
}

async function logEvent(
  requestId: string,
  from: string,
  to: string,
  actorId: string,
  meta?: Record<string, unknown>,
  client: PoolClient | typeof pool = pool
) {
  await client.query(
    `INSERT INTO ride_events (ride_request_id, from_status, to_status, actor_id, meta)
     VALUES ($1, $2, $3, $4, $5)`,
    [requestId, from, to, actorId, meta ? JSON.stringify(meta) : null]
  );
}

export { TIER_DEFS };
