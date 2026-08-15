/**
 * Object storage for rider verification documents.
 *
 * Two drivers behind one interface:
 *
 *   local     — writes to UPLOAD_DIR. Fine for development and for any host
 *               with a real persistent disk.
 *   supabase  — Supabase Storage. Required in production on a free host,
 *               because those filesystems are ephemeral: a redeploy or an idle
 *               spin-down would silently destroy every rider's ID photograph
 *               while leaving the database rows pointing at nothing.
 *
 * The bucket must be PRIVATE. Nothing here ever mints a public URL — the only
 * way to read an object is the authenticated admin route, which fetches the
 * bytes server-side using the service-role key and logs the access. If someone
 * later flips that bucket to public, every rider's National ID card becomes
 * world-readable to anyone who can guess a UUID.
 */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { errors } from './errors.js';
import { signRequest } from './sigv4.js';

export interface StorageDriver {
  readonly name: string;
  put(key: string, bytes: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  del(key: string): Promise<void>;
}

// ─── local disk ──────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(__dirname, '../..');
export const UPLOAD_ROOT = resolve(SERVER_ROOT, config.uploads.dir);

/** Resolves a key and returns it only if it lands inside the upload root. */
function insideUploadRoot(key: string): string | null {
  const full = resolve(UPLOAD_ROOT, key);
  return full.startsWith(UPLOAD_ROOT + sep) ? full : null;
}

const localDriver: StorageDriver = {
  name: 'local',
  async put(key, bytes) {
    await mkdir(UPLOAD_ROOT, { recursive: true });
    await writeFile(join(UPLOAD_ROOT, key), bytes, { mode: 0o600 });
  },
  async get(key) {
    const full = insideUploadRoot(key);
    if (!full) throw errors.notFound('That document was not found.');
    try {
      return await readFile(full);
    } catch {
      throw errors.notFound('That document file is missing from storage.');
    }
  },
  async del(key) {
    const full = insideUploadRoot(key);
    if (!full) return;
    await unlink(full).catch(() => {
      /* already gone — the database row is the thing that matters */
    });
  },
};

// ─── Supabase Storage ────────────────────────────────────────────────────────

/**
 * Plain REST against the Storage API — no SDK. The whole surface we need is
 * three verbs on one path, and a dependency that ships a browser client into a
 * server bundle is not worth it.
 */
function supabaseDriver(): StorageDriver {
  const base = `${config.supabase.url}/storage/v1/object`;
  const bucket = config.supabase.bucket;
  const headers = {
    // Service-role key: bypasses row-level security, so it must never reach
    // the browser. It is read from the server environment only.
    Authorization: `Bearer ${config.supabase.serviceRoleKey}`,
    apikey: config.supabase.serviceRoleKey,
  };

  return {
    name: 'supabase',
    async put(key, bytes, mimeType) {
      const res = await fetch(`${base}/${bucket}/${key}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': mimeType, 'x-upsert': 'true' },
        body: new Uint8Array(bytes),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Supabase Storage upload failed (${res.status}): ${detail}`);
      }
    },
    async get(key) {
      const res = await fetch(`${base}/${bucket}/${key}`, { headers });
      if (!res.ok) throw errors.notFound('That document file is missing from storage.');
      return Buffer.from(await res.arrayBuffer());
    },
    async del(key) {
      await fetch(`${base}/${bucket}/${key}`, { method: 'DELETE', headers }).catch(() => {
        /* best effort — an orphaned object is preferable to a failed decision */
      });
    },
  };
}

// ─── Cloudflare R2 ───────────────────────────────────────────────────────────

/**
 * The production default. R2's free tier is 10 GB with zero egress charges and
 * no expiry, and buckets are private unless you explicitly publish them — which
 * is the right default for photographs of national ID cards.
 *
 * Signed with the hand-rolled SigV4 in lib/sigv4.ts rather than the AWS SDK:
 * three verbs against one endpoint does not justify tens of megabytes of
 * dependency on a free host. The signer is cross-checked against AWS's own
 * reference implementation in the test suite.
 */
function r2Driver(): StorageDriver {
  const { accountId, accessKeyId, secretAccessKey, bucket } = config.r2;
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

  const request = async (method: string, key: string, body?: Buffer, contentType?: string) => {
    const url = `${endpoint}/${bucket}/${encodeURIComponent(key)}`;
    const headers = signRequest({
      method,
      url,
      // R2 has no regions; SigV4 still requires a value and R2 mandates "auto".
      region: 'auto',
      service: 's3',
      accessKeyId,
      secretAccessKey,
      body,
      headers: contentType ? { 'content-type': contentType } : undefined,
    });
    return fetch(url, {
      method,
      headers,
      body: body ? new Uint8Array(body) : undefined,
    });
  };

  return {
    name: 'r2',
    async put(key, bytes, mimeType) {
      const res = await request('PUT', key, bytes, mimeType);
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`R2 upload failed (${res.status}): ${detail.slice(0, 300)}`);
      }
    },
    async get(key) {
      const res = await request('GET', key);
      if (!res.ok) throw errors.notFound('That document file is missing from storage.');
      return Buffer.from(await res.arrayBuffer());
    },
    async del(key) {
      await request('DELETE', key).catch(() => {
        /* best effort — an orphaned object beats a failed verification decision */
      });
    },
  };
}

// ─── selection ───────────────────────────────────────────────────────────────

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (driver) return driver;
  if (config.r2.enabled) driver = r2Driver();
  else if (config.supabase.storageEnabled) driver = supabaseDriver();
  else driver = localDriver;
  return driver;
}

/**
 * Startup check. A misconfigured bucket must surface on boot, not the first
 * time a rider tries to upload their ID at the end of signup.
 */
export function describeStorage(): string {
  if (config.r2.enabled) return `Cloudflare R2 (bucket "${config.r2.bucket}")`;
  if (config.supabase.storageEnabled) return `Supabase Storage (bucket "${config.supabase.bucket}")`;
  return `local disk (${UPLOAD_ROOT})`;
}

/** True when documents survive a redeploy. False means an ephemeral filesystem. */
export function storageIsDurable(): boolean {
  return config.r2.enabled || config.supabase.storageEnabled;
}
