/**
 * Dev-only seed data. All names are clearly fictional; no real people or
 * phone numbers are used. Never run against production.
 */
import 'dotenv/config';
import pg from 'pg';
import { scryptSync } from 'node:crypto';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function hashCode(code: string) {
  return scryptSync(code, 'motoconnect-seed-salt', 32).toString('hex');
}

// Kigali anchor: Kimihurura
const A = { lat: -1.9509, lng: 30.0719 };
const OFF = [
  [0.012, 0.006],
  [-0.015, 0.009],
  [0.008, -0.012],
  [-0.01, -0.007],
  [0.02, 0.002],
  [-0.022, 0.004],
];

async function seed() {
  console.log('Seeding dev data …');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const riders = [
      { name: 'Eric Mugisha', phone: '+250788111001', national_id: '1198012345678901', license: 'DL-RW-48291', plate: 'RAD123B' },
      { name: 'Claudine Uwase', phone: '+250788111002', national_id: '1199212345678902', license: 'DL-RW-59312', plate: 'RAB456C' },
      { name: 'Jean Bosco', phone: '+250788111003', national_id: '1198512345678903', license: 'DL-RW-60477', plate: 'RAE789D' },
    ];

    for (const r of riders) {
      await client.query(
        `INSERT INTO users (phone, name, role, location_consent_granted, location_consent_at, consent_reconfirm_at)
         VALUES ($1, $2, 'rider', true, now(), now() + interval '90 days')
         ON CONFLICT (phone) DO NOTHING`,
        [r.phone, r.name]
      );
      const uid = await client.query(`SELECT id FROM users WHERE phone = $1`, [r.phone]);
      if (!uid.rows.length) continue;
      await client.query(
        `INSERT INTO rider_profiles (user_id, national_id, license_number, plate_number, verification_status, verified_at)
         VALUES ($1, $2, $3, $4, 'verified', now())
         ON CONFLICT (user_id) DO NOTHING`,
        [uid.rows[0].id, r.national_id, r.license, r.plate]
      );
      // Verified riders get an active plan so the radar works immediately in dev.
      await client.query(
        `INSERT INTO subscriptions (rider_id, tier, claims_cap, status, starts_at, expires_at)
         VALUES ($1, 'isonga', 80, 'active', now(), now() + interval '7 days')
         ON CONFLICT DO NOTHING`,
        [uid.rows[0].id]
      );
    }

    const passengers = [
      { name: 'Diane Uwera', phone: '+250789222001' },
      { name: 'Patrick Niyonzima', phone: '+250789222002' },
      { name: 'Aline Mukamana', phone: '+250782222003' },
      { name: 'Samuel Habimana', phone: '+250783222004' },
      { name: 'Grace Ingabire', phone: '+250788222005' },
    ];

    let pi = 0;
    for (const p of passengers) {
      await client.query(
        `INSERT INTO users (phone, name, role, location_consent_granted, location_consent_at, consent_reconfirm_at)
         VALUES ($1, $2, 'passenger', true, now(), now() + interval '90 days')
         ON CONFLICT (phone) DO NOTHING`,
        [p.phone, p.name]
      );
      const uid = await client.query(`SELECT id FROM users WHERE phone = $1`, [p.phone]);
      if (!uid.rows.length) continue;
      const off = OFF[pi++ % OFF.length];
      // A handful of open (VISIBLE) requests so the rider radar has content.
      await client.query(
        `INSERT INTO ride_requests
           (passenger_id, status, pickup_geog, destination_note, first_visible_at,
            jitter_dlat, jitter_dlng, created_at, updated_at)
         VALUES ($1, 'VISIBLE',
                 ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
                 $4, now(),
                 0.0016, 0.0016, now() - interval '2 minutes', now())
         ON CONFLICT DO NOTHING`,
        [uid.rows[0].id, A.lng + off[1], A.lat + off[0], 'Kimihurura, near Foyer de Charité']
      );
    }

    // Dev OTP for any phone (allows instant login in dev): code 123456, 5 min
    await client.query(
      `INSERT INTO users (phone, name, role, otp_code_hash, otp_expires_at, otp_last_sent_at)
       VALUES ('+250788000000', 'Dev Tester', 'passenger', $1, now() + interval '5 minutes', now())
       ON CONFLICT (phone) DO UPDATE SET otp_code_hash = EXCLUDED.otp_code_hash,
                                         otp_expires_at = now() + interval '5 minutes'`,
      [hashCode('123456')]
    );

    await client.query('COMMIT');
    console.log('Seed complete. Dev OTP for any phone: request-otp returns devCode in development mode.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
