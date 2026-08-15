import { Router, json } from 'express';
import { asyncH, requireAuth, type AuthedRequest } from '../lib/http.js';
import { applyAsRider, getRiderStatus } from '../services/riderService.js';
import { getActiveSubscription } from '../services/subscriptionService.js';
import { getUnratedCompleted } from '../services/requestService.js';
import {
  deleteRiderDocument,
  listRiderDocuments,
  saveRiderDocument,
} from '../services/riderDocumentService.js';
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

/**
 * Verification documents. A base64 data URL rather than multipart: the client
 * already downscales the photo before sending (riders pay for mobile data), so
 * the payload is small and the server needs no multipart parser.
 *
 * The 8 MB body limit is scoped to THIS route — the global limit stays at
 * 100 kB so no other endpoint inherits a large-payload surface.
 */
ridersRouter.post(
  '/documents',
  requireAuth,
  json({ limit: '8mb' }),
  asyncH(async (req: AuthedRequest, res) => {
    const body = validate(
      z.object({
        kind: z.enum(['national_id', 'license', 'plate', 'selfie']),
        image: z.string().min(32, 'That photo did not come through. Try again.'),
      }),
      req.body,
      'Check the photo'
    );
    const saved = await saveRiderDocument(req.user!.uid, body.kind, body.image);
    const status = await listRiderDocuments(req.user!.uid);
    res.json({ ...saved, ...status });
  })
);

ridersRouter.get(
  '/documents',
  requireAuth,
  asyncH(async (req: AuthedRequest, res) => {
    res.json(await listRiderDocuments(req.user!.uid));
  })
);

ridersRouter.delete(
  '/documents/:kind',
  requireAuth,
  asyncH(async (req: AuthedRequest, res) => {
    await deleteRiderDocument(req.user!.uid, req.params.kind);
    res.json(await listRiderDocuments(req.user!.uid));
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
