import { pool } from '../db/pool.js';
import { errors } from '../lib/errors.js';
import { TIER_DEFS, type Tier } from '../config.js';
import { initiateCashin, isPaypackConfigured } from './paypack.js';
import { normalizePhone } from '../lib/phone.js';

export interface SubscriptionInfo {
  id: string;
  tier: Tier;
  claimsUsed: number;
  claimsCap: number | null;
  expiresAt: string;
  status: string;
}

export async function getActiveSubscription(riderId: string): Promise<SubscriptionInfo | null> {
  const { rows } = await pool.query(
    `SELECT id, tier, claims_used, claims_cap, expires_at, status
     FROM subscriptions
     WHERE rider_id = $1 AND status = 'active' AND expires_at > now()
     ORDER BY expires_at DESC LIMIT 1`,
    [riderId]
  );
  if (!rows.length) return null;
  return {
    id: rows[0].id,
    tier: rows[0].tier,
    claimsUsed: Number(rows[0].claims_used),
    claimsCap: rows[0].claims_cap === null ? null : Number(rows[0].claims_cap),
    expiresAt: new Date(rows[0].expires_at).toISOString(),
    status: rows[0].status,
  };
}

/**
 * §5.4: non-committal demand indicator — aggregate count only, no positions.
 */
export async function getDemandIndicator(location: { lat: number; lng: number } | null) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS demand FROM ride_requests
     WHERE status = 'VISIBLE' AND first_visible_at > now() - interval '10 minutes'`
  );
  return {
    visibleRequests: rows[0].demand,
    // Near-me variant only when location was supplied; still aggregate-only.
    nearMe:
      location
        ? await pool
            .query(
              `SELECT count(*)::int AS demand FROM ride_requests
               WHERE status = 'VISIBLE' AND first_visible_at > now() - interval '10 minutes'
                 AND ST_DWithin(pickup_geog, ST_SetSRID(ST_MakePoint($2,$1),4326)::geography, 10000)`,
              [location.lat, location.lng]
            )
            .then((r) => r.rows[0].demand)
        : null,
  };
}

/**
 * Begin a subscription purchase. Creates the payment row first (single source
 * of truth), then triggers the PayPack cashin. Returns payment id to poll.
 * TEST MODE (no PayPack credentials): the cashin is simulated — a timer
 * completes the payment ~8 s later so the whole flow works end-to-end.
 */
export async function purchaseSubscription(
  userId: string,
  riderId: string,
  tier: Tier,
  rawPhone: string
) {
  const def = TIER_DEFS[tier];
  const phone = normalizePhone(rawPhone);
  if (!phone) throw errors.badRequest('Enter the mobile money phone number to pay from.');

  const pending = await pool.query(
    `SELECT p.id FROM payments p
     WHERE p.user_id = $1 AND p.status = 'pending' AND p.tier = $2
     ORDER BY p.created_at DESC LIMIT 1`,
    [userId, tier]
  );
  if (pending.rows.length) {
    return { paymentId: pending.rows[0].id, pending: true };
  }

  const { rows } = await pool.query(
    `INSERT INTO payments (user_id, provider, kind, amount, status, tier)
     VALUES ($1, 'paypack', 'subscription', $2, 'pending', $3)
     RETURNING id`,
    [userId, def.price, tier]
  );
  const paymentId = rows[0].id as string;

  if (isPaypackConfigured()) {
    try {
      const { ref } = await initiateCashin(phone, def.price);
      await pool.query(`UPDATE payments SET provider_ref = $1, meta = jsonb_build_object('phone',$2) WHERE id = $3`, [
        ref,
        phone,
        paymentId,
      ]);
      console.log(`[PAYPACK] cashin initiated ${ref} for payment ${paymentId} (${tier}, ${def.price} RWF)`);
    } catch (err) {
      await pool.query(`UPDATE payments SET status = 'failed', meta = jsonb_build_object('error', $2) WHERE id = $1`, [
        paymentId,
        err instanceof Error ? err.message : 'payment initiation failed',
      ]);
      throw errors.badRequest('We could not start the mobile money request. Check the number and try again.');
    }
  } else {
    console.warn(
      '[PAYPACK] TEST MODE — no credentials configured. Simulating a completed cashin in ~8s.'
    );
    // Simulate: payer approves the MoMo/Airtel prompt ~8 s after purchase.
    setTimeout(async () => {
      try {
        await completePaymentFromProvider(paymentId, `sim-${Date.now()}`, 'successful');
      } catch (err) {
        console.error('test payment completion failed:', err);
      }
    }, 8_000);
  }

  return { paymentId, pending: true };
}

export async function getPayment(paymentId: string) {
  const { rows } = await pool.query(
    `SELECT id, user_id, provider, amount, status, tier, provider_ref, meta, created_at, completed_at
     FROM payments WHERE id = $1`,
    [paymentId]
  );
  if (!rows.length) throw errors.notFound('This payment was not found.');
  const p = rows[0];
  return {
    id: p.id,
    userId: p.user_id,
    provider: p.provider,
    amount: Number(p.amount),
    status: p.status,
    tier: p.tier,
    providerRef: p.provider_ref,
    meta: p.meta,
    createdAt: p.created_at,
    completedAt: p.completed_at,
  };
}

/**
 * Idempotent webhook processing. §8.4: duplicate webhook deliveries must not
 * double-credit a subscription. Guard: unique provider_ref + status='pending'
 * + event-id dedupe list.
 */
export async function completePaymentFromProvider(
  paymentId: string,
  providerRef: string,
  status: string,
  eventId?: string
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM payments WHERE id = $1 FOR UPDATE`,
      [paymentId]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return { processed: false, reason: 'not found' };
    }
    const payment = rows[0];

    if (payment.status !== 'pending') {
      await client.query('ROLLBACK');
      return { processed: false, reason: 'already processed' };
    }
    if (eventId && (payment.processed_event_ids || []).includes(eventId)) {
      await client.query('ROLLBACK');
      return { processed: false, reason: 'duplicate event' };
    }
    if (payment.provider_ref && payment.provider_ref !== providerRef) {
      await client.query('ROLLBACK');
      return { processed: false, reason: 'provider ref mismatch' };
    }

    if (status !== 'successful') {
      await client.query(
        `UPDATE payments SET status = 'failed', completed_at = now(),
                processed_event_ids = $2, meta = COALESCE(meta,'{}'::jsonb) || '{"providerStatus":"failed"}'::jsonb
         WHERE id = $1`,
        [paymentId, JSON.stringify([...(payment.processed_event_ids || []), ...(eventId ? [eventId] : [])])]
      );
      await client.query('COMMIT');
      return { processed: true, result: 'failed' };
    }

    const tier = payment.tier as Tier;
    const def = TIER_DEFS[tier];

    // Activate the subscription. Prior active plans are closed so periods never stack.
    await client.query(
      `UPDATE subscriptions SET status = 'cancelled'
       WHERE rider_id = $1 AND status = 'active'`,
      [payment.user_id]
    );

    const sub = await client.query(
      `INSERT INTO subscriptions (rider_id, tier, claims_cap, status, starts_at, expires_at)
       SELECT $1, $2, $3, 'active', now(), now() + ($4::int * interval '1 millisecond')
       RETURNING id`,
      [payment.user_id, tier, def.cap, def.durationMs]
    );

    const eventIds = [...(payment.processed_event_ids || []), ...(eventId ? [eventId] : [])];
    await client.query(
      `UPDATE payments SET status = 'success', provider_ref = COALESCE(provider_ref, $2),
              completed_at = now(), subscription_id = $3, processed_event_ids = $4
       WHERE id = $1`,
      [paymentId, providerRef, sub.rows[0].id, JSON.stringify(eventIds)]
    );

    await client.query('COMMIT');
    console.log(`[PAYPACK] payment ${paymentId} → subscription ${sub.rows[0].id} (${tier})`);
    return { processed: true, result: 'success' };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch { /* noop */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function cancelSubscription(riderId: string) {
  const { rows } = await pool.query(
    `UPDATE subscriptions SET status = 'cancelled'
     WHERE rider_id = $1 AND status = 'active' AND expires_at > now()
     RETURNING id`,
    [riderId]
  );
  return { cancelled: rows.length > 0 };
}

export { TIER_DEFS };
