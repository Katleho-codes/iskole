/**
 * Local document storage and short-lived download links.
 *
 * Security rules this module exists to enforce:
 * - Files are written outside the web root and are never served by a static handler.
 * - The file type is decided from magic bytes, not from the Content-Type the client sent.
 *   An uploaded HTML or SVG renamed to .pdf must not become a stored XSS vector.
 * - Names are sanitised, and the storage key is generated server-side. A caller can never
 *   choose a path, so there is no traversal and no overwrite.
 * - A download link is an HMAC over (document id, expiry) with SIGNING_SECRET. It works
 *   without a session for a few minutes, like a presigned object-store URL, and stops
 *   working after that. Issuing the link still requires an ownership check in the route.
 * - The resolved path is checked against the storage root again at read time. A corrupted
 *   or tampered database row therefore cannot read arbitrary files.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from './env';

/** Matches the express.raw limit on the upload route. */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

/** How long a download link stays valid. Long enough to click, short enough to leak safely. */
export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type DocumentType = {
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  extension: 'pdf' | 'jpg' | 'png';
};

/** Detect PDF, JPEG or PNG from the first bytes. Returns null for anything else. */
export function detectDocumentType(buffer: Buffer): DocumentType | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { mimeType: 'application/pdf', extension: 'pdf' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }
  if (buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return { mimeType: 'image/png', extension: 'png' };
  }
  return null;
}

/**
 * Keep a short, printable label for the learner. This is display metadata only; the file
 * path comes from the generated key. It deliberately drops directory separators, control
 * characters and quotes so it is safe in a Content-Disposition header.
 */
export function safeDocumentName(input: string | undefined, extension: string): string {
  const leaf = (input ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = leaf
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

  if (!cleaned) return `document.${extension}`;
  return cleaned.toLowerCase().endsWith(`.${extension}`) ? cleaned : `${cleaned}.${extension}`;
}

function documentRoot(): string {
  return path.resolve(env.UPLOAD_DIR, 'documents');
}

/** Write bytes under a server-generated key. Returns the key stored in the database. */
export async function storeDocument(
  buffer: Buffer,
  userId: string,
  extension: DocumentType['extension'],
): Promise<string> {
  const directory = path.join(documentRoot(), userId);
  await mkdir(directory, { recursive: true, mode: 0o700 });

  const key = path.posix.join(userId, `${randomUUID()}.${extension}`);
  const absolute = storedDocumentPath(key);
  // wx refuses to overwrite an existing file, so a collision cannot replace someone's work.
  await writeFile(absolute, buffer, { flag: 'wx', mode: 0o600 });
  return key;
}

/** Resolve a stored key, refusing anything that escapes the document root. */
export function storedDocumentPath(key: string): string {
  const root = documentRoot();
  const resolved = path.resolve(root, key);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error('invalid document storage key');
  }
  return resolved;
}

/** Best-effort removal. A missing file is not an error during account deletion. */
export async function removeStoredDocument(key: string): Promise<void> {
  try {
    await unlink(storedDocumentPath(key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export type SignedDownload = { url: string; expiresAt: string };

function signatureFor(documentId: string, expires: number): string {
  return createHmac('sha256', env.SIGNING_SECRET).update(`${documentId}.${expires}`).digest('hex');
}

/** Build a relative URL: the web app proxies /api to the API, so the browser can follow it. */
export function createDownloadUrl(documentId: string, ttlSeconds = DOWNLOAD_URL_TTL_SECONDS): SignedDownload {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = signatureFor(documentId, expires);
  return {
    url: `/api/documents/${encodeURIComponent(documentId)}/download?expires=${expires}&signature=${signature}`,
    expiresAt: new Date(expires * 1000).toISOString(),
  };
}

/**
 * Check a signed download request. The upper bound stops a caller from extending a link
 * indefinitely even if they somehow obtained a valid signature for a distant date.
 */
export function verifyDownloadSignature(
  documentId: string,
  expiresRaw: unknown,
  signatureRaw: unknown,
): boolean {
  const expires = typeof expiresRaw === 'string' ? Number(expiresRaw) : Number.NaN;
  if (!Number.isInteger(expires)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (expires < now || expires > now + DOWNLOAD_URL_TTL_SECONDS + 60) return false;
  if (typeof signatureRaw !== 'string') return false;

  const expected = Buffer.from(signatureFor(documentId, expires), 'hex');
  const provided = Buffer.from(signatureRaw, 'hex');
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
