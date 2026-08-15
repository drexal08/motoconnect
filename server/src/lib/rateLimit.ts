/**
 * Per-IP rate limiting for the endpoints worth protecting.
 *
 * In-memory on purpose: this runs as a single instance, and a Redis dependency
 * to defend one login form would be more moving parts than the problem
 * deserves. If the API is ever scaled horizontally this becomes per-instance
 * and needs replacing — that is written down here rather than discovered.
 *
 * The admin account lockout in adminAuthService is the real control against
 * guessing one password. This is the control against an attacker spraying one
 * password across many accounts, which a per-account counter never sees.
 */
import type { NextFunction, Response } from 'express';
import type { Request } from 'express';
import { AppError } from './errors.js';
import { clientIp } from './adminAuth.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Keeps the map from growing without bound on a long-lived process.
const SWEEP_MS = 10 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}, SWEEP_MS).unref();

export function rateLimit(opts: { name: string; windowMs: number; max: number; message?: string }) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = `${opts.name}:${clientIp(req) ?? 'unknown'}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > opts.max) {
      const retryInSec = Math.ceil((bucket.resetAt - now) / 1000);
      return next(
        new AppError(
          429,
          'RATE_LIMITED',
          opts.message ?? `Too many attempts. Try again in ${retryInSec} seconds.`
        )
      );
    }
    next();
  };
}
