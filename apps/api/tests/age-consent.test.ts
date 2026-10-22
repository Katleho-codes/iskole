/**
 * POPIA age rules: date of birth, guardian consent, and the company-visibility cutoff.
 *
 * These are server-side tests on purpose. The web form shows an error first, but the rule
 * that matters is the one the API enforces, because a client can skip the form.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { createTestUser } from './helpers';

const app = createApp();

/** A `YYYY-MM-DD` date exactly this many years ago today. */
function dobYearsAgo(years: number): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

async function makeCourse(): Promise<string> {
  const institution = await prisma.institution.create({
    data: {
      name: `Age Test Institution ${randomUUID()}`,
      province: 'GAUTENG',
      type: 'UNIVERSITY',
    },
  });
  const course = await prisma.course.create({
    data: {
      institutionId: institution.id,
      name: 'Bachelor of Age Testing',
      field: 'BUSINESS',
      apsMin: 0,
    },
  });
  return course.id;
}

async function setDob(cookie: string, dateOfBirth: string) {
  return request(app).put('/api/profile').set('Cookie', cookie).send({ dateOfBirth });
}

async function submit(cookie: string, applicationId: string) {
  return request(app)
    .post(`/api/applications/${applicationId}/submit`)
    .set('Cookie', cookie)
    .set('Idempotency-Key', `age-submit-${randomUUID()}`)
    .send({});
}

describe('age and guardian consent', () => {
  it('rejects a date of birth under 16 and stores a 16- or 17-year-old date', async () => {
    const learner = await createTestUser();
    const cookie = learner.cookie ?? '';

    const tooYoung = await setDob(cookie, dobYearsAgo(15));
    expect(tooYoung.status).toBe(422);
    expect(tooYoung.body.error).toContain('16 and over');

    const minor = await setDob(cookie, dobYearsAgo(17));
    expect(minor.status).toBe(200);
    expect(minor.body.profile.dateOfBirth).toBe(dobYearsAgo(17));

    const stored = await prisma.profile.findUnique({ where: { userId: learner.id } });
    expect(stored?.dateOfBirth?.toISOString().slice(0, 10)).toBe(dobYearsAgo(17));
  });

  it('will not open or submit an application without a date of birth', async () => {
    const learner = await createTestUser();
    const cookie = learner.cookie ?? '';
    const courseId = await makeCourse();

    const blockedCreate = await request(app)
      .post('/api/applications')
      .set('Cookie', cookie)
      .set('Idempotency-Key', `age-blocked-create-${randomUUID()}`)
      .send({ courseId });
    expect(blockedCreate.status).toBe(403);
    expect(blockedCreate.body.error).toContain('date of birth');

    // A draft created before the rule existed still cannot be submitted.
    const draft = await prisma.application.create({
      data: { userId: learner.id, courseId, status: 'DRAFT' },
    });
    const blockedSubmit = await submit(cookie, draft.id);
    expect(blockedSubmit.status).toBe(403);
    expect(blockedSubmit.body.error).toContain('date of birth');

    const saved = await setDob(cookie, dobYearsAgo(20));
    expect(saved.status).toBe(200);

    const allowed = await submit(cookie, draft.id);
    expect(allowed.status).toBe(200);
    expect(allowed.body.application.status).toBe('SUBMITTED');
  });

  it('requires guardian consent before a 16- or 17-year-old can open or submit', async () => {
    const learner = await createTestUser();
    const cookie = learner.cookie ?? '';
    const courseId = await makeCourse();

    expect((await setDob(cookie, dobYearsAgo(17))).status).toBe(200);

    const blockedCreate = await request(app)
      .post('/api/applications')
      .set('Cookie', cookie)
      .set('Idempotency-Key', `age-minor-create-${randomUUID()}`)
      .send({ courseId });
    expect(blockedCreate.status).toBe(403);
    expect(blockedCreate.body.error).toContain('guardian consent');

    const draft = await prisma.application.create({
      data: { userId: learner.id, courseId, status: 'DRAFT' },
    });
    const blockedSubmit = await submit(cookie, draft.id);
    expect(blockedSubmit.status).toBe(403);
    expect(blockedSubmit.body.error).toContain('guardian consent');

    const before = await request(app)
      .get('/api/privacy/guardian-consent')
      .set('Cookie', cookie);
    expect(before.status).toBe(200);
    expect(before.body.guardianConsent.required).toBe(true);
    expect(before.body.guardianConsent.age).toBe(17);
    expect(before.body.guardianConsent.consent).toBeNull();

    const notConfirmed = await request(app)
      .put('/api/privacy/guardian-consent')
      .set('Cookie', cookie)
      .send({ guardianName: 'Guardian Person', guardianContact: 'guardian@example.test' });
    expect(notConfirmed.status).toBe(400);

    const consent = await request(app)
      .put('/api/privacy/guardian-consent')
      .set('Cookie', cookie)
      .send({
        guardianName: 'Guardian Person',
        guardianContact: 'guardian@example.test',
        confirmed: true,
      });
    expect(consent.status).toBe(200);
    expect(consent.body.guardianConsent.consent.guardianName).toBe('Guardian Person');

    const allowed = await submit(cookie, draft.id);
    expect(allowed.status).toBe(200);
    expect(allowed.body.application.status).toBe('SUBMITTED');

    const after = await request(app)
      .get('/api/privacy/guardian-consent')
      .set('Cookie', cookie);
    expect(after.body.guardianConsent.consent.guardianName).toBe('Guardian Person');
    expect(after.body.guardianConsent.consent.guardianContact).toBe('guardian@example.test');
  });

  it('does not record guardian consent for an adult', async () => {
    const learner = await createTestUser();
    const cookie = learner.cookie ?? '';
    expect((await setDob(cookie, dobYearsAgo(25))).status).toBe(200);

    const res = await request(app)
      .put('/api/privacy/guardian-consent')
      .set('Cookie', cookie)
      .send({ guardianName: 'Guardian Person', guardianContact: 'guardian@example.test', confirmed: true });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain('under 18');
  });

  it('keeps company visibility off for under-18s even with guardian consent', async () => {
    const minor = await createTestUser();
    const minorCookie = minor.cookie ?? '';
    expect((await setDob(minorCookie, dobYearsAgo(17))).status).toBe(200);

    await request(app)
      .put('/api/privacy/guardian-consent')
      .set('Cookie', minorCookie)
      .send({ guardianName: 'Guardian Person', guardianContact: 'guardian@example.test', confirmed: true });

    const denied = await request(app)
      .put('/api/privacy/talent-visibility')
      .set('Cookie', minorCookie)
      .send({ visible: true });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toContain('under 18');

    const status = await request(app)
      .get('/api/privacy/talent-visibility')
      .set('Cookie', minorCookie);
    expect(status.body.talentVisibility.visible).toBe(false);

    const adult = await createTestUser();
    const adultCookie = adult.cookie ?? '';
    expect((await setDob(adultCookie, dobYearsAgo(20))).status).toBe(200);
    const allowed = await request(app)
      .put('/api/privacy/talent-visibility')
      .set('Cookie', adultCookie)
      .send({ visible: true });
    expect(allowed.status).toBe(200);
    expect(allowed.body.talentVisibility.visible).toBe(true);
  });

  it('never returns a minor, or an unknown age, to a company', async () => {
    const suffix = randomUUID().slice(0, 8);
    const minorName = `Minor Candidate ${suffix}`;
    const adultName = `Adult Candidate ${suffix}`;
    const unknownName = `Unknown Age Candidate ${suffix}`;

    const minor = await createTestUser();
    const adult = await createTestUser();
    const unknown = await createTestUser();
    const company = await createTestUser({ role: 'COMPANY' });
    const moderator = await createTestUser({ role: 'MODERATOR' });

    await prisma.profile.create({
      data: {
        userId: minor.id,
        fullName: minorName,
        province: 'GAUTENG',
        talentVisible: true,
        dateOfBirth: new Date(`${dobYearsAgo(17)}T00:00:00.000Z`),
      },
    });
    await prisma.profile.create({
      data: {
        userId: adult.id,
        fullName: adultName,
        province: 'GAUTENG',
        talentVisible: true,
        dateOfBirth: new Date(`${dobYearsAgo(20)}T00:00:00.000Z`),
      },
    });
    await prisma.profile.create({
      data: {
        userId: unknown.id,
        fullName: unknownName,
        province: 'GAUTENG',
        talentVisible: true,
      },
    });

    const approval = await request(app)
      .post(`/api/admin/companies/${company.id}/approve`)
      .set('Cookie', moderator.cookie ?? '')
      .send({});
    expect(approval.status).toBe(200);

    const res = await request(app)
      .get('/api/company/candidates')
      .set('Cookie', company.cookie ?? '');
    expect(res.status).toBe(200);

    const names = res.body.candidates.map((candidate: { displayName: string }) => candidate.displayName);
    expect(names).toContain(adultName);
    expect(names).not.toContain(minorName);
    expect(names).not.toContain(unknownName);
  });

  it('includes guardian consent in the data export', async () => {
    const learner = await createTestUser();
    const cookie = learner.cookie ?? '';
    expect((await setDob(cookie, dobYearsAgo(17))).status).toBe(200);
    await request(app)
      .put('/api/privacy/guardian-consent')
      .set('Cookie', cookie)
      .send({ guardianName: 'Export Guardian', guardianContact: 'export@example.test', confirmed: true });

    const res = await request(app).get('/api/privacy/export').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.profile.dateOfBirth).toBe(`${dobYearsAgo(17)}T00:00:00.000Z`);
    expect(res.body.guardianConsent.guardianName).toBe('Export Guardian');
  });
});
