/**
 * Ops-console authentication (admin spec §2.2, §2.3).
 *
 * Two things here are load-bearing and easy to get wrong:
 *
 *  1. An email address is an IDENTIFIER, not a credential. Nothing in this file
 *     grants access because a request came from, or claims, a given address.
 *     byiringirinnocent8@gmail.com is simply the login name on one seeded row.
 *  2. No password is ever seeded. A fresh admin row has password_hash = NULL and
 *     cannot authenticate at all until the operator completes the setup-token
 *     flow and chooses their own password.
 */
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { pool } from '../../db/pool.js';
import { errors } from '../../lib/errors.js';
import { sendEmail } from '../../lib/mailer.js';
import { generateSecret, otpauthUri, verifyTotp } from '../../lib/totp.js';
import { logPiiAccess } from '../../lib/audit.js';
import {
  hashToken,
  newSessionToken,
  mfaRequiredFor,
  revokeAllSessionsFor,
  type AdminIdentity,
  type AdminRole,
} from '../../lib/adminAuth.js';
import {
  ADMIN_LOCKOUT_MS,
  ADMIN_MAX_FAILED_LOGINS,
  ADMIN_SESSION_ABSOLUTE_MS,
  MIN_ADMIN_PASSWORD_LENGTH,
  config,
} from '../../config.js';

const BCRYPT_ROUNDS = 12;

/** §2.3 — length over composition theatre, plus the two checks that actually help. */
export function assertPasswordAcceptable(password: string, email: string) {
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw errors.badRequest(
      `Use at least ${MIN_ADMIN_PASSWORD_LENGTH} characters. Length matters more than symbols — a long passphrase is fine.`
    );
  }
  if (password.length > 200) throw errors.badRequest('That password is too long.');
  if (new Set(password).size < 5) {
    throw errors.badRequest('That password repeats too few distinct characters.');
  }
  const local = email.split('@')[0];
  if (local.length >= 4 && password.toLowerCase().includes(local.toLowerCase())) {
    throw errors.badRequest('Do not use your email address inside your password.');
  }
}

function hashSetupToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function auditLogin(identity: AdminIdentity, actionType: string, detail: Record<string, unknown>) {
  await logPiiAccess(identity, {
    actionType,
    targetType: 'admin_user',
    targetId: identity.id || null,
    afterState: detail,
  });
}

// ─── setup token flow (§2.2) ─────────────────────────────────────────────────

/**
 * Issues a one-time setup token and emails it. Returns whether delivery
 * actually happened — a token that went nowhere must never be reported as sent.
 */
export async function issueSetupToken(adminUserId: string) {
  const { rows } = await pool.query(`SELECT email FROM admin_users WHERE id = $1`, [adminUserId]);
  if (!rows.length) throw errors.notFound('Admin account not found.');
  const email = rows[0].email as string;

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.admin.setupTokenTtlMs);
  await pool.query(
    `UPDATE admin_users SET setup_token_hash = $2, setup_token_expires_at = $3 WHERE id = $1`,
    [adminUserId, hashSetupToken(token), expiresAt]
  );

  const link = `${config.admin.consoleUrl}#/setup?token=${token}`;
  const delivery = await sendEmail(
    email,
    'Set your MotoConnect operations console password',
    [
      'A password-set link was issued for the MotoConnect operations console.',
      '',
      `Account: ${email}`,
      `Link:    ${link}`,
      `Expires: ${expiresAt.toUTCString()}`,
      '',
      'This link can be used once. If you did not expect it, ignore this email and',
      'tell the platform owner — the account cannot be signed into until a password is set.',
    ].join('\n')
  );

  return { email, expiresAt, delivery, link };
}

export async function completeSetup(rawToken: string, password: string, identity: AdminIdentity) {
  const { rows } = await pool.query(
    `SELECT id, email, role, setup_token_expires_at FROM admin_users
     WHERE setup_token_hash = $1 AND status = 'active'`,
    [hashSetupToken(rawToken)]
  );
  const admin = rows[0];
  if (!admin || !admin.setup_token_expires_at || new Date(admin.setup_token_expires_at) <= new Date()) {
    throw errors.badRequest('This setup link is invalid or has expired. Ask for a new one.');
  }

  assertPasswordAcceptable(password, admin.email);
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await pool.query(
    `UPDATE admin_users
     SET password_hash = $2, password_set_at = now(),
         setup_token_hash = NULL, setup_token_expires_at = NULL,
         failed_login_count = 0, locked_until = NULL
     WHERE id = $1`,
    [admin.id, hash]
  );
  // A password change invalidates every existing session, no exceptions.
  await revokeAllSessionsFor(admin.id);

  await auditLogin({ ...identity, id: admin.id, email: admin.email, role: admin.role }, 'admin.password_set', {
    via: 'setup_token',
  });

  return { email: admin.email as string, role: admin.role as AdminRole };
}

// ─── login (§2.3) ────────────────────────────────────────────────────────────

export interface LoginOutcome {
  token: string;
  admin: { id: string; email: string; role: AdminRole };
  /** Session is not usable until the second factor is satisfied. */
  mfaRequired: boolean;
  /** Role demands 2FA but no authenticator is enrolled yet — enrol before anything else. */
  mfaSetupRequired: boolean;
  enrolment?: { secret: string; otpauthUri: string; qrDataUrl: string };
}

export async function login(
  email: string,
  password: string,
  identity: AdminIdentity
): Promise<LoginOutcome> {
  const normalized = email.trim().toLowerCase();
  const { rows } = await pool.query(
    `SELECT id, email, role, password_hash, status, mfa_enabled, mfa_secret,
            failed_login_count, locked_until
     FROM admin_users WHERE email = $1`,
    [normalized]
  );
  const admin = rows[0];

  // §2.3: every login attempt is logged, success or failure, with IP + user agent.
  const failed = async (reason: string) => {
    await auditLogin({ ...identity, id: admin?.id ?? '', email: normalized, role: admin?.role ?? 'support' },
      'admin.login_failed', { reason, email: normalized });
  };

  if (!admin) {
    await failed('unknown_email');
    // Same message for unknown account and wrong password — no account enumeration.
    throw errors.unauthorized('Email or password is incorrect.', 'ADMIN_BAD_CREDENTIALS');
  }
  if (admin.status !== 'active') {
    await failed('account_suspended');
    throw errors.forbidden('This admin account is suspended.', 'ADMIN_SUSPENDED');
  }
  if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
    await failed('locked_out');
    throw errors.tooMany('Too many failed attempts. Try again in a few minutes.', 'ADMIN_LOCKED');
  }
  if (!admin.password_hash) {
    await failed('password_never_set');
    throw errors.unauthorized(
      'This account has no password yet. Use the setup link that was emailed to it.',
      'ADMIN_SETUP_REQUIRED'
    );
  }

  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) {
    const count = Number(admin.failed_login_count) + 1;
    await pool.query(
      // The casts are load-bearing: reusing a parameter in two positions leaves
      // Postgres unable to deduce one consistent type for it.
      `UPDATE admin_users SET failed_login_count = $2::int,
              locked_until = CASE WHEN $2::int >= $3::int
                                  THEN now() + ($4::int * interval '1 millisecond')
                                  ELSE locked_until END
       WHERE id = $1`,
      [admin.id, count, ADMIN_MAX_FAILED_LOGINS, ADMIN_LOCKOUT_MS]
    );
    await failed('bad_password');
    throw errors.unauthorized('Email or password is incorrect.', 'ADMIN_BAD_CREDENTIALS');
  }

  await pool.query(
    `UPDATE admin_users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`,
    [admin.id]
  );

  const role = admin.role as AdminRole;
  const needsMfa = admin.mfa_enabled || mfaRequiredFor(role);
  const mfaSetupRequired = mfaRequiredFor(role) && !admin.mfa_enabled;

  const token = newSessionToken();
  await pool.query(
    `INSERT INTO admin_sessions (admin_user_id, token_hash, mfa_satisfied, ip_address, user_agent, absolute_expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + ($6::int * interval '1 millisecond'))`,
    [admin.id, hashToken(token), !needsMfa, identity.ip, identity.userAgent, ADMIN_SESSION_ABSOLUTE_MS]
  );

  const adminIdentity: AdminIdentity = { ...identity, id: admin.id, email: admin.email, role };
  await auditLogin(adminIdentity, 'admin.login_succeeded', {
    mfaPending: needsMfa,
    mfaSetupRequired,
  });

  let enrolment: LoginOutcome['enrolment'];
  if (mfaSetupRequired) {
    const secret = generateSecret();
    await pool.query(`UPDATE admin_users SET mfa_pending_secret = $2 WHERE id = $1`, [admin.id, secret]);
    const uri = otpauthUri(secret, admin.email);
    enrolment = { secret, otpauthUri: uri, qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 240 }) };
  }

  return {
    token,
    admin: { id: admin.id, email: admin.email, role },
    mfaRequired: needsMfa && !mfaSetupRequired,
    mfaSetupRequired,
    enrolment,
  };
}

/** Verifies a TOTP code against a half-authenticated session and completes it. */
export async function verifyMfa(rawToken: string, code: string, identity: AdminIdentity) {
  const { rows } = await pool.query(
    `SELECT s.id AS session_id, s.revoked_at, s.absolute_expires_at,
            a.id AS admin_id, a.email, a.role, a.status, a.mfa_enabled, a.mfa_secret, a.mfa_pending_secret
     FROM admin_sessions s JOIN admin_users a ON a.id = s.admin_user_id
     WHERE s.token_hash = $1`,
    [hashToken(rawToken)]
  );
  const s = rows[0];
  if (!s || s.revoked_at || new Date(s.absolute_expires_at) <= new Date()) {
    throw errors.unauthorized('Your session has ended. Sign in again.', 'ADMIN_UNAUTHORIZED');
  }
  if (s.status !== 'active') throw errors.forbidden('This admin account is suspended.', 'ADMIN_SUSPENDED');

  const enrolling = !s.mfa_enabled && !!s.mfa_pending_secret;
  const secret = enrolling ? s.mfa_pending_secret : s.mfa_secret;
  if (!secret) throw errors.badRequest('No authenticator is set up for this account.');

  const adminIdentity: AdminIdentity = {
    ...identity,
    id: s.admin_id,
    email: s.email,
    role: s.role,
    sessionId: s.session_id,
  };

  if (!verifyTotp(secret, code)) {
    await auditLogin(adminIdentity, 'admin.mfa_failed', { enrolling });
    throw errors.unauthorized('That authenticator code is not right. Try the current one.', 'ADMIN_BAD_MFA');
  }

  if (enrolling) {
    await pool.query(
      `UPDATE admin_users SET mfa_enabled = true, mfa_secret = $2, mfa_pending_secret = NULL WHERE id = $1`,
      [s.admin_id, secret]
    );
  }
  await pool.query(`UPDATE admin_sessions SET mfa_satisfied = true, last_seen_at = now() WHERE id = $1`, [
    s.session_id,
  ]);

  await auditLogin(adminIdentity, enrolling ? 'admin.mfa_enrolled' : 'admin.mfa_succeeded', {});

  return { admin: { id: s.admin_id, email: s.email, role: s.role as AdminRole } };
}

export async function logout(admin: AdminIdentity) {
  await pool.query(`UPDATE admin_sessions SET revoked_at = now() WHERE id = $1`, [admin.sessionId]);
  await auditLogin(admin, 'admin.logout', {});
}

export async function changeOwnPassword(admin: AdminIdentity, current: string, next: string) {
  const { rows } = await pool.query(`SELECT password_hash FROM admin_users WHERE id = $1`, [admin.id]);
  if (!rows.length || !rows[0].password_hash) throw errors.notFound('Admin account not found.');
  if (!(await bcrypt.compare(current, rows[0].password_hash))) {
    await auditLogin(admin, 'admin.password_change_failed', {});
    throw errors.unauthorized('Your current password is not right.', 'ADMIN_BAD_CREDENTIALS');
  }
  assertPasswordAcceptable(next, admin.email);
  await pool.query(`UPDATE admin_users SET password_hash = $2, password_set_at = now() WHERE id = $1`, [
    admin.id,
    await bcrypt.hash(next, BCRYPT_ROUNDS),
  ]);
  await revokeAllSessionsFor(admin.id);
  await auditLogin(admin, 'admin.password_changed', {});
}

export async function getSessionInfo(admin: AdminIdentity) {
  const { rows } = await pool.query(
    `SELECT a.email, a.role, a.mfa_enabled, a.last_login_at, s.last_seen_at, s.absolute_expires_at
     FROM admin_users a JOIN admin_sessions s ON s.id = $2
     WHERE a.id = $1`,
    [admin.id, admin.sessionId]
  );
  const r = rows[0];
  return {
    id: admin.id,
    email: r?.email ?? admin.email,
    role: admin.role,
    mfaEnabled: !!r?.mfa_enabled,
    lastLoginAt: r?.last_login_at ?? null,
    sessionExpiresAt: r?.absolute_expires_at ?? null,
  };
}
