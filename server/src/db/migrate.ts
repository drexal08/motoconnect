import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy server/.env.example to server/.env and set it.');
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const dbName = new URL(url).pathname.replace('/', '');
  console.log(`Migrating database "${dbName}" …`);

  try {
    // postgis may need superuser rights to install in some setups; try the
    // schema file first and surface the exact error if it fails.
    await client.query(sql);
    console.log('Schema applied (PostGIS + all tables + indexes + triggers).');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/extension "postgis"/i.test(msg)) {
      console.error(
        '\nPostGIS is not installed in this PostgreSQL server.\n' +
          'On Windows: run the PostGIS bundle installer (https://download.osgeo.org/postgis/windows/) for your PostgreSQL version,\n' +
          'or run: docker run -d --name mc-postgis -e POSTGRES_PASSWORD=... -p 5432:5432 postgis/postgis\n'
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
