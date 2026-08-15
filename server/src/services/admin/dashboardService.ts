/**
 * Dashboard home (admin spec §10) and the audit-log viewer (§9.2).
 *
 * §10 is a FIXED status page, deliberately not a configurable BI dashboard:
 * it answers "is the business okay right now" for one operator. Every number
 * below maps to a specific line in the spec, and each one links somewhere the
 * operator can act.
 */
import { pool } from '../../db/pool.js';
import { VERIFICATION_SLA_MS, DISPUTE_RATING_THRESHOLD } from '../../config.js';
import { decisionMetrics } from './verificationService.js';
import { reconciliationExceptionCount, revenueSummary } from './financeService.js';
import { LIVE_STATUSES } from './liveOpsService.js';

export async function dashboardSummary() {
  const [live, verification, disputes, revenue, exceptions, decisions] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS active,
              count(*) FILTER (WHERE status = 'VISIBLE')::int AS waiting
       FROM ride_requests WHERE status = ANY($1) OR status = 'VISIBLE'`,
      [LIVE_STATUSES]
    ),
    pool.query(
      `SELECT count(*)::int AS pending,
              count(*) FILTER (WHERE submitted_at < now() - ($1::int * interval '1 millisecond'))::int AS over_sla,
              min(submitted_at) AS oldest_submitted_at
       FROM rider_profiles WHERE verification_status = 'pending_verification'`,
      [VERIFICATION_SLA_MS]
    ),
    pool.query(
      `SELECT count(*)::int AS open FROM (
         SELECT r.id FROM ride_requests r WHERE r.status = 'NO_SHOW'
         UNION
         SELECT r.id FROM ride_requests r JOIN ratings rt ON rt.ride_request_id = r.id
          WHERE rt.stars <= $1
       ) f
       WHERE NOT EXISTS (SELECT 1 FROM dispute_reviews d WHERE d.ride_request_id = f.id)`,
      [DISPUTE_RATING_THRESHOLD]
    ),
    revenueSummary(),
    reconciliationExceptionCount(),
    decisionMetrics(7),
  ]);

  const activeRides = await pool.query(`SELECT count(*)::int AS n FROM ride_requests WHERE status = ANY($1)`, [
    LIVE_STATUSES,
  ]);

  return {
    activeRides: activeRides.rows[0].n as number,
    waitingRequests: live.rows[0].waiting as number,
    pendingVerification: {
      count: verification.rows[0].pending as number,
      overSla: verification.rows[0].over_sla as number,
      oldestSubmittedAt: verification.rows[0].oldest_submitted_at,
    },
    revenue,
    openDisputes: disputes.rows[0].open as number,
    /** §10 — the metric that tells you whether verification is throttling growth. */
    verificationThroughput: decisions,
    /** §10 — should be zero. Anything else belongs on the login screen, not in a report. */
    reconciliationExceptions: exceptions,
  };
}

/** Small trend series for the dashboard sparklines — rides and revenue, 14 days. */
export async function dashboardTrends(days = 14) {
  const { rows } = await pool.query(
    `WITH d AS (
       SELECT generate_series(current_date - ($1::int - 1), current_date, interval '1 day')::date AS day
     )
     SELECT d.day,
            (SELECT count(*)::int FROM ride_requests r
              WHERE r.created_at::date = d.day) AS rides,
            (SELECT count(*)::int FROM ride_requests r
              WHERE r.completed_at::date = d.day AND r.status = 'COMPLETED') AS completed,
            (SELECT coalesce(sum(p.amount),0)::int FROM payments p
              WHERE p.status = 'success' AND p.completed_at::date = d.day) AS revenue
     FROM d ORDER BY d.day ASC`,
    [days]
  );
  return rows.map((r) => ({
    day: r.day,
    rides: r.rides,
    completed: r.completed,
    revenue: r.revenue,
  }));
}

// ─── §9.2 audit log viewer ───────────────────────────────────────────────────

/**
 * Read-only by definition: `admin_audit_log` has no UPDATE or DELETE path at
 * the database level, so there is nothing here that could write to it.
 *
 * The admin filter is moot at single-admin scale and is built anyway — it is
 * nearly free now and expensive to retrofit when there is a second admin and a
 * real investigation to run.
 */
export async function listAuditLog(opts: {
  adminUserId?: string;
  actionType?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, opts.pageSize ?? 50));
  const where: string[] = [];
  const params: unknown[] = [];

  const add = (clause: string, value: unknown) => {
    params.push(value);
    where.push(clause.replace('$?', `$${params.length}`));
  };

  if (opts.adminUserId) add('l.admin_user_id = $?', opts.adminUserId);
  if (opts.actionType) add('l.action_type = $?', opts.actionType);
  if (opts.targetType) add('l.target_type = $?', opts.targetType);
  if (opts.targetId) add('l.target_id = $?', opts.targetId);
  if (opts.from) add('l.created_at >= $?', opts.from);
  if (opts.to) add('l.created_at <= $?', opts.to);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRes = await pool.query(`SELECT count(*)::int AS n FROM admin_audit_log l ${whereSql}`, params);

  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await pool.query(
    `SELECT l.id, l.admin_user_id, l.admin_email, l.action_type, l.target_type, l.target_id,
            l.reason_code, l.reason_freetext, l.before_state, l.after_state,
            l.ip_address, l.user_agent, l.created_at
     FROM admin_audit_log l
     ${whereSql}
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    total: totalRes.rows[0].n as number,
    page,
    pageSize,
    rows: rows.map((r) => ({
      id: String(r.id),
      adminUserId: r.admin_user_id,
      adminEmail: r.admin_email,
      actionType: r.action_type,
      targetType: r.target_type,
      targetId: r.target_id,
      reasonCode: r.reason_code,
      reasonFreetext: r.reason_freetext,
      beforeState: r.before_state,
      afterState: r.after_state,
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
      createdAt: r.created_at,
    })),
  };
}

/** Distinct action types + admins, for populating the viewer's filter dropdowns. */
export async function auditFilterOptions() {
  const [actions, admins] = await Promise.all([
    pool.query(`SELECT DISTINCT action_type FROM admin_audit_log ORDER BY action_type`),
    pool.query(`SELECT id, email FROM admin_users ORDER BY email`),
  ]);
  return {
    actionTypes: actions.rows.map((r) => r.action_type as string),
    admins: admins.rows.map((r) => ({ id: r.id as string, email: r.email as string })),
  };
}
