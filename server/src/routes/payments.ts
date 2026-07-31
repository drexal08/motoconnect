import { Router, type Request, type Response } from 'express';
import { asyncH, requireAuth, requireRole, type AuthedRequest } from '../lib/http.js';
import {
  getActiveSubscription,
  getDemandIndicator,
  purchaseSubscription,
  getPayment,
  completePaymentFromProvider,
  cancelSubscription,
} from '../services/subscriptionService.js';
import { verifyWebhookSignature } from '../services/paypack.js';
import { validate } from '../lib/validation.js';
import { z } from 'zod';
import { pool } from '../db/pool.js';

export const paymentsRouter = Router();

/** §5.4 — aggregate demand count (no positions). Used before buying a plan. */
paymentsRouter.get(
  '/demand',
  requireAuth,
  asyncH(async (req: AuthedRequest, res) => {
    const loc = await pool
      .query(`SELECT last_lat, last_lng FROM user_locations WHERE user_id = $1`, [req.user!.uid])
      .then((r) => r.rows[0] ?? null);
    const out = await getDemandIndicator(
      loc ? { lat: Number(loc.last_lat), lng: Number(loc.last_lng) } : null
    );
    res.json(out);
  })
);

/** §5 — buy a plan via MTN MoMo or Airtel Money (both go through PayPack). */
paymentsRouter.post(
  '/subscriptions/purchase',
  requireAuth,
  requireRole('rider'),
  asyncH(async (req: AuthedRequest, res) => {
    const data = validate(
      z.object({
        tier: z.enum(['agahozo', 'isonga', 'impuruza']),
        phone: z.string().min(9, 'Enter the mobile money phone number to pay from.'),
      }),
      req.body,
      'Check the plan'
    );
    const out = await purchaseSubscription(req.user!.uid, req.user!.uid, data.tier, data.phone);
    res.json(out);
  })
);

/** Current plan (if any). */
paymentsRouter.get(
  '/subscriptions',
  requireAuth,
  asyncH(async (req: AuthedRequest, res) => {
    const subscription = await getActiveSubscription(req.user!.uid);
    res.json({ subscription });
  })
);

paymentsRouter.post(
  '/subscriptions/cancel',
  requireAuth,
  requireRole('rider'),
  asyncH(async (req: AuthedRequest, res) => {
    const out = await cancelSubscription(req.user!.uid);
    res.json({ message: 'Your plan is cancelled.', ...out });
  })
);

/** Frontend polls this while waiting for the payer to approve on their phone. */
paymentsRouter.get(
  '/:id',
  requireAuth,
  asyncH(async (req: AuthedRequest, res) => {
    const payment = await getPayment(req.params.id);
    if (payment.userId !== req.user!.uid) {
      res.status(404).json({ error: 'Payment not found.' });
      return;
    }
    res.json(payment);
  })
);

/**
 * §8.4 — PayPack webhook. Idempotency is enforced in completePaymentFromProvider:
 * unique provider_ref + status guard + event-id dedupe. Duplicate deliveries
 * cannot double-credit a subscription.
 * Raw body is needed for the HMAC signature check.
 */
paymentsRouter.post(
  '/paypack-webhook',
  expressRaw,
  asyncH(async (req: Request, res: Response) => {
    const signature = req.headers['x-paypack-signature'] as string | undefined;
    const rawBody = (req as any).rawBody ?? JSON.stringify(req.body);

    if (!verifyWebhookSignature(rawBody, signature)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const event = JSON.parse(rawBody) as {
      kind?: string;
      event_kind?: string;
      id?: string;
      event_id?: string;
      data?: { ref?: string; status?: string };
      ref?: string;
      status?: string;
      timestamp?: string;
      created_at?: string;
    };

    const kind = event.kind || event.event_kind;
    if (kind !== 'transaction:processed') {
      res.json({ received: true });
      return;
    }
    const txn = event.data ?? event;
    const ref = txn.ref;
    const status = txn.status;
    if (!ref) {
      res.status(400).json({ error: 'Missing transaction reference' });
      return;
    }

    const payment = await pool
      .query(`SELECT id FROM payments WHERE provider_ref = $1`, [ref])
      .then((r) => r.rows[0] ?? null);

    if (!payment) {
      // Unknown ref — acknowledge so PayPack stops retrying; nothing to credit.
      res.json({ received: true });
      return;
    }

    const out = await completePaymentFromProvider(payment.id, ref, status ?? 'failed', event.id || event.event_id);
    res.json({ received: true, processed: out.processed });
  })
);

/** Express raw-body middleware for the webhook (HMAC needs the exact bytes). */
function expressRaw(req: Request, _res: Response, next: () => void) {
  let body = '';
  req.on('data', (chunk: Buffer) => {
    body += chunk.toString('utf8');
    if (body.length > 1_000_000) req.destroy();
  });
  req.on('end', () => {
    (req as any).rawBody = body;
    try {
      req.body = body ? JSON.parse(body) : {};
    } catch {
      req.body = {};
    }
    next();
  });
}
