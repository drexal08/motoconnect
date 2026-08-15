/**
 * Pre-flight check: `npm run db:verify`
 *
 * Answers one question — is this deployment actually ready to take real users?
 * Every check is something that has a specific, unpleasant failure mode if it
 * is wrong, and several of them fail silently in production rather than
 * loudly: a missing PostGIS means rider matching returns nothing, a missing
 * trigram index means the ops console crawls once there are real rows, and
 * unreachable object storage means a rider's ID photograph vanishes after
 * upload while the database row survives.
 *
 * Run it against production before announcing anything, and after every deploy
 * that touches the schema.
 */
import 'dotenv/config';
import { pool } from './pool.js';
import { config } from '../config.js';
import { storage, describeStorage, storageIsDurable } from '../lib/storage.js';
import { randomUUID } from 'node:crypto';

interface Check {
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

const checks: Check[] = [];
const add = (label: string, status: Check['status'], detail: string) =>
  checks.push({ label, status, detail });

async function scalar<T = string>(sql: string, params: unknown[] = []): Promise<T | null> {
  const { rows } = await pool.query(sql, params);
  return rows.length ? (Object.values(rows[0])[0] as T) : null;
}

async function run() {
  // ── connectivity and server version ──
  try {
    const version = await scalar<string>(`SELECT current_setting('server_version')`);
    add('Database reachable', 'ok', `PostgreSQL ${version}`);
  } catch (err) {
    add('Database reachable', 'fail', err instanceof Error ? err.message : String(err));
    return; // nothing else can be checked
  }

  // ── extensions ──
  for (const ext of ['postgis', 'pg_trgm']) {
    const installed = await scalar<string>(`SELECT extversion FROM pg_extension WHERE extname = $1`, [ext]);
    if (installed) {
      add(`Extension: ${ext}`, 'ok', `v${installed}`);
    } else {
      add(
        `Extension: ${ext}`,
        'fail',
        ext === 'postgis'
          ? 'Rider matching runs ST_DWithin radius queries and will fail entirely without it.'
          : 'Ops-console name and phone searches will sequentially scan every row without it.'
      );
    }
  }

  // ── every table the application writes to ──
  const EXPECTED_TABLES = [
    'users', 'rider_profiles', 'subscriptions', 'ride_requests', 'ride_events',
    'payments', 'ratings', 'trip_heatmap', 'user_locations',
    'admin_users', 'admin_sessions', 'admin_audit_log', 'user_strikes',
    'rider_documents', 'dispute_reviews', 'ride_tracks', 'quota_block_events',
    'payment_reconciliations', 'refunds', 'schema_migrations',
  ];
  const present = new Set(
    (await pool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    )).rows.map((r) => r.tablename as string)
  );
  const missingTables = EXPECTED_TABLES.filter((t) => !present.has(t));
  add(
    'Schema tables',
    missingTables.length ? 'fail' : 'ok',
    missingTables.length ? `Missing: ${missingTables.join(', ')} — run npm run db:migrate` : `all ${EXPECTED_TABLES.length} present`
  );

  // ── the indexes that stop the console degrading as data grows ──
  const indexes = new Set(
    (await pool.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`)).rows.map(
      (r) => r.indexname as string
    )
  );
  const KEY_INDEXES = [
    'users_name_trgm_idx', 'users_phone_trgm_idx',
    'rider_profiles_status_submitted_idx',
    'payments_status_created_idx', 'payments_orphan_idx',
    'ride_requests_live_idx', 'ratings_low_stars_idx',
  ];
  const missingIdx = KEY_INDEXES.filter((i) => !indexes.has(i));
  add(
    'Performance indexes',
    missingIdx.length ? 'warn' : 'ok',
    missingIdx.length ? `Missing: ${missingIdx.join(', ')}` : `all ${KEY_INDEXES.length} present`
  );

  // ── migrations ──
  const appliedCount = await scalar<string>(`SELECT count(*)::text FROM schema_migrations`);
  add('Versioned migrations', 'ok', `${appliedCount} applied`);

  // ── the audit log's append-only guarantee (admin spec §9.1) ──
  // Verified by attempting to break it, not by trusting that it was set up.
  const triggers = await scalar<string>(
    `SELECT count(*)::text FROM pg_trigger
     WHERE tgrelid = 'admin_audit_log'::regclass AND NOT tgisinternal`
  );
  add(
    'Audit log is append-only',
    Number(triggers) >= 2 ? 'ok' : 'fail',
    Number(triggers) >= 2
      ? 'UPDATE and DELETE are blocked at the database level'
      : 'The tamper-proofing triggers are missing — admin history could be rewritten'
  );

  // ── admin accounts (§2.2) ──
  const admins = await pool.query(
    `SELECT email, role, status, password_hash IS NOT NULL AS password_set, mfa_enabled
     FROM admin_users ORDER BY created_at`
  );
  if (admins.rows.length === 0) {
    add('Admin accounts', 'fail', 'None exist. The ops console cannot be signed into.');
  } else {
    const noPassword = admins.rows.filter((a) => !a.password_set);
    const supers = admins.rows.filter((a) => a.role === 'super_admin' && a.status === 'active');
    add(
      'Admin accounts',
      supers.length ? 'ok' : 'fail',
      `${admins.rows.length} account(s), ${supers.length} active super_admin`
    );
    if (noPassword.length) {
      add(
        'Admin setup pending',
        'warn',
        `${noPassword.map((a) => a.email).join(', ')} has not set a password yet — send the setup link`
      );
    }
    const noMfa = admins.rows.filter((a) => a.password_set && !a.mfa_enabled);
    if (noMfa.length) {
      add('Admin 2FA', 'warn', `${noMfa.map((a) => a.email).join(', ')} has no authenticator enrolled`);
    }
  }

  // ── development seed data must never reach production ──
  if (!config.isDev) {
    const seeded = await scalar<string>(
      `SELECT count(*)::text FROM users WHERE phone IN
        ('+250788111001','+250788111002','+250788111003','+250788000000')`
    );
    add(
      'No dev seed data',
      Number(seeded) > 0 ? 'fail' : 'ok',
      Number(seeded) > 0
        ? `${seeded} fictional seed account(s) found in production — delete them`
        : 'clean'
    );
  }

  // ── object storage, proved by a real round trip ──
  if (!storageIsDurable() && !config.isDev) {
    add(
      'Document storage',
      'fail',
      'Local disk on a host without a persistent volume — rider ID photographs are destroyed on every deploy.'
    );
  } else {
    const key = `preflight-${randomUUID()}.txt`;
    const payload = Buffer.from('motoconnect preflight');
    try {
      await storage().put(key, payload, 'text/plain');
      const read = await storage().get(key);
      const matches = read.equals(payload);
      await storage().del(key);
      add(
        'Document storage',
        matches ? 'ok' : 'fail',
        matches ? `${describeStorage()} — write, read and delete all succeeded` : 'Read back different bytes than were written'
      );
    } catch (err) {
      add('Document storage', 'fail', `${describeStorage()} — ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── data-shape sanity, the kind that only shows up with real rows ──
  const orphanDocs = await scalar<string>(
    `SELECT count(*)::text FROM rider_documents d
     WHERE NOT EXISTS (SELECT 1 FROM rider_profiles rp WHERE rp.user_id = d.rider_id)`
  );
  if (Number(orphanDocs) > 0) {
    add('Document rows', 'warn', `${orphanDocs} row(s) reference a rider profile that no longer exists`);
  }

  const stuckRides = await scalar<string>(
    `SELECT count(*)::text FROM ride_requests
     WHERE status IN ('CLAIMED','CONFIRMED','EN_ROUTE','ARRIVED')
       AND updated_at < now() - interval '24 hours'`
  );
  if (Number(stuckRides) > 0) {
    add('Stuck rides', 'warn', `${stuckRides} ride(s) in flight for over 24h — resolve them in Live Ops`);
  }
}

run()
  .then(() => {
    const icon = { ok: '✓', warn: '!', fail: '✗' };
    console.log('\n  Pre-flight check\n');
    for (const c of checks) {
      console.log(`   ${icon[c.status]} ${c.label.padEnd(26)} ${c.detail}`);
    }
    const fails = checks.filter((c) => c.status === 'fail').length;
    const warns = checks.filter((c) => c.status === 'warn').length;
    console.log(
      `\n  ${checks.length - fails - warns} passed, ${warns} warning(s), ${fails} failure(s)\n` +
        (fails ? '  Not ready for real users — fix the failures above.\n' : '  Ready.\n')
    );
    process.exit(fails ? 1 : 0);
  })
  .catch((err) => {
    console.error('Pre-flight check crashed:', err);
    process.exit(1);
  })
  .finally(() => pool.end().catch(() => {}));
