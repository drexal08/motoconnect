/**
 * Rider verification documents (main PRD §4.2 gap, closed).
 *
 * Riders photograph their National ID, driving licence and plate at signup so
 * the ops console has something to check the typed numbers against. A number
 * on its own is unverifiable, which is the whole reason this exists.
 *
 * The rider owns their own documents and can replace them; they can never read
 * another rider's, and nothing here exposes the image bytes — that is an
 * admin-only route.
 */
import { pool } from '../db/pool.js';
import { errors } from '../lib/errors.js';
import { deleteStoredImage, storeDataUrlImage } from '../lib/uploads.js';
import {
  REQUIRED_RIDER_DOCUMENT_KINDS,
  RIDER_DOCUMENT_KINDS,
  RIDER_DOCUMENT_RETENTION_DAYS,
} from '../config.js';

export type DocumentKind = (typeof RIDER_DOCUMENT_KINDS)[number];

export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  national_id: 'National ID card',
  license: 'Driving licence',
  plate: 'Motorcycle plate',
  selfie: 'Photo of you',
};

function assertKind(kind: string): asserts kind is DocumentKind {
  if (!(RIDER_DOCUMENT_KINDS as readonly string[]).includes(kind)) {
    throw errors.badRequest('That is not a document we ask for.');
  }
}

/**
 * Saves one document, replacing any previous image of the same kind. The old
 * file is deleted from disk only after the row is updated, so a crash leaves an
 * orphaned file (harmless, swept later) rather than a row pointing at nothing.
 */
export async function saveRiderDocument(riderId: string, kind: string, dataUrl: string) {
  assertKind(kind);

  const profile = await pool.query(`SELECT verification_status FROM rider_profiles WHERE user_id = $1`, [riderId]);
  if (!profile.rows.length) {
    throw errors.badRequest('Submit your rider details before uploading documents.');
  }
  if (profile.rows[0].verification_status === 'verified') {
    throw errors.conflict('Your account is already verified. Contact support if a document needs changing.');
  }

  const stored = await storeDataUrlImage(dataUrl);

  const previous = await pool.query(
    `SELECT storage_url FROM rider_documents WHERE rider_id = $1 AND kind = $2`,
    [riderId, kind]
  );

  const { rows } = await pool.query(
    `INSERT INTO rider_documents (rider_id, kind, storage_url, mime_type, byte_size, checksum)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (rider_id, kind) DO UPDATE
       SET storage_url = EXCLUDED.storage_url,
           mime_type   = EXCLUDED.mime_type,
           byte_size   = EXCLUDED.byte_size,
           checksum    = EXCLUDED.checksum,
           uploaded_at = now()
     RETURNING id, kind, uploaded_at`,
    [riderId, kind, stored.storageKey, stored.mimeType, stored.byteSize, stored.checksum]
  );

  if (previous.rows.length && previous.rows[0].storage_url !== stored.storageKey) {
    await deleteStoredImage(previous.rows[0].storage_url);
  }

  return { id: rows[0].id as string, kind: rows[0].kind as DocumentKind, uploadedAt: rows[0].uploaded_at };
}

/** What the rider sees: which documents are on file, never the images themselves. */
export async function listRiderDocuments(riderId: string) {
  const { rows } = await pool.query(
    `SELECT kind, uploaded_at, byte_size FROM rider_documents WHERE rider_id = $1`,
    [riderId]
  );
  const present = new Set(rows.map((r) => r.kind as string));
  return {
    documents: rows.map((r) => ({
      kind: r.kind as DocumentKind,
      label: DOCUMENT_LABELS[r.kind as DocumentKind],
      uploadedAt: r.uploaded_at,
      byteSize: r.byte_size,
    })),
    required: REQUIRED_RIDER_DOCUMENT_KINDS.map((k) => ({
      kind: k,
      label: DOCUMENT_LABELS[k],
      uploaded: present.has(k),
    })),
    complete: REQUIRED_RIDER_DOCUMENT_KINDS.every((k) => present.has(k)),
  };
}

export async function deleteRiderDocument(riderId: string, kind: string) {
  assertKind(kind);
  const { rows } = await pool.query(
    `DELETE FROM rider_documents WHERE rider_id = $1 AND kind = $2 RETURNING storage_url`,
    [riderId, kind]
  );
  if (rows.length) await deleteStoredImage(rows[0].storage_url);
  return { deleted: rows.length > 0 };
}

/**
 * Retention purge (called by the sweeper). Images are deleted once a decision
 * has stood for the retention window; the decision itself, and the audit trail
 * behind it, are kept. Pending applications are never purged — the reviewer
 * still needs them.
 */
export async function purgeExpiredDocuments() {
  const { rows } = await pool.query(
    `DELETE FROM rider_documents d
     USING rider_profiles rp
     WHERE rp.user_id = d.rider_id
       AND rp.decided_at IS NOT NULL
       AND rp.decided_at < now() - ($1::int * interval '1 day')
     RETURNING d.storage_url`,
    [RIDER_DOCUMENT_RETENTION_DAYS]
  );
  for (const r of rows) await deleteStoredImage(r.storage_url);
  return rows.length;
}
