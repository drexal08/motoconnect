import { randomInt, scryptSync, timingSafeEqual } from 'node:crypto';

const SALT = 'motoconnect-otp';
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function generateOtp(): string {
  return String(randomInt(100_000, 1_000_000));
}

export function hashOtp(code: string): string {
  return scryptSync(code, SALT, 32).toString('hex');
}

export function verifyOtp(code: string, storedHash: string): boolean {
  const a = Buffer.from(hashOtp(code), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export { OTP_TTL_MS, MAX_ATTEMPTS };
