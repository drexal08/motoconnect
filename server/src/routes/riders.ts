import { Router } from 'express';
import { asyncH, requireAuth, type AuthedRequest } from '../lib/http.js';
import { applyAsRider, getRiderStatus } from '../services/riderService.js';
import { getActiveSubscription } from '../services/subscriptionService.js';
import { getUnratedCompleted } from '../services/requestService.js';
import { validate } from '../lib/validation.js';
import { z } from 'zod';

export const ridersRouter = Router();

const applySchema = z.object({
  nationalId: z.string().trim(),
  licenseNumber: z.string().trim(),
  plateNumber: z.string().trim(),
});

/**
 * §4.2 + §10. licenseNumber format is intentionally free-form (min length only)
 * — the exact Rwandan driver licence format is an OPEN QUESTION to confirm
 * with RNP before hardcoding a regex.
 */
ridersRouter.post(
  '/apply',
  requireAuth,
  asyncH(async (req: AuthedRequest, res) => {
    const data = validate(applySchema, req.body, 'Check your rider details');
    const out = await applyAsRider(req.user!.uid, data);
    res.json({
      message:
        'Application received. We will verify your National ID and licence, usually within one working day.',
      ...out,
    });
  })
);

/** Verification + plan + rating status for the rider dashboard. */
ridersRouter.get(
  '/status',
  requireAuth,
  asyncH(async (req: AuthedRequest, res) => {
    const [status, subscription, unrated] = await Promise.all([
      getRiderStatus(req.user!.uid),
      getActiveSubscription(req.user!.uid),
      getUnratedCompleted(req.user!.uid),
    ]);
    res.json({ status, subscription, unrated });
  })
);
