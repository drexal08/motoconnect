/**
 * Finance (admin spec §7).
 *
 * §7.4 boundary: this is OPERATIONAL reconciliation — did the payment land, does
 * a refund need issuing. It is not bookkeeping. No VAT handling, no statements.
 *
 * ── §12 open question #2, checked rather than assumed ────────────────────────
 * MotoConnect does not talk to MTN/Airtel directly; it settles through PayPack,
 * whose transaction API exposes `cashin` and `cashout` — there is no endpoint
 * that reverses a specific cashin. Upstream it is no better:
 *   • MTN MoMo puts refund under the *Disbursement* product
 *     (POST /disbursement/v1_0/refund), a separate subscription with its own
 *     funded float — the Collections product cannot reverse its own charge.
 *   • Airtel Money does expose a collection refund
 *     (POST /standard/v1/payments/refund), but MotoConnect never sees that API
 *     from behind the aggregator.
 * So a MotoConnect refund is a NEW outbound disbursement, not a reversal: it
 * needs a funded float and it does not return the original transaction fee.
 * The refund record is therefore always written, and money movement is tracked
 * separately in `settlement`, defaulting to `manual_offline`. Wiring the PayPack
 * cashout path is left behind PAYPACK_REFUND_ENABLED, off until the float and
 * the cashout contract are confirmed with PayPack. Recording a refund the
 * platform never actually paid would be the worst of the available bugs.
 */
import { pool } from '../../db/pool.js';
import { errors } from '../../lib/errors.js';
import { gatedAction } from '../../lib/audit.js';
import type { AdminIdentity } from '../../lib/adminAuth.js';
import { TIER_DEFS } from '../../config.js';

export const REFUND_REASON_CODES = [
  'duplicate_charge',
  'service_not_delivered',
  'accidental_purchase',
  'billing_error',
  'goodwill',
  'other',
] as const;
export type RefundReasonCode = (typeof REFUND_REASON_CODES)[number];

/** True only when a verified programmatic payout path has been switched on. */
export function providerRefundAvailable(): boolean {
  return process.env.PAYPACK_REFUND_ENABLED === 'true';
}

// ─── §7.1 subscriptions overview ─────────────────────────────────────────────

export async function listSubscriptions(opts: {
  tier?: string;
  filter?: 'all' | 'active' | 'expiring_soon' | 'over_quota' | 'expired';
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, opts.pageSize ?? 25));
  const where: string[] = [];
  const params: unknown[] = [];

  if (opts.tier && opts.tier !== 'all') {
    params.push(opts.tier);
    where.push(`s.tier = $${params.length}::subscription_tier`);
  }
  switch (opts.filter) {
    case 'active':
      where.push(`s.status = 'active' AND s.expires_at > now()`);
      break;
    case 'expiring_soon':
      where.push(`s.status = 'active' AND s.expires_at > now() AND s.expires_at < now() + interval '3 days'`);
      break;
    case 'over_quota':
      where.push(`s.claims_cap IS NOT NULL AND s.claims_used >= s.claims_cap`);
      break;
    case 'expired':
      where.push(`(s.status <> 'active' OR s.expires_at <= now())`);
      break;
    default:
      break;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRes = await pool.query(`SELECT count(*)::int AS n FROM subscriptions s ${whereSql}`, params);

  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await pool.query(
    `SELECT s.id, s.tier, s.claims_used, s.claims_cap, s.status, s.starts_at, s.expires_at,
            u.id AS rider_id, u.name AS rider_name, u.phone AS rider_phone,
            (SELECT count(*)::int FROM quota_block_events q
              WHERE q.rider_id = s.rider_id AND q.created_at > now() - interval '30 days') AS quota_blocks_30d
     FROM subscriptions s
     JOIN users u ON u.id = s.rider_id
     ${whereSql}
     ORDER BY s.expires_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    total: totalRes.rows[0].n as number,
    page,
    pageSize,
    rows: rows.map((r) => ({
      id: r.id,
      tier: r.tier,
      tierLabel: TIER_DEFS[r.tier as keyof typeof TIER_DEFS]?.label ?? r.tier,
      claimsUsed: Number(r.claims_used),
      claimsCap: r.claims_cap === null ? null : Number(r.claims_cap),
      status: r.status,
      startsAt: r.starts_at,
      expiresAt: r.expires_at,
      rider: { id: r.rider_id, name: r.rider_name, phone: r.rider_phone },
      /** §7.1 — repeated cap hits: the upsell signal, surfaced but never acted on automatically. */
      quotaBlocks30d: r.quota_blocks_30d,
    })),
  };
}

/** §7.1 — riders repeatedly hitting their cap, ranked. A report, not an action. */
export async function overQuotaRiders(days = 30) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.phone, count(q.id)::int AS blocks, max(q.created_at) AS last_block,
            (SELECT s.tier FROM subscriptions s
              WHERE s.rider_id = u.id AND s.status = 'active' AND s.expires_at > now()
              ORDER BY s.expires_at DESC LIMIT 1) AS current_tier
     FROM quota_block_events q
     JOIN users u ON u.id = q.rider_id
     WHERE q.created_at > now() - ($1::int * interval '1 day')
     GROUP BY u.id, u.name, u.phone
     ORDER BY blocks DESC
     LIMIT 50`,
    [days]
  );
  return rows.map((r) => ({
    riderId: r.id,
    name: r.name,
    phone: r.phone,
    blocks: r.blocks,
    lastBlockAt: r.last_block,
    currentTier: r.current_tier,
    suggestedTier: r.current_tier === 'agahozo' ? 'isonga' : r.current_tier === 'isonga' ? 'impuruza' : null,
  }));
}

// ─── §7.2 payments + reconciliation ──────────────────────────────────────────

export async function listPayments(opts: {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, opts.pageSize ?? 25));
  const where: string[] = [];
  const params: unknown[] = [];

  if (opts.status && opts.status !== 'all') {
    params.push(opts.status);
    where.push(`p.status = $${params.length}::payment_status`);
  }
  if (opts.search?.trim()) {
    params.push(`%${opts.search.trim()}%`);
    where.push(`(u.name ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR p.provider_ref ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRes = await pool.query(
    `SELECT count(*)::int AS n FROM payments p JOIN users u ON u.id = p.user_id ${whereSql}`,
    params
  );

  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await pool.query(
    `SELECT p.id, p.provider, p.provider_ref, p.amount, p.status, p.tier, p.kind,
            p.subscription_id, p.reconcile_state, p.created_at, p.completed_at,
            u.id AS user_id, u.name, u.phone,
            (SELECT coalesce(sum(r.amount),0)::int FROM refunds r WHERE r.payment_id = p.id) AS refunded
     FROM payments p JOIN users u ON u.id = p.user_id
     ${whereSql}
     ORDER BY p.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    total: totalRes.rows[0].n as number,
    page,
    pageSize,
    rows: rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      providerRef: r.provider_ref,
      amount: Number(r.amount),
      refunded: Number(r.refunded),
      status: r.status,
      tier: r.tier,
      kind: r.kind,
      subscriptionId: r.subscription_id,
      reconcileState: r.reconcile_state,
      createdAt: r.created_at,
      completedAt: r.completed_at,
      user: { id: r.user_id, name: r.name, phone: r.phone },
    })),
  };
}

/**
 * §7.2 — the two exception classes, both built even though one "should never
 * happen": that is precisely the class of bug that needs a monitoring view.
 *
 *  orphan_payment    — provider confirmed success, no subscription activated
 *                      (the webhook-failure case).
 *  unpaid_subscription — an active subscription with no confirmed payment behind
 *                      it. Correct idempotency means this stays empty; a nonzero
 *                      count is the alarm.
 */
export async function reconciliationExceptions() {
  const orphans = await pool.query(
    `SELECT p.id, p.amount, p.tier, p.provider_ref, p.created_at, p.completed_at, p.reconcile_state,
            u.id AS user_id, u.name, u.phone
     FROM payments p JOIN users u ON u.id = p.user_id
     WHERE p.status = 'success' AND p.kind = 'subscription'
       AND p.subscription_id IS NULL
       AND (p.reconcile_state IS NULL)
     ORDER BY p.completed_at DESC NULLS LAST
     LIMIT 200`
  );

  const unpaid = await pool.query(
    `SELECT s.id, s.tier, s.claims_used, s.claims_cap, s.starts_at, s.expires_at,
            u.id AS rider_id, u.name, u.phone
     FROM subscriptions s JOIN users u ON u.id = s.rider_id
     WHERE s.status = 'active' AND s.expires_at > now()
       AND NOT EXISTS (
         SELECT 1 FROM payments p WHERE p.subscription_id = s.id AND p.status = 'success'
       )
       AND NOT EXISTS (
         SELECT 1 FROM payment_reconciliations pr WHERE pr.subscription_id = s.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM admin_audit_log l
          WHERE l.target_type = 'subscription' AND l.target_id = s.id::text
            AND l.action_type IN ('finance.quota_adjusted', 'finance.subscription_granted')
       )
     ORDER BY s.starts_at DESC
     LIMIT 200`
  );

  const stalePending = await pool.query(
    `SELECT p.id, p.amount, p.tier, p.created_at, u.name, u.phone, u.id AS user_id
     FROM payments p JOIN users u ON u.id = p.user_id
     WHERE p.status = 'pending' AND p.created_at < now() - interval '1 hour'
     ORDER BY p.created_at ASC LIMIT 200`
  );

  return {
    orphanPayments: orphans.rows.map((r) => ({
      paymentId: r.id,
      amount: Number(r.amount),
      tier: r.tier,
      providerRef: r.provider_ref,
      createdAt: r.created_at,
      completedAt: r.completed_at,
      user: { id: r.user_id, name: r.name, phone: r.phone },
    })),
    unpaidSubscriptions: unpaid.rows.map((r) => ({
      subscriptionId: r.id,
      tier: r.tier,
      claimsUsed: Number(r.claims_used),
      claimsCap: r.claims_cap === null ? null : Number(r.claims_cap),
      startsAt: r.starts_at,
      expiresAt: r.expires_at,
      rider: { id: r.rider_id, name: r.name, phone: r.phone },
    })),
    stalePendingPayments: stalePending.rows.map((r) => ({
      paymentId: r.id,
      amount: Number(r.amount),
      tier: r.tier,
      createdAt: r.created_at,
      user: { id: r.user_id, name: r.name, phone: r.phone },
    })),
    get total() {
      return (
        this.orphanPayments.length + this.unpaidSubscriptions.length + this.stalePendingPayments.length
      );
    },
  };
}

/** Cheap count for the dashboard tile (§10) without shipping every row. */
export async function reconciliationExceptionCount(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT
       (SELECT count(*) FROM payments p
         WHERE p.status = 'success' AND p.kind = 'subscription'
           AND p.subscription_id IS NULL AND p.reconcile_state IS NULL) +
       (SELECT count(*) FROM subscriptions s
         WHERE s.status = 'active' AND s.expires_at > now()
           AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.subscription_id = s.id AND p.status = 'success')
           AND NOT EXISTS (SELECT 1 FROM payment_reconciliations pr WHERE pr.subscription_id = s.id)) +
       (SELECT count(*) FROM payments p
         WHERE p.status = 'pending' AND p.created_at < now() - interval '1 hour') AS n`
  );
  return Number(rows[0].n);
}

/**
 * §7.2 — manual reconciliation. The freetext note is MANDATORY here, not
 * optional: this is money, and "why did someone link this payment by hand" is
 * unanswerable six months later without it.
 */
export async function reconcilePayment(
  admin: AdminIdentity,
  paymentId: string,
  input: {
    action: 'link_subscription' | 'mark_void' | 'mark_resolved';
    subscriptionId?: string;
    note: string;
  }
) {
  const note = input.note?.trim() ?? '';
  if (note.length < 3) throw errors.badRequest('A written note is required for every reconciliation action.');

  return gatedAction(admin, async (client) => {
    const { rows } = await client.query(
      `SELECT id, user_id, status, amount, tier, subscription_id, reconcile_state
       FROM payments WHERE id = $1 FOR UPDATE`,
      [paymentId]
    );
    if (!rows.length) throw errors.notFound('That payment was not found.');
    const before = rows[0];

    let after: Record<string, unknown>;

    if (input.action === 'link_subscription') {
      if (!input.subscriptionId) throw errors.badRequest('Choose the subscription to link this payment to.');
      const sub = await client.query(
        `SELECT id, rider_id, tier FROM subscriptions WHERE id = $1`,
        [input.subscriptionId]
      );
      if (!sub.rows.length) throw errors.notFound('That subscription was not found.');
      if (sub.rows[0].rider_id !== before.user_id) {
        throw errors.badRequest('That subscription belongs to a different account.');
      }
      const taken = await client.query(
        `SELECT id FROM payments WHERE subscription_id = $1 AND id <> $2 AND status = 'success'`,
        [input.subscriptionId, paymentId]
      );
      if (taken.rows.length) throw errors.conflict('Another successful payment is already linked to that subscription.');

      await client.query(
        `UPDATE payments SET subscription_id = $2, reconcile_state = 'resolved', reconciled_at = now()
         WHERE id = $1`,
        [paymentId, input.subscriptionId]
      );
      after = { subscriptionId: input.subscriptionId, reconcileState: 'resolved' };
    } else {
      const state = input.action === 'mark_void' ? 'void' : 'resolved';
      await client.query(
        `UPDATE payments SET reconcile_state = $2, reconciled_at = now() WHERE id = $1`,
        [paymentId, state]
      );
      after = { reconcileState: state };
    }

    await client.query(
      `INSERT INTO payment_reconciliations (payment_id, admin_user_id, action, subscription_id, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [paymentId, admin.id, input.action, input.subscriptionId ?? null, note]
    );

    return {
      result: after,
      audit: {
        actionType: `finance.${input.action}`,
        targetType: 'payment',
        targetId: paymentId,
        reasonFreetext: note,
        beforeState: {
          subscriptionId: before.subscription_id,
          reconcileState: before.reconcile_state,
          status: before.status,
          amount: Number(before.amount),
        },
        afterState: after,
      },
    };
  });
}

// ─── §7.3 refunds ────────────────────────────────────────────────────────────

export async function listRefunds(limit = 100) {
  const { rows } = await pool.query(
    `SELECT r.id, r.amount, r.reason_code, r.reason_freetext, r.settlement, r.provider_ref,
            r.settled_at, r.created_at, r.payment_id, r.ride_request_id,
            a.email AS admin_email, u.name AS user_name, u.phone AS user_phone, u.id AS user_id,
            p.amount AS payment_amount, p.tier
     FROM refunds r
     JOIN payments p ON p.id = r.payment_id
     JOIN users u ON u.id = p.user_id
     LEFT JOIN admin_users a ON a.id = r.admin_user_id
     ORDER BY r.created_at DESC LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    paymentId: r.payment_id,
    rideRequestId: r.ride_request_id,
    amount: Number(r.amount),
    paymentAmount: Number(r.payment_amount),
    tier: r.tier,
    reasonCode: r.reason_code,
    reasonFreetext: r.reason_freetext,
    settlement: r.settlement,
    providerRef: r.provider_ref,
    settledAt: r.settled_at,
    createdAt: r.created_at,
    adminEmail: r.admin_email,
    user: { id: r.user_id, name: r.user_name, phone: r.user_phone },
  }));
}

export async function issueRefund(
  admin: AdminIdentity,
  paymentId: string,
  input: {
    amount: number;
    reasonCode: RefundReasonCode;
    reasonFreetext: string;
    rideRequestId?: string;
  }
) {
  if (!REFUND_REASON_CODES.includes(input.reasonCode)) throw errors.badRequest('Choose a refund reason code.');
  const freetext = input.reasonFreetext?.trim() ?? '';
  if (freetext.length < 5) throw errors.badRequest('Write the reason for this refund. This is money — the note is required.');
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw errors.badRequest('Enter the refund amount in whole RWF.');
  }

  return gatedAction(admin, async (client) => {
    const { rows } = await client.query(
      `SELECT p.id, p.user_id, p.amount, p.status, p.provider, p.tier,
              coalesce((SELECT sum(r.amount) FROM refunds r WHERE r.payment_id = p.id), 0)::int AS refunded
       FROM payments p WHERE p.id = $1 FOR UPDATE`,
      [paymentId]
    );
    if (!rows.length) throw errors.notFound('That payment was not found.');
    const p = rows[0];

    if (p.status !== 'success') {
      throw errors.conflict('Only a successful payment can be refunded.');
    }
    const remaining = Number(p.amount) - Number(p.refunded);
    if (input.amount > remaining) {
      throw errors.badRequest(
        `That is more than what is left on this payment. At most ${remaining} RWF can still be refunded.`
      );
    }

    // Settlement is recorded honestly: unless a verified payout path is switched
    // on, the money has NOT moved and this row is a instruction to go and move it.
    const settlement = providerRefundAvailable() ? 'provider_api' : 'manual_offline';

    const inserted = await client.query(
      `INSERT INTO refunds (payment_id, ride_request_id, admin_user_id, amount, reason_code,
                            reason_freetext, settlement)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [paymentId, input.rideRequestId ?? null, admin.id, input.amount, input.reasonCode, freetext, settlement]
    );

    return {
      result: {
        refundId: inserted.rows[0].id as string,
        settlement,
        /** The UI states this plainly so nobody thinks the payer already has their money. */
        moneyMoved: settlement === 'provider_api',
        remainingAfter: remaining - input.amount,
      },
      audit: {
        actionType: 'finance.refund_issued',
        targetType: 'payment',
        targetId: paymentId,
        reasonCode: input.reasonCode,
        reasonFreetext: freetext,
        beforeState: { paymentAmount: Number(p.amount), alreadyRefunded: Number(p.refunded) },
        afterState: { refundAmount: input.amount, settlement, rideRequestId: input.rideRequestId ?? null },
      },
    };
  });
}

/** Marks a manual_offline refund as actually paid out, once the operator has moved the money. */
export async function markRefundSettled(admin: AdminIdentity, refundId: string, input: { providerRef: string; note: string }) {
  const note = input.note?.trim() ?? '';
  if (note.length < 3) throw errors.badRequest('Write how this refund was paid out.');
  if (!input.providerRef?.trim()) throw errors.badRequest('Record the mobile money reference for the payout.');

  return gatedAction(admin, async (client) => {
    const { rows } = await client.query(`SELECT settlement, settled_at, amount FROM refunds WHERE id = $1 FOR UPDATE`, [
      refundId,
    ]);
    if (!rows.length) throw errors.notFound('That refund was not found.');
    if (rows[0].settled_at) throw errors.conflict('That refund is already marked as paid out.');

    await client.query(`UPDATE refunds SET settled_at = now(), provider_ref = $2 WHERE id = $1`, [
      refundId,
      input.providerRef.trim(),
    ]);

    return {
      result: { settled: true },
      audit: {
        actionType: 'finance.refund_settled',
        targetType: 'refund',
        targetId: refundId,
        reasonFreetext: note,
        beforeState: { settlement: rows[0].settlement, settledAt: null },
        afterState: { settledAt: new Date().toISOString(), providerRef: input.providerRef.trim(), amount: Number(rows[0].amount) },
      },
    };
  });
}

/** §6.3 — manual subscription quota override. Gated: it is effectively giving away product. */
export async function adjustQuota(
  admin: AdminIdentity,
  subscriptionId: string,
  input: { claimsCap?: number | null; claimsUsed?: number; extendDays?: number; reasonFreetext: string }
) {
  const freetext = input.reasonFreetext?.trim() ?? '';
  if (freetext.length < 5) throw errors.badRequest('Write why this plan is being adjusted.');

  return gatedAction(admin, async (client) => {
    const { rows } = await client.query(
      `SELECT id, rider_id, tier, claims_used, claims_cap, expires_at, status
       FROM subscriptions WHERE id = $1 FOR UPDATE`,
      [subscriptionId]
    );
    if (!rows.length) throw errors.notFound('That subscription was not found.');
    const b = rows[0];

    const sets: string[] = [];
    const params: unknown[] = [subscriptionId];
    const after: Record<string, unknown> = {};

    if (input.claimsCap !== undefined) {
      if (input.claimsCap !== null && (!Number.isInteger(input.claimsCap) || input.claimsCap < 0)) {
        throw errors.badRequest('The claim cap must be a whole number, or empty for unlimited.');
      }
      params.push(input.claimsCap);
      sets.push(`claims_cap = $${params.length}`);
      after.claimsCap = input.claimsCap;
    }
    if (input.claimsUsed !== undefined) {
      if (!Number.isInteger(input.claimsUsed) || input.claimsUsed < 0) {
        throw errors.badRequest('Claims used must be a whole number.');
      }
      params.push(input.claimsUsed);
      sets.push(`claims_used = $${params.length}`);
      after.claimsUsed = input.claimsUsed;
    }
    if (input.extendDays !== undefined) {
      if (!Number.isInteger(input.extendDays) || input.extendDays < 1 || input.extendDays > 365) {
        throw errors.badRequest('Extend by between 1 and 365 days.');
      }
      params.push(input.extendDays);
      sets.push(`expires_at = expires_at + ($${params.length}::int * interval '1 day')`);
      after.extendDays = input.extendDays;
    }
    if (!sets.length) throw errors.badRequest('Nothing to change.');

    await client.query(`UPDATE subscriptions SET ${sets.join(', ')} WHERE id = $1`, params);

    return {
      result: after,
      audit: {
        actionType: 'finance.quota_adjusted',
        targetType: 'subscription',
        targetId: subscriptionId,
        reasonFreetext: freetext,
        beforeState: {
          claimsUsed: Number(b.claims_used),
          claimsCap: b.claims_cap === null ? null : Number(b.claims_cap),
          expiresAt: b.expires_at,
        },
        afterState: after,
      },
    };
  });
}

/** Revenue rollups for §10 and the reports screen. */
export async function revenueSummary() {
  const { rows } = await pool.query(
    `SELECT
       coalesce(sum(amount) FILTER (WHERE status = 'success' AND completed_at::date = current_date), 0)::int AS today,
       count(*) FILTER (WHERE status = 'success' AND completed_at::date = current_date)::int AS today_count,
       coalesce(sum(amount) FILTER (WHERE status = 'success' AND completed_at > now() - interval '7 days'), 0)::int AS week,
       coalesce(sum(amount) FILTER (WHERE status = 'success' AND completed_at > now() - interval '30 days'), 0)::int AS month,
       coalesce(sum(amount) FILTER (WHERE status = 'success'), 0)::int AS all_time
     FROM payments`
  );
  const refunded = await pool.query(
    `SELECT coalesce(sum(amount),0)::int AS today,
            coalesce(sum(amount) FILTER (WHERE created_at > now() - interval '30 days'),0)::int AS month
     FROM refunds WHERE created_at::date = current_date OR created_at > now() - interval '30 days'`
  );
  return {
    todayRwf: rows[0].today,
    todayCount: rows[0].today_count,
    weekRwf: rows[0].week,
    monthRwf: rows[0].month,
    allTimeRwf: rows[0].all_time,
    refundedTodayRwf: refunded.rows[0].today,
    refundedMonthRwf: refunded.rows[0].month,
  };
}
