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
import { emit, on, REQUEST_EVENT } from '../lib/events.js';
import { expireSuspensions } from './admin/usersService.js';
import { pruneRideTracks } from './admin/liveOpsService.js';
import { purgeExpiredDocuments } from './riderDocumentService.js';

const PAYMENT_STALE_MS = 10 * 60 * 1000;

/**
 * Adaptive scheduling, and the reason it exists.
 *
 * A managed Postgres that scales to zero (Neon) only bills compute while the
 * database is awake. A sweeper polling every 5 seconds would hold it awake for
 * every minute the API is running, which on a free plan's compute allowance is
 * the difference between "comfortably free" and "suspended mid-month".
 *
 * So the sweeper only stays fast while there is something to sweep. Everything
 * it cleans up — claim windows, unclaimed requests — begins with a ride event,
 * and it subscribes to those. With no rides in flight it drops to a slow tick,
 * the connection pool empties, and the database is free to sleep. A single ride
 * request wakes it instantly.
 */
const IDLE_SWEEPS_BEFORE_SLOWING = 6;
const SLOW_INTERVAL_MS = 60_000;

let idleSweeps = 0;
let currentIntervalMs = 0;
let fastIntervalMs = 5_000;

/** Any ride activity means work is coming; go back to the fast tick at once. */
function markActive() {
  idleSweeps = 0;
  if (currentIntervalMs !== fastIntervalMs) schedule(fastIntervalMs);
}

/** Returns true when the sweep found something, so the pace can adapt. */
export async function sweepOnce(): Promise<boolean> {
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

  // 4. Ops console: a time-limited suspension has to actually end on its own,
  //    rather than waiting for an admin to remember (admin spec §5.2).
  //    Day-scale, so the slow tick is ample.
  const lifted = await expireSuspensions();
  if (lifted) console.log(`[moderation] ${lifted} suspension(s) expired and lifted`);

  return (
    expiredClaims.rows.length > 0 ||
    unclaimed.rows.length > 0 ||
    stale.rows.length > 0 ||
    lifted > 0
  );
}

/**
 * Are there rides that could need sweeping? One cheap indexed count, and the
 * only query that runs on an idle tick — everything else is skipped when this
 * comes back zero.
 */
async function hasSweepableRides(): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM ride_requests WHERE status IN ('VISIBLE','CLAIMED')
     ) AS present`
  );
  return rows[0].present === true;
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

  // Live-ops breadcrumbs have their own, much shorter retention: they exist to
  // watch a ride in flight and review a fresh dispute, not to archive movement.
  const tracks = await pruneRideTracks();
  if (tracks) console.log(`[retention] pruned ${tracks} live-ops track point(s)`);

  // Rider ID/licence photographs are the most sensitive records held. They are
  // deleted once the verification decision they supported has stood for the
  // retention window; the decision and its audit trail remain.
  const docs = await purgeExpiredDocuments();
  if (docs) console.log(`[retention] purged ${docs} rider document image(s)`);
}

let timer: NodeJS.Timeout | null = null;
let retentionTimers: NodeJS.Timeout[] = [];

/** Stops all background work so the process can exit cleanly on SIGTERM. */
export function stopSweeper() {
  if (timer) clearInterval(timer);
  timer = null;
  for (const t of retentionTimers) clearTimeout(t);
  retentionTimers = [];
}

/** (Re)arms the interval at a new pace. */
function schedule(intervalMs: number) {
  if (timer) clearInterval(timer);
  currentIntervalMs = intervalMs;
  timer = setInterval(() => {
    void tick();
  }, intervalMs);
}

async function tick() {
  try {
    // On the slow tick, ask one cheap question first. If there is nothing in
    // flight the full sweep is skipped entirely, which is what lets a
    // scale-to-zero database actually reach zero.
    if (currentIntervalMs !== fastIntervalMs && !(await hasSweepableRides())) {
      return;
    }

    const didWork = await sweepOnce();

    if (didWork) {
      idleSweeps = 0;
      if (currentIntervalMs !== fastIntervalMs) schedule(fastIntervalMs);
      return;
    }

    idleSweeps += 1;
    if (idleSweeps >= IDLE_SWEEPS_BEFORE_SLOWING && currentIntervalMs !== SLOW_INTERVAL_MS) {
      if (await hasSweepableRides()) {
        // Rides are open but none needed action yet — stay responsive.
        idleSweeps = 0;
        return;
      }
      schedule(SLOW_INTERVAL_MS);
      console.log('[sweeper] nothing in flight — slowing to a 60s tick so the database can idle');
    }
  } catch (err) {
    console.error('[sweeper]', err instanceof Error ? err.message : err);
  }
}

export function startSweeper(intervalMs: number) {
  if (timer) clearInterval(timer);
  fastIntervalMs = intervalMs;
  idleSweeps = 0;
  // A new ride, claim or cancellation means work is imminent.
  on(REQUEST_EVENT, markActive);
  schedule(intervalMs);
  // Run immediately once on boot so stale state clears fast.
  void tick();
  // Daily retention purge (schedule for 3 a.m. local time).
  const msUntil = (date: Date) => {
    const t = new Date(date);
    t.setHours(3, 0, 0, 0);
    return t.getTime() - Date.now() + (t.getTime() < Date.now() ? 24 * 60 * 60 * 1000 : 0);
  };
  retentionTimers.push(
    setTimeout(() => {
      purgeOldLocations().catch((err) => console.error('[retention]', err.message));
      retentionTimers.push(
        setInterval(
          () => purgeOldLocations().catch((err) => console.error('[retention]', err.message)),
          24 * 60 * 60 * 1000
        )
      );
    }, msUntil(new Date()))
  );
}
