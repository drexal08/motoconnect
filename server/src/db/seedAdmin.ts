/**
 * Ops-console admin bootstrap / recovery (admin spec §2.2).
 *
 *   npm run db:seed:admin          create the seed super_admin if none exists
 *   npm run db:seed:admin -- --resend   issue a fresh setup link for it
 *
 * The server also calls ensureSeedAdmin() on boot, so this script exists mainly
 * for the recovery case: the setup link expired, or the email never arrived.
 *
 * It never sets a password. Not on first run, not on --resend, not ever. The
 * only way into an admin account is a link its holder uses to choose their own.
 */
import 'dotenv/config';
import { pool } from './pool.js';
import { config } from '../config.js';
import { ensureSeedAdmin } from '../services/admin/adminAccountService.js';
import { issueSetupToken } from '../services/admin/adminAuthService.js';

async function main() {
  const resend = process.argv.includes('--resend');

  const created = await ensureSeedAdmin();
  if (created.created) {
    console.log('\nSeed super_admin created. Follow the setup link above to set a password.\n');
    return;
  }

  if (!resend) {
    const { rows } = await pool.query(
      `SELECT email, role, status, password_hash IS NOT NULL AS password_set, last_login_at
       FROM admin_users ORDER BY created_at ASC`
    );
    console.log('\nAdmin accounts already exist — nothing to seed.\n');
    for (const r of rows) {
      console.log(
        `  ${r.email}  [${r.role}]  ${r.status}  ` +
          `${r.password_set ? 'password set' : 'AWAITING SETUP'}  ` +
          `${r.last_login_at ? `last login ${new Date(r.last_login_at).toISOString()}` : 'never signed in'}`
      );
    }
    console.log('\nRun with --resend to issue a fresh setup link for the seed account.\n');
    return;
  }

  const { rows } = await pool.query(`SELECT id FROM admin_users WHERE email = $1`, [config.admin.seedEmail]);
  if (!rows.length) {
    console.error(`No admin account with email ${config.admin.seedEmail}.`);
    process.exitCode = 1;
    return;
  }

  const { delivery, expiresAt, link } = await issueSetupToken(rows[0].id);
  console.log(
    `\nNew setup link issued for ${config.admin.seedEmail}, valid until ${expiresAt.toUTCString()}.\n` +
      (delivery.delivered
        ? `Emailed via ${delivery.channel}.\n`
        : `NOT EMAILED (${delivery.detail}). Use this link:\n${link}\n`)
  );
}

main()
  .catch((err) => {
    console.error('Admin seed failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
