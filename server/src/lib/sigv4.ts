/**
 * AWS Signature Version 4 signing, for S3-compatible object storage.
 *
 * Written by hand rather than pulling in @aws-sdk/client-s3, which is tens of
 * megabytes for what is ultimately three HTTP verbs against one endpoint. The
 * algorithm is fully specified and deterministic, so the trade is a hundred
 * lines of well-understood crypto against a very large dependency on a free
 * host with a small build allowance.
 *
 * Correctness is not taken on trust: the implementation is cross-checked
 * against AWS's own published worked example, whose expected signature is a
 * fixed value in the test suite.
 *
 * Reference: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv4-signing-elements.html
 */
import { createHash, createHmac } from 'node:crypto';

const ALGORITHM = 'AWS4-HMAC-SHA256';

export interface SigV4Input {
  method: string;
  /** Absolute URL, including any query string. */
  url: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Raw body bytes. Empty for GET/DELETE. */
  body?: Buffer;
  /** Extra headers to sign (e.g. content-type). Host and the x-amz-* set are added here. */
  headers?: Record<string, string>;
  /** Injectable so tests can pin the timestamp; defaults to now. */
  date?: Date;
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/** RFC 3986 encoding. Notably, AWS requires the tilde to stay unescaped. */
function uriEncode(value: string, encodeSlash: boolean): string {
  let out = '';
  for (const ch of value) {
    const isUnreserved =
      (ch >= 'A' && ch <= 'Z') ||
      (ch >= 'a' && ch <= 'z') ||
      (ch >= '0' && ch <= '9') ||
      ch === '_' ||
      ch === '-' ||
      ch === '~' ||
      ch === '.';
    if (isUnreserved) {
      out += ch;
    } else if (ch === '/') {
      out += encodeSlash ? '%2F' : '/';
    } else {
      for (const byte of Buffer.from(ch, 'utf8')) {
        out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
      }
    }
  }
  return out;
}

/** `20260815T193000Z` and `20260815`. */
function stamps(date: Date): { amzDate: string; dateStamp: string } {
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/**
 * Returns the headers to send with the request, including Authorization.
 * The caller sends them verbatim — every signed header must go on the wire
 * exactly as it was signed, or the service rejects the request.
 */
export function signRequest(input: SigV4Input): Record<string, string> {
  const url = new URL(input.url);
  const body = input.body ?? Buffer.alloc(0);
  const { amzDate, dateStamp } = stamps(input.date ?? new Date());
  const payloadHash = sha256Hex(body);

  // ── headers ──
  const headers: Record<string, string> = {
    ...(input.headers ?? {}),
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };

  // Canonical headers are lower-cased, trimmed, and sorted by name.
  const canonicalEntries = Object.entries(headers)
    .map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const canonicalHeaders = canonicalEntries.map(([k, v]) => `${k}:${v}\n`).join('');
  const signedHeaders = canonicalEntries.map(([k]) => k).join(';');

  // ── canonical request ──
  // S3 signs the path EXACTLY as it appears on the wire, already percent-encoded
  // by the URL parser. Re-encoding here would turn a key containing a space
  // into %2520 and every signature for it would be rejected. (This is what the
  // AWS SDK calls `uriEscapePath: false`, and S3 is the service that needs it.)
  const canonicalUri = url.pathname === '' ? '/' : url.pathname;

  // Query parameters sort by encoded name, then encoded value.
  const canonicalQuery = [...url.searchParams.entries()]
    .map(([k, v]) => [uriEncode(k, true), uriEncode(v, true)] as const)
    .sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  // ── string to sign ──
  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  // ── signing key: a four-step HMAC chain rooted in the secret ──
  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  return {
    ...headers,
    Authorization:
      `${ALGORITHM} Credential=${input.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
