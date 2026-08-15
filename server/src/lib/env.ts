/**
 * Startup environment check.
 *
 * The point is to fail on boot with a readable list, rather than at 2am when a
 * rider hits the one code path that needed the variable nobody set. In
 * production a missing secret is fatal; in development it is a warning, so the
 * app still runs on a laptop with almost nothing configured.
 *
 * The defaults this catches are the dangerous kind: a JWT secret of
 * "dev-only-secret-change-me" in production means anyone who has read this
 * repository can mint a valid session for any user.
 */
import { config } from '../config.js';
import { describeStorage, storageIsDurable } from './storage.js';

interface Finding {
  level: 'fatal' | 'warn';
  message: string;
}

export function checkEnvironment(): { findings: Finding[]; fatal: boolean } {
  const prod = !config.isDev;
  const findings: Finding[] = [];

  const require = (ok: boolean, message: string, warnInDev = true) => {
    if (ok) return;
    if (prod) findings.push({ level: 'fatal', message });
    else if (warnInDev) findings.push({ level: 'warn', message });
  };

  // ── secrets that must never keep their development values ──
  require(
    config.jwtSecret !== 'dev-only-secret-change-me',
    'JWT_SECRET is still the development default. Anyone with this repository could forge a session. Generate one with: openssl rand -base64 48'
  );
  require(
    config.jwtSecret.length >= 32,
    'JWT_SECRET is shorter than 32 characters. Use a long random string.'
  );
  require(!!process.env.DATABASE_URL, 'DATABASE_URL is not set.');

  // ── ops console ──
  require(
    !!config.email.serverToken,
    'POSTMARK_SERVER_TOKEN is not set — admin setup links cannot be delivered, so a new admin could never sign in. The link is printed to this log instead.'
  );
  require(
    config.admin.consoleUrl.startsWith('https://'),
    'ADMIN_CONSOLE_URL is not an https:// address. Setup links would point somewhere unusable.'
  );
  require(
    config.webOrigins.length > 0,
    'WEB_ORIGINS is not set. The API will reflect any browser origin instead of only your own front ends.'
  );

  // ── rider documents ──
  // Ephemeral filesystems are the norm on free hosting, and losing these files
  // is silent: the database rows survive and point at nothing.
  require(
    storageIsDurable(),
    'No object storage is configured (set R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY), so rider ID photographs are written to local disk. On a host without a persistent volume they are destroyed on every redeploy.'
  );

  // ── things that are merely worth knowing ──
  if (prod && !config.paypack.clientId) {
    findings.push({
      level: 'warn',
      message: 'PayPack is not configured — subscription payments run in TEST mode and no real money moves.',
    });
  }
  if (prod && process.env.SMS_PROVIDER !== 'none' && !process.env.SMS_PROVIDER) {
    findings.push({ level: 'warn', message: 'SMS_PROVIDER is unset.' });
  }

  return { findings, fatal: findings.some((f) => f.level === 'fatal') };
}

/** Prints the result and returns whether boot should continue. */
export function reportEnvironment(): boolean {
  const { findings, fatal } = checkEnvironment();

  if (findings.length) {
    const label = fatal ? 'CONFIGURATION ERRORS' : 'Configuration warnings';
    console.log(`\n  ${label}:`);
    for (const f of findings) {
      console.log(`   ${f.level === 'fatal' ? '✗' : '!'} ${f.message}`);
    }
    console.log('');
  }

  if (fatal) {
    console.error('  Refusing to start in production with the errors above.\n');
    return false;
  }

  console.log(`  Documents: ${describeStorage()}`);
  return true;
}

/**
 * The one gap that no amount of configuration closes today: there is no SMS
 * gateway, so the phone codes that gate the consumer app go to this log and
 * nowhere else. Stated on every production boot, because a silent version of
 * this means passengers simply cannot sign in and nobody knows why.
 */
export function warnAboutSmsGateway() {
  if (config.isDev) return;
  console.log(
    '\n  ────────────────────────────────────────────────────────────────\n' +
      '  NO SMS GATEWAY IS CONFIGURED.\n' +
      '  Phone verification codes are written to this log and are not sent\n' +
      '  to anyone. Passengers and riders cannot sign in until an SMS\n' +
      '  provider is wired up in server/src/services/smsService.ts.\n' +
      '  The ops console is unaffected — it uses email.\n' +
      '  ────────────────────────────────────────────────────────────────\n'
  );
}
