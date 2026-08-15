import { pool } from '../db/pool.js';
import { errors } from '../lib/errors.js';
import { generateOtp, hashOtp, OTP_TTL_MS, MAX_ATTEMPTS } from '../lib/otp.js';
import { verifyOtp as codesMatch } from '../lib/otp.js';
import { signToken } from '../lib/jwt.js';
import { config } from '../config.js';
import { normalizePhone } from '../lib/phone.js';
import { sendOtpSms } from './smsService.js';

const RESEND_COOLDOWN_MS = 60_000;
/** Per-phone in-memory rate limit: max 10 OTP requests per hour (single instance). */
const sendWindow = new Map<string, { count: number; windowStart: number }>();

export interface PublicUser {
  id: string;
  phone: string;
  name: string;
  role: 'passenger' | 'rider';
  consent: { granted: boolean; reconfirmRequired: boolean };
}

export async function requestOtp(rawPhone: string): Promise<{ devCode?: string }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    throw errors.badRequest(
      'Enter a valid Rwandan phone number starting with 07, +2507, 072, 073, 078 or 079.'
    );
  }

  const now = Date.now();
  const win = sendWindow.get(phone);
  if (win) {
    if (now - win.windowStart > 60 * 60 * 1000) {
      sendWindow.set(phone, { count: 1, windowStart: now });
    } else if (win.count >= 10) {
      throw errors.tooMany('Too many code requests for this number. Try again in an hour.');
    } else {
      win.count += 1;
    }
  } else {
    sendWindow.set(phone, { count: 1, windowStart: now });
  }

  const { rows } = await pool.query(
    `SELECT id, otp_last_sent_at FROM users WHERE phone = $1`,
    [phone]
  );

  if (rows[0]?.otp_last_sent_at) {
    const lastSent = new Date(rows[0].otp_last_sent_at).getTime();
    if (now - lastSent < RESEND_COOLDOWN_MS) {
      throw errors.tooMany('Wait 60 seconds before asking for a new code.');
    }
  }

  const code = generateOtp();
  await pool.query(
    `INSERT INTO users (phone, name, role, otp_code_hash, otp_expires_at, otp_attempts, otp_last_sent_at)
     VALUES ($1, '…', 'passenger', $2, $3, 0, now())
     ON CONFLICT (phone) DO UPDATE
       SET otp_code_hash = EXCLUDED.otp_code_hash,
           otp_expires_at = EXCLUDED.otp_expires_at,
           otp_attempts = 0,
           otp_last_sent_at = now()`,
    [phone, hashOtp(code), new Date(Date.now() + OTP_TTL_MS)]
  );

  // Delivery is honest about itself: with no provider configured the code is
  // logged and `delivered` comes back false, so this can never look like a
  // message that reached someone. See services/smsService.ts.
  const sms = await sendOtpSms(phone, code);

  // In development the code is returned so the flow is testable without a gateway.
  if (config.isDev) return { devCode: code };
  if (!sms.delivered) {
    throw errors.badRequest(
      'We cannot send verification codes right now. Please contact support.',
      'SMS_UNAVAILABLE'
    );
  }
  return {};
}

export async function verifyOtp(
  rawPhone: string,
  code: string,
  opts: { name?: string; termsAccepted?: boolean }
): Promise<{ token: string; user: PublicUser }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw errors.badRequest('Enter a valid Rwandan phone number.');

  // A time-limited suspension ends on its own; check at the point of use so a
  // sign-in is never wrongly refused just because the sweeper has not run yet.
  await pool.query(
    `UPDATE users SET account_status = 'active', disabled = false, suspended_until = NULL
     WHERE phone = $1 AND account_status = 'suspended'
       AND suspended_until IS NOT NULL AND suspended_until <= now()`,
    [phone]
  );

  const { rows } = await pool.query(
    `SELECT id, name, role, otp_code_hash, otp_expires_at, otp_attempts,
            location_consent_granted, consent_reconfirm_at, disabled,
            account_status, suspended_until
     FROM users WHERE phone = $1`,
    [phone]
  );

  let row = rows[0] as
    | {
        id: string;
        name: string;
        role: string;
        otp_code_hash: string | null;
        otp_expires_at: Date | null;
        otp_attempts: number;
        location_consent_granted: boolean;
        consent_reconfirm_at: Date | null;
        disabled: boolean;
        account_status: 'active' | 'suspended' | 'banned';
        suspended_until: Date | null;
      }
    | undefined;

  // First time: create the account (passenger role). Rider role comes via
  // POST /api/riders/apply which requires this verified account.
  if (!row) {
    const name = opts.name?.trim();
    if (!name) throw errors.badRequest('Enter your name to create your account.');
    if (!opts.termsAccepted) {
      throw errors.badRequest('You need to agree to the Terms and Privacy Policy first.');
    }
    await pool.query(
      `INSERT INTO users (phone, name, role, otp_code_hash, otp_expires_at, otp_attempts, otp_last_sent_at)
       VALUES ($1, $2, 'passenger', $3, $4, 0, now())`,
      [phone, name, hashOtp(code), new Date(Date.now() + OTP_TTL_MS)]
    );
    const { rows: fresh } = await pool.query(
      `SELECT id, name, role, otp_code_hash, otp_expires_at, otp_attempts,
              location_consent_granted, consent_reconfirm_at, disabled,
              account_status, suspended_until
       FROM users WHERE phone = $1`,
      [phone]
    );
    row = fresh[0] as (typeof row) & NonNullable<typeof row>;
  }

  // Plain English, and specific enough that the person knows what happened —
  // an ops-console suspension is temporary and a ban is not.
  if (row.account_status === 'banned') {
    throw errors.forbidden('This account has been closed. Contact support if you think this is a mistake.');
  }
  if (row.account_status === 'suspended') {
    const until = row.suspended_until ? new Date(row.suspended_until).toLocaleDateString() : null;
    throw errors.forbidden(
      until
        ? `This account is paused until ${until}. Contact support if you think this is a mistake.`
        : 'This account is paused. Contact support if you think this is a mistake.'
    );
  }
  if (row.disabled) throw errors.forbidden('This account has been disabled. Contact support.');

  if (!row.otp_code_hash || !row.otp_expires_at || new Date(row.otp_expires_at) < new Date()) {
    throw errors.badRequest('This code has expired. Ask for a new one.');
  }
  if (row.otp_attempts >= MAX_ATTEMPTS) {
    throw errors.tooMany('Too many wrong attempts. Ask for a new code.');
  }
  if (!codesMatch(code, row.otp_code_hash)) {
    await pool.query(`UPDATE users SET otp_attempts = otp_attempts + 1 WHERE id = $1`, [row.id]);
    throw errors.badRequest('Wrong code. Try again.');
  }

  await pool.query(
    `UPDATE users SET otp_code_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = $1`,
    [row.id]
  );

  const reconfirmRequired =
    !!row.consent_reconfirm_at && new Date(row.consent_reconfirm_at) <= new Date();

  return {
    token: signToken({ uid: row.id, role: row.role as 'passenger' | 'rider', phone }),
    user: {
      id: row.id,
      phone,
      name: row.name,
      role: row.role as 'passenger' | 'rider',
      consent: { granted: row.location_consent_granted, reconfirmRequired },
    },
  };
}

export async function getUser(uid: string): Promise<PublicUser & { reviewFlag: boolean }> {
  const { rows } = await pool.query(
    `SELECT id, phone, name, role, location_consent_granted, consent_reconfirm_at, review_flag
     FROM users WHERE id = $1`,
    [uid]
  );
  if (!rows.length) throw errors.unauthorized();
  const r = rows[0];
  return {
    id: r.id,
    phone: r.phone,
    name: r.name,
    role: r.role,
    consent: {
      granted: r.location_consent_granted,
      reconfirmRequired: !!r.consent_reconfirm_at && new Date(r.consent_reconfirm_at) <= new Date(),
    },
    reviewFlag: r.review_flag,
  };
}
