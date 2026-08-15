/**
 * Append-only admin audit log (admin spec §9).
 *
 * The contract that matters: §4.3 — "write an immutable audit log row BEFORE
 * the state change is considered complete; if the audit write fails, the state
 * change must not commit". So every gated action opens a transaction, writes
 * the audit row and the state change on the SAME client, and commits once.
 * `gatedAction()` below is the only sanctioned way to do that, which is why no
 * admin service calls pool.query() directly for a mutation.
 */
import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import type { AdminIdentity } from './adminAuth.js';

export interface AuditEntry {
  actionType: string;
  targetType: string;
  targetId?: string | null;
  reasonCode?: string | null;
  reasonFreetext?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
}

/** Writes one audit row on the caller's transaction client. Never used stand-alone for mutations. */
export async function writeAudit(client: PoolClient, admin: AdminIdentity, entry: AuditEntry) {
  await client.query(
    `INSERT INTO admin_audit_log
       (admin_user_id, admin_email, action_type, target_type, target_id,
        reason_code, reason_freetext, before_state, after_state, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      admin.id,
      admin.email,
      entry.actionType,
      entry.targetType,
      entry.targetId ?? null,
      entry.reasonCode ?? null,
      entry.reasonFreetext ?? null,
      entry.beforeState === undefined ? null : JSON.stringify(entry.beforeState),
      entry.afterState === undefined ? null : JSON.stringify(entry.afterState),
      admin.ip ?? null,
      admin.userAgent ?? null,
    ]
  );
}

/**
 * Runs a gated admin action: BEGIN → your mutation → audit row → COMMIT.
 *
 * `body` returns the audit entry so the log can capture the real before/after
 * state that the mutation observed, rather than a guess made by the caller.
 */
export async function gatedAction<T>(
  admin: AdminIdentity,
  body: (client: PoolClient) => Promise<{ result: T; audit: AuditEntry }>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { result, audit } = await body(client);
    await writeAudit(client, admin, audit);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection already gone */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Read-only actions that still leave a trace: revealing a masked National ID
 * (§4.1) and opening a rider's unmasked detail panel (§4.2) are PII access
 * events. They are not transactional — nothing is being protected from a
 * partial write — but they must still be recorded.
 */
export async function logPiiAccess(admin: AdminIdentity, entry: AuditEntry) {
  const client = await pool.connect();
  try {
    await writeAudit(client, admin, entry);
  } finally {
    client.release();
  }
}
