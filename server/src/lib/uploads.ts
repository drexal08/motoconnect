/**
 * Validation and naming for rider verification documents.
 *
 * Where the bytes actually land is `lib/storage.ts` — this file decides whether
 * they are allowed to land at all.
 *
 *  • Names are random UUIDs, never derived from the rider, the National ID or
 *    the original filename, so a listing leaks nothing.
 *  • The bytes are sniffed for a real JPEG/PNG/WebP magic number. A declared
 *    MIME type is a claim by the client, not evidence.
 *  • Uploads arrive as data URLs rather than multipart: the client downscales
 *    before sending (riders pay for their own mobile data), which keeps
 *    payloads small enough that no multipart dependency is needed.
 */
import { createHash, randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { errors } from './errors.js';
import { storage } from './storage.js';

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

/** Magic numbers. A Content-Type header is a claim; these are evidence. */
function sniffImage(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export interface StoredImage {
  /** Opaque key. Never a URL, and never round-tripped anywhere public. */
  storageKey: string;
  mimeType: string;
  byteSize: number;
  checksum: string;
}

export async function storeDataUrlImage(dataUrl: string): Promise<StoredImage> {
  const match = DATA_URL.exec(dataUrl.trim());
  if (!match) {
    throw errors.badRequest('That photo could not be read. Take it again with your camera.');
  }

  const buf = Buffer.from(match[2], 'base64');
  if (buf.length === 0) throw errors.badRequest('That photo is empty. Take it again.');
  if (buf.length > config.uploads.maxBytes) {
    throw errors.badRequest('That photo is too large. Try taking it again in better light.');
  }

  const sniffed = sniffImage(buf);
  if (!sniffed) {
    throw errors.badRequest('That file is not a photo. Upload a picture of the document.');
  }

  const ext = sniffed === 'image/jpeg' ? 'jpg' : sniffed === 'image/png' ? 'png' : 'webp';
  const storageKey = `${randomUUID()}.${ext}`;
  await storage().put(storageKey, buf, sniffed);

  return {
    storageKey,
    mimeType: sniffed,
    byteSize: buf.length,
    checksum: createHash('sha256').update(buf).digest('hex'),
  };
}

export async function readStoredImage(storageKey: string): Promise<Buffer> {
  return storage().get(storageKey);
}

export async function deleteStoredImage(storageKey: string): Promise<void> {
  await storage().del(storageKey);
}

export { UPLOAD_ROOT } from './storage.js';
