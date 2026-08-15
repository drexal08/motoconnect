import pg from 'pg';
import { dbConfig } from '../config.js';

/**
 * Single pool for the process, built from the one config object — including the
 * TLS settings a managed Postgres such as Supabase requires. Previously this
 * file rebuilt its own options and silently ignored `dbConfig`, so pool tuning
 * appeared to work while changing nothing.
 */
export const pool = new pg.Pool(dbConfig);

pool.on('error', (err) => {
  console.error('Unexpected idle client error:', err.message);
});
