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
} as const;

export const dbConfig: PoolConfig = {
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
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
