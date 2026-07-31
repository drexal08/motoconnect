import type { NextFunction, Request, Response } from 'express';
import { verifyToken, type TokenPayload } from '../lib/jwt.js';
import { AppError, isAppError } from '../lib/errors.js';
import { getUser } from '../services/authService.js';

export interface AuthedRequest extends Request {
  user?: TokenPayload;
}

/** JWT middleware — puts {uid, role, phone} on req.user. */
export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Please sign in to continue.'));
  }
  const payload = verifyToken(header.slice(7));
  if (!payload) return next(new AppError(401, 'UNAUTHORIZED', 'Your session expired. Sign in again.'));
  req.user = payload;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have access to this page.'));
    }
    next();
  };
}

/** Validates the account still exists and is not disabled (cheap cached-ish check). */
export async function ensureActiveUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (!req.user) return next();
  try {
    await getUser(req.user.uid);
    next();
  } catch {
    next(new AppError(401, 'UNAUTHORIZED', 'Please sign in to continue.'));
  }
}

/** Async route wrapper so thrown errors reach the error middleware. */
export function asyncH(fn: (req: AuthedRequest, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (isAppError(err)) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof SyntaxError) {
    res.status(400).json({ error: 'The request body is not valid JSON.' });
    return;
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Something went wrong on our side. Try again in a moment.' });
}
