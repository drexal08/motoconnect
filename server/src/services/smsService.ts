/**
 * SMS delivery for phone verification codes.
 *
 * ── Read this before assuming login works in production ─────────────────────
 * There is no SMS provider wired up. Codes are written to the server log and
 * nowhere else, which means passengers and riders CANNOT sign in on a live
 * deployment. This is the single remaining blocker to a real launch.
 *
 * It is deliberately not silent: `warnAboutSmsGateway()` prints on every
 * production boot, and `sendOtpSms` returns `delivered: false` so callers can
 * never mistake a logged code for a sent one.
 *
 * Why nothing is wired: every option costs money.
 *   • Firebase Phone Auth — needs the Blaze plan with a billing account since
 *     September 2024; there is no free SMS allowance on Spark at all.
 *   • Twilio / Africa's Talking / Infobip — per-message pricing, no free tier
 *     that covers real traffic.
 *   • A local Rwandan aggregator (e.g. Pindo, Mista) — usually the cheapest for
 *     +250 numbers, and worth pricing first.
 *
 * To wire one up, implement `deliver()` below and set SMS_PROVIDER. Nothing
 * else in the codebase needs to change: the OTP generation, hashing, expiry,
 * attempt limits and rate limiting are all already in authService.
 */
import { config } from '../config.js';

export interface SmsResult {
  delivered: boolean;
  channel: string;
  detail?: string;
}

export function smsConfigured(): boolean {
  return (process.env.SMS_PROVIDER ?? 'none') !== 'none';
}

/**
 * Sends a verification code. Returns whether it actually went anywhere — the
 * caller uses this to decide what to tell the user, and an undelivered code is
 * never reported as sent.
 */
export async function sendOtpSms(phone: string, code: string): Promise<SmsResult> {
  const provider = process.env.SMS_PROVIDER ?? 'none';

  if (provider === 'none') {
    console.log(`[OTP] ${phone}: ${code}  (no SMS provider — this code was not sent)`);
    return {
      delivered: false,
      channel: 'console',
      detail: 'No SMS provider is configured.',
    };
  }

  return deliver(provider, phone, code);
}

/**
 * Provider implementations go here.
 *
 * A provider should return `delivered: true` only when the gateway has accepted
 * the message. Anything else — a rejected number, an auth failure, a timeout —
 * is `delivered: false` with a `detail`, so the failure surfaces instead of
 * looking like a code the user simply did not read.
 */
async function deliver(provider: string, _phone: string, _code: string): Promise<SmsResult> {
  return {
    delivered: false,
    channel: provider,
    detail:
      `SMS_PROVIDER is set to "${provider}" but no implementation exists for it. ` +
      'Add one in server/src/services/smsService.ts.',
  };
}
