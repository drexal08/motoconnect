import { pool } from '../db/pool.js';
import { errors } from '../lib/errors.js';

/**
 * §4.2: rider applications are created in pending_verification and stay there
 * until a human (or documents API) confirms the National ID + license belong
 * to the applicant. A rider cannot see any requests until verified.
 */
export async function applyAsRider(
  userId: string,
  data: { nationalId: string; licenseNumber: string; plateNumber: string }
) {
  if (!/^1\d{15}$/.test(data.nationalId)) {
    throw errors.badRequest('National ID must be 16 digits and start with 1.');
  }
  if (data.licenseNumber.trim().length < 4) {
    throw errors.badRequest('Enter your full driver licence number.');
  }
  if (!/^R[A-Z]\d{3}[A-Z]$/.test(data.plateNumber.trim())) {
    throw errors.badRequest('Plate numbers look like RAD123B. Check for typos.');
  }

  const { rows } = await pool.query(
    `INSERT INTO rider_profiles (user_id, national_id, license_number, plate_number, verification_status)
     VALUES ($1, $2, $3, $4, 'pending_verification')
     ON CONFLICT (user_id) DO UPDATE SET
       national_id = EXCLUDED.national_id,
       license_number = EXCLUDED.license_number,
       plate_number = EXCLUDED.plate_number,
       verification_status = CASE
         WHEN rider_profiles.verification_status = 'verified' THEN 'verified'
         ELSE 'pending_verification'
       END,
       updated_at = now()
     RETURNING verification_status`,
    [userId, data.nationalId.trim(), data.licenseNumber.trim(), data.plateNumber.trim().toUpperCase()]
  );

  await pool.query(`UPDATE users SET role = 'rider' WHERE id = $1`, [userId]);

  return { verificationStatus: rows[0].verification_status };
}

export async function getRiderStatus(userId: string) {
  const { rows } = await pool.query(
    `SELECT rp.verification_status, rp.national_id, rp.license_number, rp.plate_number,
            rp.reliability_score, rp.claim_suspended_until, rp.rejection_reason,
            u.name, u.phone
     FROM rider_profiles rp JOIN users u ON u.id = rp.user_id
     WHERE rp.user_id = $1`,
    [userId]
  );
  if (!rows.length) {
    throw errors.notFound('You have not applied as a rider yet.');
  }
  const r = rows[0];
  return {
    verificationStatus: r.verification_status,
    nationalId: r.national_id,
    licenseNumber: r.license_number,
    plateNumber: r.plate_number,
    reliabilityScore: Number(r.reliability_score),
    claimSuspendedUntil: r.claim_suspended_until,
    rejectionReason: r.rejection_reason,
    name: r.name,
    phone: r.phone,
  };
}

/**
 * Admin-only verification action. NOTE: no admin auth layer exists yet —
 * gate this behind an admin token or remove from the public router until then.
 * The verification workflow itself is intentionally human-in-the-loop.
 */
export async function setVerification(
  userId: string,
  status: 'verified' | 'rejected',
  reason?: string
) {
  const { rows } = await pool.query(
    `UPDATE rider_profiles
     SET verification_status = $2,
         verified_at = CASE WHEN $2 = 'verified' THEN now() ELSE verified_at END,
         rejection_reason = $3,
         updated_at = now()
     WHERE user_id = $1
     RETURNING verification_status`,
    [userId, status, reason ?? null]
  );
  if (!rows.length) throw errors.notFound('Rider profile not found.');
  return { verificationStatus: rows[0].verification_status };
}
