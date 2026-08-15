/**
 * Admin account management (admin spec §2.1, §2.2, Settings nav item).
 *
 * §2.1 is explicit that role logic must not be written for one hardcoded
 * account. Everything below is keyed on the `role` column, so adding a support
 * or finance_ops operator later is `createAdmin({ email, role })` — a data
 * entry task, exactly as specified.
 */
import { pool } from '../../db/pool.js';
import { errors } from '../../lib/errors.js';
import { gatedAction } from '../../lib/audit.js';
import { revokeAllSessionsFor, type AdminIdentity, type AdminRole } from '../../lib/adminAuth.js';
import { config } from '../../config.js';
import { issueSetupToken } from './adminAuthService.js';

export const ADMIN_ROLES: AdminRole[] = ['super_admin', 'support', 'finance_ops'];

/**
 * §2.2 — on first deploy, create exactly one admin row: the seed super_admin.
 *
 * There is deliberately NO default password here. The row is created with
 * password_hash = NULL (which `login()` refuses outright) and a one-time setup
 * token is emailed to the address. If the mail could not be delivered, the link
 * is printed to the server console and that fact is stated plainly — an
 * undelivered token is never reported as sent.
 */
export async function ensureSeedAdmin() {
  const existing = await pool.query(`SELECT count(*)::int AS n FROM admin_users`);
  if (existing.rows[0].n > 0) return { created: false };

  const email = config.admin.seedEmail;
  const { rows } = await pool.query(
    `INSERT INTO admin_users (email, role, status) VALUES ($1, 'super_admin', 'active') RETURNING id`,
    [email]
  );
  const id = rows[0].id as string;
  const { delivery, expiresAt, link } = await issueSetupToken(id);

  console.log(
    `\n  Seed super_admin created: ${email}` +
      `\n  No password was set (by design). A one-time setup link was issued, valid until ${expiresAt.toUTCString()}.` +
      (delivery.delivered
        ? `\n  Setup link emailed via ${delivery.channel}.`
        : `\n  NOT EMAILED (${delivery.detail}). Use this link to set the password:\n  ${link}`) +
      '\n'
  );

  return { created: true, email, delivered: delivery.delivered };
}

export async function listAdmins() {
  const { rows } = await pool.query(
    `SELECT a.id, a.email, a.role, a.status, a.mfa_enabled, a.created_at, a.last_login_at,
            a.password_set_at IS NOT NULL AS password_set,
            a.setup_token_expires_at,
            (SELECT count(*)::int FROM admin_sessions s
              WHERE s.admin_user_id = a.id AND s.revoked_at IS NULL AND s.absolute_expires_at > now()) AS active_sessions
     FROM admin_users a ORDER BY a.created_at ASC`
  );
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role as AdminRole,
    status: r.status,
    mfaEnabled: r.mfa_enabled,
    passwordSet: r.password_set,
    setupTokenExpiresAt: r.setup_token_expires_at,
    activeSessions: r.active_sessions,
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at,
  }));
}

export async function createAdmin(
  admin: AdminIdentity,
  input: { email: string; role: AdminRole; reasonFreetext: string }
) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) throw errors.badRequest('Enter a valid email address.');
  if (!ADMIN_ROLES.includes(input.role)) throw errors.badRequest('Choose a valid role.');
  if (!input.reasonFreetext?.trim()) throw errors.badRequest('Say why this admin account is being created.');

  const dupe = await pool.query(`SELECT 1 FROM admin_users WHERE email = $1`, [email]);
  if (dupe.rows.length) throw errors.conflict('An admin account already uses that email address.');

  const id = await gatedAction(admin, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO admin_users (email, role, status) VALUES ($1, $2, 'active') RETURNING id`,
      [email, input.role]
    );
    return {
      result: rows[0].id as string,
      audit: {
        actionType: 'admin.account_created',
        targetType: 'admin_user',
        targetId: rows[0].id,
        reasonFreetext: input.reasonFreetext.trim(),
        afterState: { email, role: input.role, status: 'active', passwordSet: false },
      },
    };
  });

  // Same rule as the seed account: no password is ever chosen on their behalf.
  const { delivery, expiresAt, link } = await issueSetupToken(id);
  return {
    id,
    email,
    role: input.role,
    setupExpiresAt: expiresAt,
    delivered: delivery.delivered,
    deliveryDetail: delivery.detail ?? null,
    // Only surfaced when delivery failed, so the owner can hand it over another way.
    setupLink: delivery.delivered ? null : link,
  };
}

export async function resendSetupLink(admin: AdminIdentity, targetId: string, reasonFreetext: string) {
  if (!reasonFreetext?.trim()) throw errors.badRequest('Say why a new setup link is needed.');
  const target = await pool.query(`SELECT email FROM admin_users WHERE id = $1`, [targetId]);
  if (!target.rows.length) throw errors.notFound('Admin account not found.');

  await gatedAction(admin, async (client) => {
    await client.query(`UPDATE admin_users SET failed_login_count = 0, locked_until = NULL WHERE id = $1`, [
      targetId,
    ]);
    return {
      result: null,
      audit: {
        actionType: 'admin.setup_link_reissued',
        targetType: 'admin_user',
        targetId,
        reasonFreetext: reasonFreetext.trim(),
        afterState: { email: target.rows[0].email },
      },
    };
  });

  const { delivery, expiresAt, link } = await issueSetupToken(targetId);
  return {
    email: target.rows[0].email as string,
    expiresAt,
    delivered: delivery.delivered,
    deliveryDetail: delivery.detail ?? null,
    setupLink: delivery.delivered ? null : link,
  };
}

export async function setAdminStatus(
  admin: AdminIdentity,
  targetId: string,
  status: 'active' | 'suspended',
  reasonFreetext: string
) {
  if (!reasonFreetext?.trim()) throw errors.badRequest('A reason is required to change an admin account status.');
  if (targetId === admin.id) throw errors.badRequest('You cannot change your own admin account status.');

  const before = await pool.query(`SELECT email, role, status FROM admin_users WHERE id = $1`, [targetId]);
  if (!before.rows.length) throw errors.notFound('Admin account not found.');

  // Never leave the platform with no way in.
  if (status === 'suspended' && before.rows[0].role === 'super_admin') {
    const others = await pool.query(
      `SELECT count(*)::int AS n FROM admin_users
       WHERE role = 'super_admin' AND status = 'active' AND id <> $1`,
      [targetId]
    );
    if (others.rows[0].n === 0) {
      throw errors.conflict('This is the last active super admin. Create another one before suspending this account.');
    }
  }

  await gatedAction(admin, async (client) => {
    await client.query(`UPDATE admin_users SET status = $2 WHERE id = $1`, [targetId, status]);
    return {
      result: null,
      audit: {
        actionType: 'admin.account_status_changed',
        targetType: 'admin_user',
        targetId,
        reasonFreetext: reasonFreetext.trim(),
        beforeState: { status: before.rows[0].status },
        afterState: { status, email: before.rows[0].email },
      },
    };
  });

  if (status === 'suspended') await revokeAllSessionsFor(targetId);
  return { status };
}

/** Clears an authenticator so a locked-out admin can re-enrol on next login. */
export async function resetAdminMfa(admin: AdminIdentity, targetId: string, reasonFreetext: string) {
  if (!reasonFreetext?.trim()) throw errors.badRequest('Say why the authenticator is being reset.');
  const before = await pool.query(`SELECT email, mfa_enabled FROM admin_users WHERE id = $1`, [targetId]);
  if (!before.rows.length) throw errors.notFound('Admin account not found.');

  await gatedAction(admin, async (client) => {
    await client.query(
      `UPDATE admin_users SET mfa_enabled = false, mfa_secret = NULL, mfa_pending_secret = NULL WHERE id = $1`,
      [targetId]
    );
    return {
      result: null,
      audit: {
        actionType: 'admin.mfa_reset',
        targetType: 'admin_user',
        targetId,
        reasonFreetext: reasonFreetext.trim(),
        beforeState: { mfaEnabled: before.rows[0].mfa_enabled },
        afterState: { mfaEnabled: false, email: before.rows[0].email },
      },
    };
  });

  await revokeAllSessionsFor(targetId);
  return { ok: true };
}
