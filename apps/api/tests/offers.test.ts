/**
 * M3 offer lifecycle API tests.
 *
 * These cover the parts the UI cannot prove on its own: role separation on the admin issue
 * route, ownership on every read and response, replay safety, the signed download link, and
 * the demo-only simulation switch. Offer PDFs are real files written through storage, so the
 * download test exercises the same path a browser would use.
 */
import { randomUUID } from 'node:crypto';
import { access, rm } from 'node:fs/promises';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { storedDocumentPath } from '../src/lib/storage';
import { createTestUser } from './helpers';

const app = createApp();
const createdOfferKeys: string[] = [];

function idempotencyKey(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

async function makeApplication(
  userId: string,
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'OFFER_ISSUED' = 'UNDER_REVIEW',
): Promise<{ applicationId: string; courseId: string }> {
  const institution = await prisma.institution.create({
    data: {
      name: `Offer Institution ${randomUUID()}`,
      province: 'GAUTENG',
      type: 'UNIVERSITY',
    },
  });
  const course = await prisma.course.create({
    data: {
      institutionId: institution.id,
      name: 'Bachelor of Offer Testing',
      code: `OFR${Math.floor(Math.random() * 10_000)}`,
      field: 'BUSINESS',
      apsMin: 0,
    },
  });
  const application = await prisma.application.create({
    data: {
      userId,
      courseId: course.id,
      status,
      submittedAt: new Date(),
    },
  });
  return { applicationId: application.id, courseId: course.id };
}

async function issueOfferAsAdmin(applicationId: string, key = idempotencyKey('issue')) {
  const admin = await createTestUser({ role: 'ADMIN' });
  const response = await request(app)
    .post(`/api/admin/applications/${applicationId}/offer`)
    .set('Cookie', admin.cookie ?? '')
    .set('Idempotency-Key', key)
    .send({ note: 'Test offer' });

  return { admin, response, key };
}

afterAll(async () => {
  for (const key of createdOfferKeys) {
    await rm(storedDocumentPath(key), { force: true });
  }
});

describe('offer lifecycle', () => {
  it('issues an offer once, with role separation and a replay-safe response', async () => {
    const learner = await createTestUser();
    const student = await createTestUser();
    const company = await createTestUser({ role: 'COMPANY' });
    const { applicationId } = await makeApplication(learner.id);

    const anonymous = await request(app)
      .post(`/api/admin/applications/${applicationId}/offer`)
      .set('Idempotency-Key', idempotencyKey('anonymous'))
      .send({});
    expect(anonymous.status).toBe(401);

    const asStudent = await request(app)
      .post(`/api/admin/applications/${applicationId}/offer`)
      .set('Cookie', student.cookie ?? '')
      .set('Idempotency-Key', idempotencyKey('student'))
      .send({});
    expect(asStudent.status).toBe(403);

    const asCompany = await request(app)
      .post(`/api/admin/applications/${applicationId}/offer`)
      .set('Cookie', company.cookie ?? '')
      .set('Idempotency-Key', idempotencyKey('company'))
      .send({});
    expect(asCompany.status).toBe(403);

    const { admin, response, key } = await issueOfferAsAdmin(applicationId);
    expect(response.status).toBe(201);
    expect(response.body.offerLetterId).toBeTruthy();

    const stored = await prisma.offerLetter.findUnique({
      where: { applicationId },
    });
    expect(stored).not.toBeNull();
    createdOfferKeys.push(stored!.key);

    const application = await prisma.application.findUnique({ where: { id: applicationId } });
    expect(application?.status).toBe('OFFER_ISSUED');
    expect(
      await prisma.applicationEvent.count({
        where: { applicationId, status: 'OFFER_ISSUED' },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { entity: 'application', entityId: applicationId, action: 'OFFER_ISSUED' },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: learner.id, dedupeKey: `offer:${applicationId}` },
      }),
    ).toBe(1);
    expect(await access(storedDocumentPath(stored!.key)).then(() => true, () => false)).toBe(true);

    // Replaying the same key must return the same offer and must not create a second letter,
    // event or notification.
    const replay = await request(app)
      .post(`/api/admin/applications/${applicationId}/offer`)
      .set('Cookie', admin.cookie ?? '')
      .set('Idempotency-Key', key)
      .send({ note: 'Test offer' });
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body.offerLetterId).toBe(response.body.offerLetterId);
    expect(await prisma.offerLetter.count({ where: { applicationId } })).toBe(1);

    const moderator = await createTestUser({ role: 'MODERATOR' });
    const sameKeyOtherUser = await request(app)
      .post(`/api/admin/applications/${applicationId}/offer`)
      .set('Cookie', moderator.cookie ?? '')
      .set('Idempotency-Key', key)
      .send({ note: 'Test offer' });
    // Different user, so the key is a fresh request; the application already has an offer, so
    // issueOffer returns the existing letter rather than creating another.
    expect(sameKeyOtherUser.status).toBe(201);
    expect(sameKeyOtherUser.body.offerLetterId).toBe(response.body.offerLetterId);
    expect(await prisma.offerLetter.count({ where: { applicationId } })).toBe(1);
    expect(
      await prisma.applicationEvent.count({
        where: { applicationId, status: 'OFFER_ISSUED' },
      }),
    ).toBe(1);
  });

  it('never exposes one learner’s offer to another learner or to a company', async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const company = await createTestUser({ role: 'COMPANY' });
    const { applicationId } = await makeApplication(owner.id);
    const { response } = await issueOfferAsAdmin(applicationId);
    const offerId = response.body.offerLetterId as string;

    const ownerList = await request(app)
      .get('/api/offers')
      .set('Cookie', owner.cookie ?? '');
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.offers.map((offer: { id: string }) => offer.id)).toContain(offerId);

    const otherList = await request(app)
      .get('/api/offers')
      .set('Cookie', other.cookie ?? '');
    expect(otherList.status).toBe(200);
    expect(otherList.body.offers).toHaveLength(0);

    const otherRead = await request(app)
      .get(`/api/offers/${offerId}`)
      .set('Cookie', other.cookie ?? '');
    expect(otherRead.status).toBe(403);

    const otherUrl = await request(app)
      .get(`/api/offers/${offerId}/url`)
      .set('Cookie', other.cookie ?? '');
    expect(otherUrl.status).toBe(403);

    const companyRead = await request(app)
      .get(`/api/offers/${offerId}`)
      .set('Cookie', company.cookie ?? '');
    expect(companyRead.status).toBe(403);

    const ownerRead = await request(app)
      .get(`/api/offers/${offerId}`)
      .set('Cookie', owner.cookie ?? '');
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.body.offerLetter.application).not.toHaveProperty('userId');
  });

  it('only lets the owner respond, and replays the same decision without duplicate events', async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const { applicationId } = await makeApplication(owner.id);
    const { response } = await issueOfferAsAdmin(applicationId);
    const offerId = response.body.offerLetterId as string;

    const invalid = await request(app)
      .post(`/api/offers/${offerId}/respond`)
      .set('Cookie', owner.cookie ?? '')
      .set('Idempotency-Key', idempotencyKey('invalid'))
      .send({ decision: 'MAYBE' });
    expect(invalid.status).toBe(400);

    const notOwner = await request(app)
      .post(`/api/offers/${offerId}/respond`)
      .set('Cookie', other.cookie ?? '')
      .set('Idempotency-Key', idempotencyKey('other'))
      .send({ decision: 'ACCEPT' });
    expect(notOwner.status).toBe(403);
    expect(
      (await prisma.application.findUnique({ where: { id: applicationId } }))?.status,
    ).toBe('OFFER_ISSUED');

    const key = idempotencyKey('accept');
    const accepted = await request(app)
      .post(`/api/offers/${offerId}/respond`)
      .set('Cookie', owner.cookie ?? '')
      .set('Idempotency-Key', key)
      .send({ decision: 'ACCEPT' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.decision).toBe('ACCEPT');
    expect(accepted.body.application.status).toBe('ACCEPTED');

    const replay = await request(app)
      .post(`/api/offers/${offerId}/respond`)
      .set('Cookie', owner.cookie ?? '')
      .set('Idempotency-Key', key)
      .send({ decision: 'ACCEPT' });
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(await prisma.applicationEvent.count({
      where: { applicationId, status: 'ACCEPTED' },
    })).toBe(1);
    expect(await prisma.auditLog.count({
      where: { entity: 'application', entityId: applicationId, action: 'OFFER_ACCEPT' },
    })).toBe(1);

    const afterTerminal = await request(app)
      .post(`/api/offers/${offerId}/respond`)
      .set('Cookie', owner.cookie ?? '')
      .set('Idempotency-Key', idempotencyKey('decline-after-accept'))
      .send({ decision: 'DECLINE' });
    expect(afterTerminal.status).toBe(422);
  });

  it('declines an offer and refuses a second response from the terminal status', async () => {
    const owner = await createTestUser();
    const { applicationId } = await makeApplication(owner.id);
    const { response } = await issueOfferAsAdmin(applicationId);
    const offerId = response.body.offerLetterId as string;

    const declined = await request(app)
      .post(`/api/offers/${offerId}/respond`)
      .set('Cookie', owner.cookie ?? '')
      .set('Idempotency-Key', idempotencyKey('decline'))
      .send({ decision: 'DECLINE' });
    expect(declined.status).toBe(200);
    expect(declined.body.application.status).toBe('DECLINED');

    const again = await request(app)
      .post(`/api/offers/${offerId}/respond`)
      .set('Cookie', owner.cookie ?? '')
      .set('Idempotency-Key', idempotencyKey('decline-again'))
      .send({ decision: 'ACCEPT' });
    expect(again.status).toBe(422);
  });

  it('serves the PDF through a signed, expiring link and rejects tampering', async () => {
    const owner = await createTestUser();
    const { applicationId } = await makeApplication(owner.id);
    const { response } = await issueOfferAsAdmin(applicationId);
    const offerId = response.body.offerLetterId as string;

    const urlResponse = await request(app)
      .get(`/api/offers/${offerId}/url`)
      .set('Cookie', owner.cookie ?? '');
    expect(urlResponse.status).toBe(200);
    expect(urlResponse.body.download.url).toContain('/api/offers/');

    const download = await request(app).get(urlResponse.body.download.url);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('application/pdf');
    expect(download.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const tampered = await request(app).get(
      `${urlResponse.body.download.url}&signature=bad`,
    );
    expect(tampered.status).toBe(403);

    const missing = await request(app).get(`/api/offers/${offerId}/download`);
    expect(missing.status).toBe(403);
  });

  it('simulates review for the owner only and replays to the same offer', async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const { applicationId } = await makeApplication(owner.id, 'SUBMITTED');

    const notOwner = await request(app)
      .post(`/api/applications/${applicationId}/simulate-review`)
      .set('Cookie', other.cookie ?? '')
      .set('Idempotency-Key', idempotencyKey('sim-other'))
      .send({});
    expect(notOwner.status).toBe(403);

    const key = idempotencyKey('simulate');
    const simulated = await request(app)
      .post(`/api/applications/${applicationId}/simulate-review`)
      .set('Cookie', owner.cookie ?? '')
      .set('Idempotency-Key', key)
      .send({});
    expect(simulated.status).toBe(200);
    expect(simulated.body.status).toBe('OFFER_ISSUED');
    expect(simulated.body.simulated).toBe(true);

    const stored = await prisma.offerLetter.findUnique({ where: { applicationId } });
    expect(stored).not.toBeNull();
    createdOfferKeys.push(stored!.key);
    expect(
      (await prisma.application.findUnique({ where: { id: applicationId } }))?.status,
    ).toBe('OFFER_ISSUED');

    const replay = await request(app)
      .post(`/api/applications/${applicationId}/simulate-review`)
      .set('Cookie', owner.cookie ?? '')
      .set('Idempotency-Key', key)
      .send({});
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body.offerLetterId).toBe(simulated.body.offerLetterId);
    expect(await prisma.offerLetter.count({ where: { applicationId } })).toBe(1);
  });
});
