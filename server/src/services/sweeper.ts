/**
 * Background jobs (single-instance; wrap with pg_advisory_lock for safety if
 * the server is ever run in multi-instance mode):
 *  1. Claim window expiry (§3.2 step 5 / §6): CLAIMED → back to VISIBLE
 *     if the passenger never confirmed within 60 s.
 *  2. Unclaimed expiry: VISIBLE requests older than 10 min → EXPIRED_UNCLAIMED.
 *  3. Payment staleness: pending payments older than 10 min → failed.
 *  4. Data retention (§6.5): purge exact pickup coordinates after 90 days,
 *     keeping only de-identified heat-map points.
 */
import { pool } from '../db/pool.js';
import { LOCATION_RETENTION_DAYS, CLAIM_WINDOW_MS } from '../config.js';
import { emit, REQUEST_EVENT } from '../lib/events.js';

const PAYMENT_STALE_MS = 10 * 60 * 1000;

export async function sweepOnce() {
  // 1. Expired claims → back to the anonymized pool.
  const expiredClaims = await pool.query(
    `UPDATE ride_requests
     SET status = 'VISIBLE', claimed_by = NULL, claimed_at = NULL, confirm_deadline = NULL,
         claim_attempts = claim_attempts + 1, updated_at = now()
     WHERE status = 'CLAIMED'
       AND now() > claimed_at + ($2::int * interval '1 millisecond')
     RETURNING id, claimed_by`,
    [null, CLAIM_WINDOW_MS]
  );
  for (const r of expiredClaims.rows) {
    await pool.query(
      `INSERT INTO ride_events (ride_request_id, from_status, to_status, actor_id, meta)
       VALUES ($1, 'CLAIMED', 'VISIBLE', $2, '{"reason":"claim window expired"}'::jsonb)`,
      [r.id, r.claimed_by]
    );
    const passengerId = await pool
      .query(`SELECT passenger_id FROM ride_requests WHERE id = $1`, [r.id])
      .then((q) => q.rows[0]?.passenger_id ?? null);
    emit(REQUEST_EVENT, {
      id: r.id,
      status: 'VISIBLE',
      reason: 'claim-expired',
      passengerId,
      claimedBy: r.claimed_by,
    });
  }

  // 2. Nobody claimed within 10 minutes of first visibility.
  const unclaimed = await pool.query(
    `UPDATE ride_requests
     SET status = 'EXPIRED_UNCLAIMED', updated_at = now()
     WHERE status = 'VISIBLE' AND first_visible_at IS NOT NULL
       AND now() > first_visible_at + interval '10 minutes'
     RETURNING id`
  );
  for (const r of unclaimed.rows) {
    await pool.query(
      `INSERT INTO ride_events (ride_request_id, from_status, to_status, meta)
       VALUES ($1, 'VISIBLE', 'EXPIRED_UNCLAIMED', '{"reason":"no rider claimed"}'::jsonb)`,
      [r.id]
    );
    emit(REQUEST_EVENT, { id: r.id, status: 'EXPIRED_UNCLAIMED' });
  }

  // 3. Stale pending payments.
  const stale = await pool.query(
    `UPDATE payments SET status = 'failed', completed_at = now(),
            meta = COALESCE(meta,'{}'::jsonb) || '{"reason":"timed out"}'::jsonb
     WHERE status = 'pending' AND created_at < now() - ($1::int * interval '1 millisecond')
     RETURNING id`,
    [PAYMENT_STALE_MS]
  );
  if (stale.rows.length) console.log(`[payments] ${stale.rows.length} stale payment(s) marked failed`);
}

/** Nightly retention job — exact coordinates are never kept past 90 days. */
export async function purgeOldLocations() {
  const { rows } = await pool.query(
    `SELECT id, pickup_geog FROM ride_requests
     WHERE status = 'COMPLETED' AND completed_at < now() - ($1::int * interval '1 day')
       AND pickup_geog IS NOT NULL`,
    [LOCATION_RETENTION_DAYS]
  );
  for (const r of rows) {
    await pool.query(
      `INSERT INTO trip_heatmap (pickup_geog) VALUES ($1) ON CONFLICT DO NOTHING`,
      [r.pickup_geog]
    );
  }
  const cleared = await pool.query(
    `UPDATE ride_requests SET pickup_geog = NULL, updated_at = now()
     WHERE status = 'COMPLETED' AND completed_at < now() - ($2::int * interval '1 day')
       AND pickup_geog IS NOT NULL RETURNING id`,
    [null, LOCATION_RETENTION_DAYS]
  );
  if (cleared.rows.length || rows.length) {
    console.log(`[retention] archived ${rows.length} point(s), purged ${cleared.rows.length} exact coordinate(s) > ${LOCATION_RETENTION_DAYS}d old`);
  }
}

let timer: NodeJS.Timeout | null = null;

export function startSweeper(intervalMs: number) {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    sweepOnce().catch((err) => console.error('[sweeper]', err.message));
  }, intervalMs);
  // Run immediately once on boot so stale state clears fast.
  sweepOnce().catch((err) => console.error('[sweeper]', err.message));
  // Daily retention purge (schedule for 3 a.m. local time).
  const msUntil = (date: Date) => {
    const t = new Date(date);
    t.setHours(3, 0, 0, 0);
    return t.getTime() - Date.now() + (t.getTime() < Date.now() ? 24 * 60 * 60 * 1000 : 0);
  };
  setTimeout(() => {
    purgeOldLocations().catch((err) => console.error('[retention]', err.message));
    setInterval(() => purgeOldLocations().catch((err) => console.error('[retention]', err.message)), 24 * 60 * 60 * 1000);
  }, msUntil(new Date()));
}
