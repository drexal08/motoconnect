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
  // RA<series letter><3 digits><suffix letter>, e.g. RAD123B — three leading
  // letters. Spaces are tolerated because that is how the plate is painted.
  const plate = data.plateNumber.trim().toUpperCase().replace(/[\s-]/g, '');
  if (!/^R[A-Z]{2}\d{3}[A-Z]$/.test(plate)) {
    throw errors.badRequest('Plate numbers look like RAD123B. Check for typos.');
  }

  const { rows } = await pool.query(
    `INSERT INTO rider_profiles (user_id, national_id, license_number, plate_number, verification_status)
     VALUES ($1, $2, $3, $4, 'pending_verification')
     ON CONFLICT (user_id) DO UPDATE SET
       national_id = EXCLUDED.national_id,
       license_number = EXCLUDED.license_number,
       plate_number = EXCLUDED.plate_number,
       -- The cast matters: a CASE whose branches are both bare string literals
       -- resolves to text, and Postgres will not implicitly assign text to an
       -- enum column. Without it, every rider resubmission fails.
       verification_status = (CASE
         WHEN rider_profiles.verification_status = 'verified' THEN 'verified'
         ELSE 'pending_verification'
       END)::verification_status,
       -- A resubmission is a new application: it re-enters the ops queue at the
       -- back, and any outstanding "send us this again" note is cleared.
       submitted_at = CASE
         WHEN rider_profiles.verification_status = 'verified' THEN rider_profiles.submitted_at
         ELSE now()
       END,
       info_requested_at = NULL,
       info_request_note = NULL,
       updated_at = now()
     RETURNING verification_status`,
    [userId, data.nationalId.trim(), data.licenseNumber.trim(), plate]
  );

  await pool.query(`UPDATE users SET role = 'rider' WHERE id = $1`, [userId]);

  return { verificationStatus: rows[0].verification_status };
}

export async function getRiderStatus(userId: string) {
  const { rows } = await pool.query(
    `SELECT rp.verification_status, rp.national_id, rp.license_number, rp.plate_number,
            rp.reliability_score, rp.claim_suspended_until, rp.rejection_reason,
            rp.rejection_code, rp.info_requested_at, rp.info_request_note,
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
    rejectionCode: r.rejection_code,
    // Set by the ops console's "request more info" action (admin spec §4.2).
    // The rider stays pending and is told exactly what to send again.
    infoRequestedAt: r.info_requested_at,
    infoRequestNote: r.info_request_note,
    name: r.name,
    phone: r.phone,
  };
}

/**
 * Verification decisions now live in the ops console
 * (server/src/services/admin/verificationService.ts), where each decision is
 * gated, reason-coded and written in the same transaction as its audit row.
 *
 * The previously unauthenticated helper that used to live here was removed
 * rather than left dormant: an exported function that flips a rider to
 * `verified` with no auth layer is one careless router line away from being a
 * public privilege-escalation endpoint.
 */
