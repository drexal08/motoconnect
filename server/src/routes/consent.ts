import { Router } from 'express';
import { asyncH, requireAuth, type AuthedRequest } from '../lib/http.js';
import { grantLocationConsent, revokeLocationConsent } from '../services/consentService.js';

export const consentRouter = Router();

/** §3.3 + §11: explicit, layered consent. Re-confirmable, never a one-time click. */
consentRouter.post(
  '/grant',
  requireAuth,
  asyncH(async (req: AuthedRequest, res) => {
    const out = await grantLocationConsent(req.user!.uid);
    res.json({ message: 'Location sharing is on. You can turn it off anytime in Settings.', ...out });
  })
);

consentRouter.post(
  '/revoke',
  requireAuth,
  asyncH(async (req: AuthedRequest, res) => {
    await revokeLocationConsent(req.user!.uid);
    res.json({
      message:
        'Location sharing is off. You will not be able to request or accept rides while it is off.',
      granted: false,
    });
  })
);
