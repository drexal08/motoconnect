/**
 * PayPack client (paypack.rw) — MTN MoMo + Airtel Money through one gateway.
 * Same API pattern as the busbook project (auth/agents/authorize,
 * transactions/cashin, Idempotency-Key header, X-Webhook-Mode, HMAC webhooks).
 */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

const PAYPACK_API = 'https://payments.paypack.rw/api';

let cachedToken: string | null = null;
let tokenExpiry = 0;
const TOKEN_CACHE_MS = 5 * 60 * 1000;

export function isPaypackConfigured(): boolean {
  return Boolean(config.paypack.clientId && config.paypack.clientSecret);
}

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res = await fetch(`${PAYPACK_API}/auth/agents/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: config.paypack.clientId,
      client_secret: config.paypack.clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`Paypack auth failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access?: string };
  if (!data.access) throw new Error('Paypack did not return an access token');
  cachedToken = data.access;
  tokenExpiry = Date.now() + TOKEN_CACHE_MS;
  return cachedToken;
}

/**
 * Initiate a cashin request to the payer's phone. Returns the PayPack
 * transaction reference. Idempotency-Key must be exactly 32 chars.
 */
export async function initiateCashin(phone: string, amount: number): Promise<{ ref: string }> {
  const token = await getToken();
  const idempotencyKey = createHash('md5').update(randomUUID()).digest('hex');
  const res = await fetch(`${PAYPACK_API}/transactions/cashin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': idempotencyKey,
      'X-Webhook-Mode': config.paypack.webhookMode,
    },
    body: JSON.stringify({ number: phone, amount }),
  });
  if (!res.ok) throw new Error(`Paypack cashin failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { ref?: string; data?: { ref?: string } };
  const ref = data.ref || data.data?.ref;
  if (!ref) throw new Error('Paypack did not return a transaction reference');
  return { ref };
}

/** HMAC-SHA256 signature check for the webhook (header: x-paypack-signature). */
export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!config.paypack.webhookSecret || !signature) return false;
  const digest = createHash('sha256').update(rawBody).digest('base64');
  const expected = Buffer.from(digest, 'base64');
  const received = Buffer.from(signature, 'base64');
  return expected.length === received.length && timingSafeEqual(expected, received);
}
