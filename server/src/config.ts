import 'dotenv/config';
import type { PoolConfig } from 'pg';

export const config = {
  port: Number(process.env.PORT || 4000),
  isDev: (process.env.NODE_ENV || 'development') !== 'production',
  databaseUrl:
    process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/motoconnect',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresDays: Number(process.env.JWT_EXPIRES_DAYS || 30),
  sweepIntervalMs: Number(process.env.SWEEP_INTERVAL_MS || 5000),
  paypack: {
    clientId: process.env.PAYPACK_CLIENT_ID || '',
    clientSecret: process.env.PAYPACK_CLIENT_SECRET || '',
    webhookSecret: process.env.PAYPACK_WEBHOOK_SECRET || '',
    webhookMode: process.env.PAYPACK_WEBHOOK_MODE || 'sandbox',
    webhookUrl: process.env.PAYPACK_WEBHOOK_URL || '',
  },
  admin: {
    /** §2.2 — the seed super_admin's login identifier. An email is an identifier, never a credential. */
    seedEmail: (process.env.ADMIN_SEED_EMAIL || 'byiringirinnocent8@gmail.com').toLowerCase(),
    /** §2.4 — the ops console lives on its own host and is never linked from the consumer app. */
    consoleUrl: process.env.ADMIN_CONSOLE_URL || 'http://localhost:3000/admin.html',
    /** Extra CORS origin for the ops console when it is served from its own subdomain. */
    origin: process.env.ADMIN_ORIGIN || '',
    setupTokenTtlMs: Number(process.env.ADMIN_SETUP_TOKEN_TTL_MS || 24 * 60 * 60 * 1000),
  },
  email: {
    /** §12 open question #3 — answered: Postmark. Server token, not an account token. */
    serverToken: process.env.POSTMARK_SERVER_TOKEN || '',
    /** Must be a verified Sender Signature, or on a verified domain, in Postmark. */
    from: process.env.EMAIL_FROM || 'MotoConnect Ops <ops@motoconnect.rw>',
    messageStream: process.env.POSTMARK_MESSAGE_STREAM || 'outbound',
  },
  uploads: {
    /** Where rider ID/licence/plate images are written. Never inside the web root. */
    dir: process.env.UPLOAD_DIR || 'uploads',
    /** Per-image ceiling after the client has already downscaled. */
    maxBytes: Number(process.env.UPLOAD_MAX_BYTES || 3 * 1024 * 1024),
  },
  /** Cloudflare R2 — the production default for rider document images. */
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || 'rider-documents',
    get enabled() {
      return !!(
        process.env.R2_ACCOUNT_ID &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY
      );
    },
  },
  /** Supabase Storage — kept as an alternative driver; R2 takes precedence. */
  supabase: {
    url: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    /** Server-only. Bypasses row-level security — never expose to a browser. */
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    bucket: process.env.SUPABASE_STORAGE_BUCKET || 'rider-documents',
    get storageEnabled() {
      return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    },
  },
  /** Comma-separated list of browser origins allowed to call the API. */
  webOrigins: (process.env.WEB_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean),
} as const;

/**
 * Supabase (and most managed Postgres) require TLS, and their certificates are
 * issued by an intermediate Node does not ship in its trust store. Verification
 * is therefore relaxed for those hosts — the connection is still encrypted, and
 * the connection string itself is the secret. A local database gets no TLS at
 * all, which is what `sslmode=disable`-style local setups expect.
 */
function sslConfig(): PoolConfig['ssl'] {
  if (process.env.DATABASE_SSL === 'false') return undefined;
  const url = config.databaseUrl;
  const isLocal = /@(localhost|127\.0\.0\.1|::1)[:/]/.test(url);
  if (isLocal && process.env.DATABASE_SSL !== 'true') return undefined;
  return { rejectUnauthorized: false };
}

export const dbConfig: PoolConfig = {
  connectionString: config.databaseUrl,
  // Supabase's free tier allows a modest number of direct connections, and this
  // process also runs the sweeper. Ten is comfortable for one instance; raise
  // it only alongside the pooler connection string.
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: sslConfig(),
};

export const TIER_DEFS = {
  agahozo: { price: 500, cap: 10, durationMs: 24 * 60 * 60 * 1000, label: 'Agahozo', period: 'day' },
  isonga: { price: 3000, cap: 80, durationMs: 7 * 24 * 60 * 60 * 1000, label: 'Isonga', period: 'week' },
  impuruza: { price: 10_000, cap: null, durationMs: 30 * 24 * 60 * 60 * 1000, label: 'Impuruza', period: 'month' },
} as const;

export type Tier = keyof typeof TIER_DEFS;

/** Claim window: exclusive 60 s, passenger must confirm within 30 s. */
export const CLAIM_WINDOW_MS = 60_000;
export const CONFIRM_WINDOW_MS = 30_000;
export const RIDER_CANCEL_SUSPENSION_MS = 24 * 60 * 60 * 1000;
export const NO_SHOW_WAIT_MS = 5 * 60 * 1000;
export const POOL_RADIUS_M = 10_000;
export const JITTER_MIN_M = 150;
export const JITTER_MAX_M = 200;
export const LOCATION_RETENTION_DAYS = 90;
export const CONSENT_RECONFIRM_DAYS = 90;

// ─── Ops console (admin spec) ────────────────────────────────────────────────
/** §2.3 — idle timeout, per role. Financial/verification power gets the short one. */
export const ADMIN_IDLE_TIMEOUT_MS: Record<'super_admin' | 'support' | 'finance_ops', number> = {
  super_admin: 30 * 60 * 1000,
  finance_ops: 30 * 60 * 1000,
  support: 2 * 60 * 60 * 1000,
};
/** §2.3 — no "remember me": every session dies at 12 h regardless of activity. */
export const ADMIN_SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
/** §2.3 — 2FA is mandatory for these roles, optional for support. */
export const ADMIN_MFA_REQUIRED_ROLES = ['super_admin', 'finance_ops'] as const;
/** Login throttling: lock the account after this many consecutive failures. */
export const ADMIN_MAX_FAILED_LOGINS = 5;
export const ADMIN_LOCKOUT_MS = 15 * 60 * 1000;
/** §4.1 — riders pending longer than this are flagged red in the queue. */
export const VERIFICATION_SLA_MS = 48 * 60 * 60 * 1000;
/** §5.2 — a rating at or below this auto-flags the ride for dispute review. */
export const DISPUTE_RATING_THRESHOLD = 2;
/** §5.1 — live-ops breadcrumb retention. Short by design; not a location archive. */
export const RIDE_TRACK_RETENTION_DAYS = 7;
/**
 * How long rider ID/licence/plate images are kept after a verification
 * decision. These are the most sensitive records the platform holds, so they
 * are purged on a timer rather than kept forever "just in case". Confirm the
 * figure against Rwandan data-protection guidance before going live.
 */
export const RIDER_DOCUMENT_RETENTION_DAYS = Number(process.env.RIDER_DOCUMENT_RETENTION_DAYS || 365);
/** Document kinds a rider is asked to submit. `selfie` is optional. */
export const RIDER_DOCUMENT_KINDS = ['national_id', 'license', 'plate', 'selfie'] as const;
/** Without these three there is nothing to verify a number against. */
export const REQUIRED_RIDER_DOCUMENT_KINDS = ['national_id', 'license', 'plate'] as const;
export const MIN_ADMIN_PASSWORD_LENGTH = 12;
