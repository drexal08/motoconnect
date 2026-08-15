/** Ops-console auth routes (admin spec §2.2, §2.3). */
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../lib/validation.js';
import {
  adminH,
  anonymousAdmin,
  requireAdmin,
  type AdminRequest,
} from '../../lib/adminAuth.js';
import { rateLimit } from '../../lib/rateLimit.js';
import {
  changeOwnPassword,
  completeSetup,
  getSessionInfo,
  login,
  logout,
  verifyMfa,
} from '../../services/admin/adminAuthService.js';

export const adminAuthRouter = Router();

const loginSchema = z.object({
  email: z.string().trim().min(3).max(200),
  password: z.string().min(1, 'Enter your password.'),
});

/**
 * Per-IP limit on top of the per-account lockout in adminAuthService: the
 * account counter catches someone guessing one password, this catches someone
 * spraying one password across many accounts.
 */
adminAuthRouter.post(
  '/login',
  rateLimit({ name: 'admin-login', windowMs: 15 * 60 * 1000, max: 20 }),
  adminH(async (req, res) => {
    const body = validate(loginSchema, req.body, 'Check your sign-in details');
    const out = await login(body.email, body.password, anonymousAdmin(req));
    res.json(out);
  })
);

const mfaSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.') });

/**
 * Deliberately not behind `requireAdmin`: the session exists but is not yet
 * usable until the second factor lands, which is the whole point of the gate.
 */
adminAuthRouter.post(
  '/mfa',
  // A 6-digit code is 1-in-a-million per guess; without this, an attacker
  // holding a valid password could simply try until one lands.
  rateLimit({ name: 'admin-mfa', windowMs: 15 * 60 * 1000, max: 15 }),
  adminH(async (req, res) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Sign in first.', code: 'ADMIN_UNAUTHORIZED' });
      return;
    }
    const body = validate(mfaSchema, req.body, 'Check your code');
    const out = await verifyMfa(header.slice(7), body.code, anonymousAdmin(req));
    res.json(out);
  })
);

const setupSchema = z.object({
  token: z.string().min(10, 'That setup link looks incomplete.'),
  password: z.string().min(1, 'Choose a password.'),
});

adminAuthRouter.post(
  '/setup',
  rateLimit({ name: 'admin-setup', windowMs: 60 * 60 * 1000, max: 20 }),
  adminH(async (req, res) => {
    const body = validate(setupSchema, req.body, 'Check your new password');
    const out = await completeSetup(body.token, body.password, anonymousAdmin(req));
    res.json({ ...out, message: 'Password set. Sign in with it now.' });
  })
);

adminAuthRouter.get(
  '/me',
  requireAdmin,
  adminH(async (req: AdminRequest, res) => {
    res.json(await getSessionInfo(req.admin!));
  })
);

adminAuthRouter.post(
  '/logout',
  requireAdmin,
  adminH(async (req: AdminRequest, res) => {
    await logout(req.admin!);
    res.json({ ok: true });
  })
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

adminAuthRouter.post(
  '/password',
  requireAdmin,
  adminH(async (req: AdminRequest, res) => {
    const body = validate(changePasswordSchema, req.body, 'Check your passwords');
    await changeOwnPassword(req.admin!, body.currentPassword, body.newPassword);
    res.json({ ok: true, message: 'Password changed. Sign in again with the new one.' });
  })
);
