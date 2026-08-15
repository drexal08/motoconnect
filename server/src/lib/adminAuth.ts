/**
 * Ops-console authentication middleware (admin spec §2.3).
 *
 * Deliberately NOT the consumer app's stateless JWT: an admin session must be
 * killable the instant an account is suspended, and the idle timeout has to be
 * enforced server-side. So sessions live in `admin_sessions`, the client holds
 * an opaque random token, and only its SHA-256 is ever stored.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { pool } from '../db/pool.js';
import { AppError } from './errors.js';
import { ADMIN_IDLE_TIMEOUT_MS, ADMIN_MFA_REQUIRED_ROLES } from '../config.js';

export type AdminRole = 'super_admin' | 'support' | 'finance_ops';

export interface AdminIdentity {
  id: string;
  email: string;
  role: AdminRole;
  sessionId: string;
  ip: string | null;
  userAgent: string | null;
}

export interface AdminRequest extends Request {
  admin?: AdminIdentity;
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time string compare for tokens supplied by a client. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip ?? req.socket.remoteAddress ?? null;
}

export function clientUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 400) : null;
}

/** Identity for actions taken before a full session exists (login attempts, setup flow). */
export function anonymousAdmin(req: Request, known?: { id?: string; email?: string; role?: AdminRole }): AdminIdentity {
  return {
    id: known?.id ?? '',
    email: known?.email ?? 'unknown',
    role: known?.role ?? 'support',
    sessionId: '',
    ip: clientIp(req),
    userAgent: clientUserAgent(req),
  };
}

export function mfaRequiredFor(role: AdminRole): boolean {
  return (ADMIN_MFA_REQUIRED_ROLES as readonly string[]).includes(role);
}

/**
 * Resolves the bearer token to a live session. Enforces, in order: session
 * exists → not revoked → inside its absolute lifetime → inside the role's idle
 * window → second factor satisfied when the role demands one → account active.
 */
export async function requireAdmin(req: AdminRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError(401, 'ADMIN_UNAUTHORIZED', 'Sign in to the operations console.'));
  }

  try {
    const { rows } = await pool.query(
      `SELECT s.id AS session_id, s.admin_user_id, s.mfa_satisfied, s.last_seen_at,
              s.absolute_expires_at, s.revoked_at,
              a.email, a.role, a.status, a.mfa_enabled
       FROM admin_sessions s
       JOIN admin_users a ON a.id = s.admin_user_id
       WHERE s.token_hash = $1`,
      [hashToken(header.slice(7))]
    );

    const s = rows[0];
    if (!s || s.revoked_at) {
      return next(new AppError(401, 'ADMIN_UNAUTHORIZED', 'Your session has ended. Sign in again.'));
    }
    if (new Date(s.absolute_expires_at) <= new Date()) {
      await revokeSession(s.session_id, 'absolute-expiry');
      return next(new AppError(401, 'ADMIN_SESSION_EXPIRED', 'Your session reached its maximum length. Sign in again.'));
    }

    const role = s.role as AdminRole;
    const idleMs = Date.now() - new Date(s.last_seen_at).getTime();
    if (idleMs > ADMIN_IDLE_TIMEOUT_MS[role]) {
      await revokeSession(s.session_id, 'idle-timeout');
      return next(new AppError(401, 'ADMIN_SESSION_EXPIRED', 'Signed out after inactivity. Sign in again.'));
    }

    if (mfaRequiredFor(role) && !s.mfa_satisfied) {
      return next(new AppError(401, 'ADMIN_MFA_REQUIRED', 'Enter your authenticator code to continue.'));
    }
    if (s.mfa_enabled && !s.mfa_satisfied) {
      return next(new AppError(401, 'ADMIN_MFA_REQUIRED', 'Enter your authenticator code to continue.'));
    }
    if (s.status !== 'active') {
      await revokeSession(s.session_id, 'account-suspended');
      return next(new AppError(403, 'ADMIN_SUSPENDED', 'This admin account is suspended.'));
    }

    await pool.query(`UPDATE admin_sessions SET last_seen_at = now() WHERE id = $1`, [s.session_id]);

    req.admin = {
      id: s.admin_user_id,
      email: s.email,
      role,
      sessionId: s.session_id,
      ip: clientIp(req),
      userAgent: clientUserAgent(req),
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * §2.1 — role gating driven by data, not by a hardcoded account. `support` is
 * view-only; `finance_ops` cannot touch verification or bans. Adding the second
 * admin is an INSERT plus a role value, with no code change here.
 */
export function requireAdminRole(...roles: AdminRole[]) {
  return (req: AdminRequest, _res: Response, next: NextFunction) => {
    if (!req.admin) {
      return next(new AppError(401, 'ADMIN_UNAUTHORIZED', 'Sign in to the operations console.'));
    }
    if (!roles.includes(req.admin.role)) {
      return next(
        new AppError(403, 'ADMIN_FORBIDDEN', 'Your admin role does not allow this action.')
      );
    }
    next();
  };
}

export async function revokeSession(sessionId: string, _reason: string) {
  await pool.query(`UPDATE admin_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [
    sessionId,
  ]);
}

export async function revokeAllSessionsFor(adminUserId: string) {
  await pool.query(
    `UPDATE admin_sessions SET revoked_at = now() WHERE admin_user_id = $1 AND revoked_at IS NULL`,
    [adminUserId]
  );
}

/** Async route wrapper that keeps the admin type on the request. */
export function adminH(fn: (req: AdminRequest, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: AdminRequest, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
