import { Router } from 'express';
import { asyncH, requireAuth, requireRole, type AuthedRequest } from '../lib/http.js';
import {
  createRequest,
  claimRequest,
  confirmRequest,
  cancelRequestAsPassenger,
  riderAction,
  getActiveRequestForUser,
  getUnratedCompleted,
  rateRide,
  getPoolForRider,
} from '../services/requestService.js';
import { validate } from '../lib/validation.js';
import { z } from 'zod';
import { pool } from '../db/pool.js';

export const requestsRouter = Router();

const createSchema = z.object({
  pickup: z.object({
    lat: z.number().min(-90).max(90, 'Location is invalid.'),
    lng: z.number().min(-180).max(180, 'Location is invalid.'),
  }),
  accuracyM: z.number().nonnegative().max(500).optional(),
  destinationNote: z.string().trim().max(120, 'Keep the destination note under 120 characters.').optional(),
});

/** §3.2 passenger side: create a ride request. Exact coords stay server-side. */
requestsRouter.post(
  '/',
  requireAuth,
  asyncH(async (req: AuthedRequest, res) => {
    const data = validate(createSchema, req.body, 'Check the ride request');
    const out = await createRequest(req.user!.uid, data.pickup, {
      accuracyM: data.accuracyM,
      destinationNote: data.destinationNote,
    });
    res.status(201).json({ message: 'We are finding riders near you.', ...out });
  })
);

/** §3.2 rider side: view the anonymized pool near your last known location. */
requestsRouter.get(
  '/pool',
  requireAuth,
  requireRole('rider'),
  asyncH(async (req: AuthedRequest, res) => {
    const me = await pool.query(
      `SELECT last_lat, last_lng FROM user_locations WHERE user_id = $1`,
      [req.user!.uid]
    );
    if (!me.rows.length) {
      res.json({ pool: [], locationKnown: false });
      return;
    }
    const poolItems = await getPoolForRider(req.user!.uid, {
      lat: Number(me.rows[0].last_lat),
      lng: Number(me.rows[0].last_lng),
    });
    res.json({ pool: poolItems, locationKnown: true });
  })
);

/**
 * §6.4 — the claim is a database-level compare-and-swap (see requestService).
 */
requestsRouter.post(
  '/:id/claim',
  requireAuth,
  requireRole('rider'),
  asyncH(async (req: AuthedRequest, res) => {
    const out = await claimRequest(req.user!.uid, req.params.id);
    res.json({
      message: 'Request claimed. The passenger has 30 seconds to confirm you.',
      ...out,
    });
  })
);

/** §3.2 step 4: passenger confirms — quota is consumed, coords revealed. */
requestsRouter.post(
  '/:id/confirm',
  requireAuth,
  asyncH(async (req: AuthedRequest, res) => {
    const out = await confirmRequest(req.user!.uid, req.params.id);
    res.json({ message: 'Rider notified. They can see your pickup point now.', ...out });
  })
);

/** §6.1: passenger cancels any time before COMPLETED. */
requestsRouter.delete(
  '/:id',
  requireAuth,
  asyncH(async (req: AuthedRequest, res) => {
    const body = req.body ?? {};
    const out = await cancelRequestAsPassenger(
      req.user!.uid,
      req.params.id,
      typeof body.reason === 'string' ? body.reason : undefined
    );
    res.json(out);
  })
);

/** Rider lifecycle actions: enroute / arrived / no_show / complete / cancel. */
requestsRouter.post(
  '/:id/action',
  requireAuth,
  asyncH(async (req: AuthedRequest, res) => {
    const action = validate(
      z.object({
        action: z.enum(['enroute', 'arrived', 'no_show', 'complete', 'cancel']),
      }),
      req.body,
      'Check the action'
    ).action;
    const out = await riderAction(req.user!.uid, req.params.id, action);
    res.json(out);
  })
);

/** Both sides: current open ride, if any. */
requestsRouter.get(
  '/active',
  requireAuth,
  asyncH(async (req: AuthedRequest, res) => {
    const [active, unrated] = await Promise.all([
      getActiveRequestForUser(req.user!.uid),
      getUnratedCompleted(req.user!.uid),
    ]);
    res.json({ active, unrated });
  })
);

/** Mandatory 2-way rating after COMPLETED (§6.3). */
requestsRouter.post(
  '/:id/rate',
  requireAuth,
  asyncH(async (req: AuthedRequest, res) => {
    const data = validate(
      z.object({
        stars: z.number().int().min(1).max(5),
        comment: z.string().trim().max(280, 'Keep the comment under 280 characters.').optional(),
      }),
      req.body,
      'Check the rating'
    );
    await rateRide(req.user!.uid, req.params.id, data.stars, data.comment);
    res.json({ message: 'Thanks for rating your ride.' });
  })
);
