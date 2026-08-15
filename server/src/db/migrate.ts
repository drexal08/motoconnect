/**
 * Database migration runner.
 *
 * Three stages, in order:
 *
 *   1. schema.sql        — the base schema. Not written to be re-runnable, so it
 *                          is applied only when the database is still empty.
 *   2. admin_schema.sql  — the ops-console schema. Idempotent by construction,
 *                          so it is re-applied every time and picks up new
 *                          columns without ceremony.
 *   3. migrations/*.sql  — numbered, applied once each, recorded in
 *                          `schema_migrations`.
 *
 * Stage 3 exists because stages 1 and 2 do not scale as a way of working. An
 * ever-growing idempotent file is fine for adding a nullable column and awful
 * for anything that has to happen exactly once — a backfill, a data repair, a
 * constraint change. Every schema change from here on belongs in a numbered
 * file, and each runs inside its own transaction so a failure leaves nothing
 * half-applied.
 */
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
/** Ops-console tables (admin spec §2/§9). Written to be idempotent — always re-applied. */
const adminSql = readFileSync(join(__dirname, 'admin_schema.sql'), 'utf8');

/** Mirrors dbConfig's rule without importing the whole config module. */
function sslConfig() {
  const url = process.env.DATABASE_URL ?? '';
  if (process.env.DATABASE_SSL === 'false') return undefined;
  const isLocal = /@(localhost|127\.0\.0\.1|::1)[:/]/.test(url);
  if (isLocal && process.env.DATABASE_SSL !== 'true') return undefined;
  return { rejectUnauthorized: false };
}

/** Numbered migrations, in filename order. `001_x.sql` sorts before `010_y.sql`. */
function versionedMigrations(): { name: string; body: string }[] {
  const dir = join(__dirname, 'migrations');
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    return []; // no migrations directory yet
  }
  return files.map((name) => ({ name, body: readFileSync(join(dir, name), 'utf8') }));
}

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy server/.env.example to server/.env and set it.');
    process.exit(1);
  }
  // Same TLS handling as the runtime pool: a managed Postgres (Neon and
  // friends) refuses plaintext connections, so a migration without this fails
  // on the first deploy while working perfectly against a local database.
  const client = new pg.Client({ connectionString: url, ssl: sslConfig() });
  await client.connect();
  const dbName = new URL(url).pathname.replace('/', '') || 'postgres';
  console.log(`Migrating database "${dbName}" …`);

  try {
    // ── 1. base schema, only on an empty database ──
    const exists = await client.query(`SELECT to_regclass('public.users') AS t`);
    if (exists.rows[0].t) {
      console.log('  Base schema already present — skipping schema.sql.');
    } else {
      // postgis may need superuser rights to install in some setups; try the
      // schema file first and surface the exact error if it fails.
      await client.query(sql);
      console.log('  Schema applied (PostGIS + all tables + indexes + triggers).');
    }

    // ── 2. ops-console schema, idempotent ──
    await client.query(adminSql);
    console.log('  Ops-console schema applied (admin_users, admin_sessions, admin_audit_log, finance + moderation tables).');

    // ── 3. numbered migrations, exactly once each ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name        text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    const applied = new Set(
      (await client.query(`SELECT name FROM schema_migrations`)).rows.map((r) => r.name as string)
    );

    const pending = versionedMigrations().filter((m) => !applied.has(m.name));
    if (pending.length === 0) {
      console.log('  No pending migrations.');
    }
    for (const m of pending) {
      // Each migration commits or rolls back on its own, so a later failure
      // never leaves an earlier one half-applied.
      await client.query('BEGIN');
      try {
        await client.query(m.body);
        await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [m.name]);
        await client.query('COMMIT');
        console.log(`  Applied ${m.name}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`\nMigration ${m.name} failed and was rolled back:`);
        throw err;
      }
    }

    console.log('Migration complete.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/extension "postgis"/i.test(msg)) {
      console.error(
        '\nPostGIS is not installed in this PostgreSQL server.\n' +
          '  Neon:     run  CREATE EXTENSION IF NOT EXISTS postgis;  in the SQL editor first.\n' +
          '  Windows:  run the PostGIS bundle installer (https://download.osgeo.org/postgis/windows/).\n' +
          '  Docker:   docker run -d --name mc-postgis -e POSTGRES_PASSWORD=... -p 5432:5432 postgis/postgis\n'
      );
    } else if (/database ".*" does not exist/i.test(msg)) {
      console.error(`\nDatabase "${dbName}" does not exist. Create it first:\n  CREATE DATABASE ${dbName};`);
    } else {
      console.error('\nMigration failed:', msg);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
