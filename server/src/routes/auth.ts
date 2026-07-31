import { Router } from 'express';
import { asyncH } from '../lib/http.js';
import { requestOtp, verifyOtp, getUser } from '../services/authService.js';
import { validate, phoneSchema, OTP_CODE, nameSchema, booleanSchema } from '../lib/validation.js';
import { requireAuth, type AuthedRequest } from '../lib/http.js';
import { pool } from '../db/pool.js';
import { z } from 'zod';

export const authRouter = Router();

/** Step 1 of every flow: get a 6-digit code by SMS. */
authRouter.post(
  '/request-otp',
  asyncH(async (req, res) => {
    const { phone } = validate(z.object({ phone: phoneSchema }), req.body, 'Check your phone number');
    const out = await requestOtp(phone);
    res.json({
      message: 'We sent you a 6-digit code by SMS.',
      ...out, // devCode only present in non-production
    });
  })
);

/**
 * Step 2: verify the code. Creates the account on first verification
 * (passenger role). Existing accounts just sign in.
 */
authRouter.post(
  '/verify-otp',
  asyncH(async (req, res) => {
    const data = validate(
      z.object({
        phone: phoneSchema,
        code: OTP_CODE,
        name: nameSchema.optional(),
        termsAccepted: booleanSchema.optional(),
      }),
      req.body,
      'Check the code'
    );
    const out = await verifyOtp(data.phone, data.code, {
      name: data.name,
      termsAccepted: data.termsAccepted,
    });
    res.json(out);
  })
);

/** Current user (fresh profile + consent state). */
authRouter.get(
  '/me',
  requireAuth,
  asyncH(async (req: AuthedRequest, res) => {
    const user = await getUser(req.user!.uid);
    const rider = await pool
      .query(`SELECT verification_status FROM rider_profiles WHERE user_id = $1`, [req.user!.uid])
      .then((r) => r.rows[0] ?? null);
    res.json({
      user,
      riderProfile: rider ? { verificationStatus: rider.verification_status } : null,
    });
  })
);
