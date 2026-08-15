/**
 * Reports (admin spec §3 nav item — "exportable analytics").
 *
 * Kept to a handful of fixed reports that map to real operational questions,
 * each exportable as CSV. Same restraint as §10: no configurable widgets, no
 * query builder — that is scope creep for a single-operator tool.
 */
import { pool } from '../../db/pool.js';
import { errors } from '../../lib/errors.js';
import { DISPUTE_RATING_THRESHOLD } from '../../config.js';

export interface ReportDef {
  key: string;
  title: string;
  description: string;
  run: (params: { days: number }) => Promise<Record<string, unknown>[]>;
}

const reports: ReportDef[] = [
  {
    key: 'rides_daily',
    title: 'Rides per day',
    description: 'Requests created, confirmed, completed, cancelled and no-showed, by day.',
    run: async ({ days }) => {
      const { rows } = await pool.query(
        `WITH d AS (SELECT generate_series(current_date - ($1::int - 1), current_date, interval '1 day')::date AS day)
         SELECT d.day::text AS day,
                (SELECT count(*)::int FROM ride_requests r WHERE r.created_at::date = d.day) AS requested,
                (SELECT count(*)::int FROM ride_requests r WHERE r.confirmed_at::date = d.day) AS confirmed,
                (SELECT count(*)::int FROM ride_requests r WHERE r.completed_at::date = d.day AND r.status = 'COMPLETED') AS completed,
                (SELECT count(*)::int FROM ride_events e WHERE e.created_at::date = d.day
                   AND e.to_status IN ('CANCELLED_BY_PASSENGER','CANCELLED_BY_RIDER')) AS cancelled,
                (SELECT count(*)::int FROM ride_requests r WHERE r.no_show_flag_at::date = d.day) AS no_shows
         FROM d ORDER BY d.day ASC`,
        [days]
      );
      return rows;
    },
  },
  {
    key: 'revenue_daily',
    title: 'Revenue per day',
    description: 'Successful subscription payments and refunds issued, in RWF, by day.',
    run: async ({ days }) => {
      const { rows } = await pool.query(
        `WITH d AS (SELECT generate_series(current_date - ($1::int - 1), current_date, interval '1 day')::date AS day)
         SELECT d.day::text AS day,
                (SELECT coalesce(sum(p.amount),0)::int FROM payments p
                  WHERE p.status = 'success' AND p.completed_at::date = d.day) AS revenue_rwf,
                (SELECT count(*)::int FROM payments p
                  WHERE p.status = 'success' AND p.completed_at::date = d.day) AS payments,
                (SELECT count(*)::int FROM payments p
                  WHERE p.status = 'failed' AND p.completed_at::date = d.day) AS failed_payments,
                (SELECT coalesce(sum(r.amount),0)::int FROM refunds r WHERE r.created_at::date = d.day) AS refunds_rwf
         FROM d ORDER BY d.day ASC`,
        [days]
      );
      return rows;
    },
  },
  {
    key: 'verification_throughput',
    title: 'Verification throughput',
    description: 'Applications submitted vs decided, and hours to decision, by day.',
    run: async ({ days }) => {
      const { rows } = await pool.query(
        `WITH d AS (SELECT generate_series(current_date - ($1::int - 1), current_date, interval '1 day')::date AS day)
         SELECT d.day::text AS day,
                (SELECT count(*)::int FROM rider_profiles rp WHERE rp.submitted_at::date = d.day) AS submitted,
                (SELECT count(*)::int FROM rider_profiles rp
                  WHERE rp.decided_at::date = d.day AND rp.verification_status = 'verified') AS approved,
                (SELECT count(*)::int FROM rider_profiles rp
                  WHERE rp.decided_at::date = d.day AND rp.verification_status = 'rejected') AS rejected,
                (SELECT round(avg(EXTRACT(EPOCH FROM (rp.decided_at - rp.submitted_at)) / 3600)::numeric, 1)
                   FROM rider_profiles rp WHERE rp.decided_at::date = d.day) AS avg_hours_to_decision
         FROM d ORDER BY d.day ASC`,
        [days]
      );
      return rows;
    },
  },
  {
    key: 'subscriptions_by_tier',
    title: 'Subscriptions by tier',
    description: 'Active plans, claim usage and cap-hit counts for each tier.',
    run: async ({ days }) => {
      const { rows } = await pool.query(
        `SELECT s.tier::text AS tier,
                count(*)::int AS active_plans,
                sum(s.claims_used)::int AS claims_used,
                round(avg(s.claims_used)::numeric, 1) AS avg_claims_per_rider,
                count(*) FILTER (WHERE s.claims_cap IS NOT NULL AND s.claims_used >= s.claims_cap)::int AS at_cap,
                (SELECT count(*)::int FROM quota_block_events q
                  WHERE q.tier = s.tier AND q.created_at > now() - ($1::int * interval '1 day')) AS cap_blocks
         FROM subscriptions s
         WHERE s.status = 'active' AND s.expires_at > now()
         GROUP BY s.tier ORDER BY s.tier`,
        [days]
      );
      return rows;
    },
  },
  {
    key: 'rider_performance',
    title: 'Rider performance',
    description: 'Per-rider completed rides, cancellations, no-shows and reliability score.',
    run: async ({ days }) => {
      const { rows } = await pool.query(
        `SELECT u.name, u.phone, rp.plate_number,
                rp.verification_status::text AS verification_status,
                rp.reliability_score::float8 AS reliability_score,
                (SELECT count(*)::int FROM ride_requests r
                  WHERE r.claimed_by = u.id AND r.status = 'COMPLETED'
                    AND r.completed_at > now() - ($1::int * interval '1 day')) AS completed,
                (SELECT count(*)::int FROM ride_events e
                  WHERE e.actor_id = u.id AND e.to_status = 'CANCELLED_BY_RIDER'
                    AND e.created_at > now() - ($1::int * interval '1 day')) AS cancellations,
                (SELECT count(*)::int FROM ride_requests r
                  WHERE r.claimed_by = u.id AND r.status = 'NO_SHOW'
                    AND r.no_show_flag_at > now() - ($1::int * interval '1 day')) AS no_shows
         FROM rider_profiles rp JOIN users u ON u.id = rp.user_id
         ORDER BY completed DESC, u.name ASC LIMIT 500`,
        [days]
      );
      return rows;
    },
  },
  {
    key: 'disputes',
    title: 'Disputes',
    description: 'Flagged rides, what triggered them, and how each was resolved.',
    run: async ({ days }) => {
      const { rows } = await pool.query(
        `SELECT r.id::text AS ride_id, r.status::text AS ride_status,
                CASE WHEN r.status = 'NO_SHOW' THEN 'no_show' ELSE 'low_rating' END AS trigger,
                p.name AS passenger, d.name AS rider,
                (SELECT min(rt.stars) FROM ratings rt WHERE rt.ride_request_id = r.id) AS lowest_rating,
                coalesce(dr.outcome, 'unresolved') AS outcome,
                a.email AS resolved_by,
                to_char(coalesce(r.no_show_flag_at, r.completed_at, r.updated_at), 'YYYY-MM-DD HH24:MI') AS flagged_at
         FROM ride_requests r
         JOIN users p ON p.id = r.passenger_id
         LEFT JOIN users d ON d.id = r.claimed_by
         LEFT JOIN dispute_reviews dr ON dr.ride_request_id = r.id
         LEFT JOIN admin_users a ON a.id = dr.resolved_by
         WHERE (r.status = 'NO_SHOW'
                OR EXISTS (SELECT 1 FROM ratings rt WHERE rt.ride_request_id = r.id AND rt.stars <= $2))
           AND r.updated_at > now() - ($1::int * interval '1 day')
         ORDER BY r.updated_at DESC LIMIT 500`,
        [days, DISPUTE_RATING_THRESHOLD]
      );
      return rows;
    },
  },
  {
    key: 'admin_actions',
    title: 'Admin actions',
    description: 'Every gated action taken in the console, straight from the audit log.',
    run: async ({ days }) => {
      const { rows } = await pool.query(
        `SELECT to_char(l.created_at, 'YYYY-MM-DD HH24:MI:SS') AS at,
                l.admin_email, l.action_type, l.target_type, l.target_id,
                l.reason_code, l.reason_freetext, l.ip_address
         FROM admin_audit_log l
         WHERE l.created_at > now() - ($1::int * interval '1 day')
         ORDER BY l.created_at DESC LIMIT 2000`,
        [days]
      );
      return rows;
    },
  },
];

export function listReports() {
  return reports.map((r) => ({ key: r.key, title: r.title, description: r.description }));
}

export async function runReport(key: string, days: number) {
  const report = reports.find((r) => r.key === key);
  if (!report) throw errors.notFound('That report does not exist.');
  const window = Math.min(365, Math.max(1, Number.isFinite(days) ? days : 30));
  const rows = await report.run({ days: window });
  return { key: report.key, title: report.title, days: window, rows };
}

/** RFC 4180-ish CSV. Values are quoted and internal quotes doubled. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\r\n');
}
