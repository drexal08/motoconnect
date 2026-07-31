import { pool } from '../db/pool.js';
import { CONSENT_RECONFIRM_DAYS } from '../config.js';
import { errors } from '../lib/errors.js';

/**
 * §3.3 + §11. Explicit, layered consent. Stored per user with a re-confirm
 * deadline 90 days after grant; requesting a ride (or claiming) with an
 * expired consent is blocked with a specific error code the UI maps to the
 * consent screen.
 */
export async function grantLocationConsent(userId: string) {
  const { rows } = await pool.query(
    `UPDATE users
     SET location_consent_granted = true, location_consent_at = now(),
         consent_reconfirm_at = now() + ($2::int * interval '1 day')
     WHERE id = $1
     RETURNING location_consent_granted, consent_reconfirm_at`,
    [userId, CONSENT_RECONFIRM_DAYS]
  );
  if (!rows.length) throw errors.notFound('Account not found.');
  return {
    granted: rows[0].location_consent_granted,
    reconfirmAt: rows[0].consent_reconfirm_at,
  };
}

export async function revokeLocationConsent(userId: string) {
  await pool.query(
    `UPDATE users
     SET location_consent_granted = false, location_consent_at = NULL, consent_reconfirm_at = NULL
     WHERE id = $1`,
    [userId]
  );
  return { granted: false };
}
