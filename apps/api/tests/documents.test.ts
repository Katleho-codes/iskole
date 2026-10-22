/**
 * Document upload and signed-download tests.
 *
 * These cover the part of the flow that cannot be faked with a URL: bytes go in, a row and
 * a file are created once, the magic-byte check rejects a mislabelled file, another
 * learner cannot upload to the application, and the download link is short-lived and
 * tamper-evident. Account deletion is checked down to the file on disk, because a database
 * cascade alone would leave the learner's ID copy behind.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { access, rm } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { env } from '../src/lib/env';
import { prisma } from '../src/lib/prisma';
import { storedDocumentPath } from '../src/lib/storage';
import { createTestUser } from './helpers';

const app = createApp();

const PDF = Buffer.from(
  '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
  'latin1',
);

type BinaryStream = {
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
};

const binaryParser = (
  response: BinaryStream,
  callback: (error: Error | null, body?: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  response.on('data', (...args) => chunks.push(Buffer.from(args[0] as Uint8Array)));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', (...args) => callback(args[0] as Error));
};

function idempotencyKey(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

async function makeApplication(cookie: string) {
  // Submitting requires a proven adult age. Set an adult date of birth before the draft is
  // created so the submit test exercises the guardian gate only where it intends to.
  const profile = await request(app)
    .put('/api/profile')
    .set('Cookie', cookie)
    .send({ dateOfBirth: '2000-01-01' });
  expect(profile.status).toBe(200);

  const institution = await prisma.institution.create({
    data: {
      name: `Documents Institution ${randomUUID()}`,
      province: 'GAUTENG',
      type: 'UNIVERSITY',
    },
  });
  const course = await prisma.course.create({
    data: {
      institutionId: institution.id,
      name: 'Diploma in Document Testing',
      field: 'BUSINESS',
      apsMin: 0,
    },
  });

  const created = await request(app)
    .post('/api/applications')
    .set('Cookie', cookie)
    .set('Idempotency-Key', idempotencyKey('doc-app'))
    .send({ courseId: course.id });

  expect(created.status).toBe(201);
  return created.body.application.id as string;
}

async function upload(
  cookie: string,
  applicationId: string,
  options: { body?: Buffer; contentType?: string; filename?: string; key?: string } = {},
) {
  return request(app)
    .post(`/api/applications/${applicationId}/documents`)
    .set('Cookie', cookie)
    .set('Content-Type', options.contentType ?? 'application/pdf')
    .set('X-Filename', options.filename ?? 'ID copy.pdf')
    .set('Idempotency-Key', options.key ?? idempotencyKey('doc'))
    .send(options.body ?? PDF);
}

afterAll(async () => {
  await rm(path.resolve(env.UPLOAD_DIR, 'documents'), { recursive: true, force: true });
});

describe('application documents', () => {
  it('stores a valid PDF once and replays the same idempotency key', async () => {
    const learner = await createTestUser();
    const cookie = learner.cookie ?? '';
    const applicationId = await makeApplication(cookie);
    const key = idempotencyKey('doc-replay');

    const first = await upload(cookie, applicationId, { key });
    expect(first.status).toBe(201);
    expect(first.body.document.mimeType).toBe('application/pdf');
    expect(first.body.document.filename).toBe('ID copy.pdf');
    expect(first.body.document.size).toBe(PDF.length);
    expect(first.body.document).not.toHaveProperty('key');

    const row = await prisma.document.findUnique({
      where: { id: first.body.document.id },
    });
    expect(row).not.toBeNull();
    const stored = await access(storedDocumentPath(row!.key)).then(
      () => true,
      () => false,
    );
    expect(stored).toBe(true);

    const replay = await upload(cookie, applicationId, { key });
    expect(replay.status).toBe(201);
    expect(replay.body.document.id).toBe(first.body.document.id);
    expect(await prisma.document.count({ where: { applicationId } })).toBe(1);
  });

  it('rejects a file whose bytes are not a PDF, JPEG or PNG', async () => {
    const learner = await createTestUser();
    const cookie = learner.cookie ?? '';
    const applicationId = await makeApplication(cookie);

    const res = await upload(cookie, applicationId, {
      body: Buffer.from('<html><script>alert(1)</script></html>'),
      contentType: 'application/pdf',
      filename: 'not-really.pdf',
    });

    expect(res.status).toBe(415);
    expect(await prisma.document.count({ where: { applicationId } })).toBe(0);
  });

  it('refuses an upload to someone else’s application', async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const applicationId = await makeApplication(owner.cookie ?? '');

    const res = await upload(other.cookie ?? '', applicationId);
    expect([403, 404]).toContain(res.status);
    expect(await prisma.document.count({ where: { applicationId } })).toBe(0);
  });

  it('does not allow documents after the application has been submitted', async () => {
    const learner = await createTestUser();
    const cookie = learner.cookie ?? '';
    const applicationId = await makeApplication(cookie);

    const submitted = await request(app)
      .post(`/api/applications/${applicationId}/submit`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', idempotencyKey('doc-submit'))
      .send({});
    expect(submitted.status).toBe(200);

    const res = await upload(cookie, applicationId);
    expect(res.status).toBe(422);
  });

  it('blocks uploads to a legacy draft until a date of birth is recorded', async () => {
    const learner = await createTestUser();
    const cookie = learner.cookie ?? '';
    const applicationId = await makeApplication(cookie);

    // A draft that predates the age gate can exist without a date of birth. Identity
    // documents must not be accepted for it, and the same key must work once the gate passes.
    await prisma.profile.update({
      where: { userId: learner.id },
      data: { dateOfBirth: null },
    });
    const key = idempotencyKey('doc-age-gate');

    const blocked = await upload(cookie, applicationId, { key });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toContain('date of birth');
    expect(await prisma.document.count({ where: { applicationId } })).toBe(0);

    await request(app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .send({ dateOfBirth: '2000-01-01' })
      .expect(200);

    const allowed = await upload(cookie, applicationId, { key });
    expect(allowed.status).toBe(201);
    expect(await prisma.document.count({ where: { applicationId } })).toBe(1);
  });

  it('issues a signed link that downloads the exact bytes, and rejects tampering or expiry', async () => {
    const learner = await createTestUser();
    const cookie = learner.cookie ?? '';
    const applicationId = await makeApplication(cookie);

    const uploaded = await upload(cookie, applicationId);
    expect(uploaded.status).toBe(201);
    const documentId = uploaded.body.document.id as string;

    const anonymous = await request(app).get(`/api/documents/${documentId}/url`);
    expect(anonymous.status).toBe(401);

    const link = await request(app)
      .get(`/api/documents/${documentId}/url`)
      .set('Cookie', cookie);
    expect(link.status).toBe(200);
    const url = link.body.download.url as string;

    const download = await request(app).get(url).buffer(true).parse(binaryParser);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('application/pdf');
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(Buffer.compare(download.body as Buffer, PDF)).toBe(0);

    // A signed link is a bearer credential: another learner cannot mint one for it, and a
    // changed signature is refused.
    const other = await createTestUser();
    const denied = await request(app)
      .get(`/api/documents/${documentId}/url`)
      .set('Cookie', other.cookie ?? '');
    expect(denied.status).toBe(403);

    const tampered = url.replace(/signature=(.)/, (_match, first: string) =>
      `signature=${first === '0' ? '1' : '0'}`,
    );
    expect((await request(app).get(tampered)).status).toBe(403);

    const expires = Math.floor(Date.now() / 1000) - 10;
    const signature = createHmac('sha256', env.SIGNING_SECRET)
      .update(`${documentId}.${expires}`)
      .digest('hex');
    const expired = await request(app).get(
      `/api/documents/${documentId}/download?expires=${expires}&signature=${signature}`,
    );
    expect(expired.status).toBe(403);
  });

  it('deletes the stored file when the learner closes their account', async () => {
    const learner = await createTestUser();
    const cookie = learner.cookie ?? '';
    const applicationId = await makeApplication(cookie);

    const uploaded = await upload(cookie, applicationId);
    expect(uploaded.status).toBe(201);

    const row = await prisma.document.findUnique({ where: { id: uploaded.body.document.id } });
    expect(row).not.toBeNull();
    const absolute = storedDocumentPath(row!.key);
    expect(await access(absolute).then(() => true, () => false)).toBe(true);

    const deleted = await request(app)
      .delete('/api/privacy/account')
      .set('Cookie', cookie)
      .send({ confirm: 'DELETE' });
    expect(deleted.status).toBe(204);

    expect(await access(absolute).then(() => true, () => false)).toBe(false);
    expect(await prisma.document.findUnique({ where: { id: row!.id } })).toBeNull();
  });
});
