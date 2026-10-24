/**
 * Profile and preferences route tests.
 *
 * Standard matrix per route: 401 unauthenticated, 403 wrong role, 400 invalid body, happy
 * path. Ownership here is structural (one profile per user, no id ever accepted from the
 * client), so the ownership test proves that two learners cannot see each other's data even
 * though they hit the same path.
 *
 * Runs against the real iskole_test database.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { createTestUser } from './helpers';

const app = createApp();

beforeEach(async () => {
  await prisma.rateLimit.deleteMany({});
});

describe('GET /api/profile', () => {
  it('returns 401 without a session', async () => {
    const res = await request(app).get('/api/profile');
    expect(res.status).toBe(401);
  });

  it('returns 403 for a COMPANY account', async () => {
    const company = await createTestUser({ role: 'COMPANY' });
    const res = await request(app).get('/api/profile').set('Cookie', company.cookie!);
    expect(res.status).toBe(403);
  });

  it('returns an empty profile for a new learner, not a 404', async () => {
    const learner = await createTestUser();
    const res = await request(app).get('/api/profile').set('Cookie', learner.cookie!);

    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual({
      fullName: null,
      phone: null,
      province: null,
      qualificationStatus: null,
      grade: null,
      schoolQualification: null,
      interests: null,
      dateOfBirth: null,
      consentedAt: null,
    });
  });

  it('never returns another learner\'s profile', async () => {
    const first = await createTestUser();
    const second = await createTestUser();

    await request(app)
      .put('/api/profile')
      .set('Cookie', first.cookie!)
      .send({ fullName: 'First Learner' })
      .expect(200);

    const res = await request(app).get('/api/profile').set('Cookie', second.cookie!);
    expect(res.status).toBe(200);
    expect(res.body.profile.fullName).toBeNull();
  });
});

describe('PUT /api/profile', () => {
  it('returns 401 without a session', async () => {
    const res = await request(app).put('/api/profile').send({ fullName: 'Nobody' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for a COMPANY account', async () => {
    const company = await createTestUser({ role: 'COMPANY' });
    const res = await request(app)
      .put('/api/profile')
      .set('Cookie', company.cookie!)
      .send({ fullName: 'Company' });
    expect(res.status).toBe(403);
  });

  it('returns 400 for an invalid body with safe field detail', async () => {
    const learner = await createTestUser();
    const res = await request(app)
      .put('/api/profile')
      .set('Cookie', learner.cookie!)
      .send({ grade: 99 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid request');
    expect(res.body.issues[0].path).toBe('grade');
  });

  it('saves a valid partial update', async () => {
    const learner = await createTestUser();
    const res = await request(app)
      .put('/api/profile')
      .set('Cookie', learner.cookie!)
      .send({ fullName: 'Thandi Mokoena', province: 'GAUTENG', grade: 11 });

    expect(res.status).toBe(200);
    expect(res.body.profile.fullName).toBe('Thandi Mokoena');
    expect(res.body.profile.province).toBe('GAUTENG');
    expect(res.body.profile.grade).toBe(11);
  });

  it('leaves untouched fields alone on a partial update', async () => {
    const learner = await createTestUser();
    await request(app)
      .put('/api/profile')
      .set('Cookie', learner.cookie!)
      .send({ fullName: 'Thandi', interests: 'nursing and maths' })
      .expect(200);

    const res = await request(app)
      .put('/api/profile')
      .set('Cookie', learner.cookie!)
      .send({ grade: 10 });

    expect(res.status).toBe(200);
    expect(res.body.profile.fullName).toBe('Thandi');
    expect(res.body.profile.interests).toBe('nursing and maths');
    expect(res.body.profile.grade).toBe(10);
  });

  // Privilege escalation and PII blocking at the profile boundary. The schema is .strict(),
  // so these fail loudly with 400 rather than being silently dropped, which means a client
  // bug surfaces immediately instead of looking like it worked.
  it('rejects a body trying to set role, userId, email, emailVerified or an ID number', async () => {
    const learner = await createTestUser();
    for (const body of [
      { role: 'ADMIN' },
      { userId: 'someone-else' },
      { email: 'attacker@example.test' },
      { emailVerified: true },
      { idNumber: '9001015800085' },
    ]) {
      const res = await request(app)
        .put('/api/profile')
        .set('Cookie', learner.cookie!)
        .send(body);
      expect(res.status, `body ${JSON.stringify(body)} should be rejected`).toBe(400);
    }
  });

  it('does not change the account role when a role is smuggled in', async () => {
    const learner = await createTestUser();
    await request(app).put('/api/profile').set('Cookie', learner.cookie!).send({ role: 'ADMIN' });

    const row = await prisma.user.findUnique({ where: { id: learner.id } });
    expect(row?.role).toBe('STUDENT');
  });
});

describe('preferences', () => {
  it('returns 401 without a session', async () => {
    expect((await request(app).get('/api/preferences')).status).toBe(401);
    expect((await request(app).put('/api/preferences').send({})).status).toBe(401);
  });

  it('returns 403 for a COMPANY account', async () => {
    const company = await createTestUser({ role: 'COMPANY' });
    const res = await request(app).get('/api/preferences').set('Cookie', company.cookie!);
    expect(res.status).toBe(403);
  });

  it('returns 400 for an unknown field of study', async () => {
    const learner = await createTestUser();
    const res = await request(app)
      .put('/api/preferences')
      .set('Cookie', learner.cookie!)
      .send({ fields: ['ASTROPHYSICS'] });

    expect(res.status).toBe(400);
    expect(res.body.issues[0].path).toBe('fields.0');
  });

  it('saves and returns preferences, deduplicating fields', async () => {
    const learner = await createTestUser();
    const res = await request(app)
      .put('/api/preferences')
      .set('Cookie', learner.cookie!)
      .send({ fields: ['NURSING', 'NURSING', 'LAW'], provinces: ['GAUTENG'], budgetCeiling: 60000 });

    expect(res.status).toBe(200);
    expect(res.body.preferences.fields).toEqual(['NURSING', 'LAW']);
    expect(res.body.preferences.budgetCeiling).toBe(60000);
    expect(res.body.preferences.language).toBe('en');
  });

  it('starts a new learner with no fields and no ceiling', async () => {
    const learner = await createTestUser();
    const res = await request(app).get('/api/preferences').set('Cookie', learner.cookie!);

    expect(res.status).toBe(200);
    expect(res.body.preferences.fields).toEqual([]);
    expect(res.body.preferences.provinces).toEqual([]);
    expect(res.body.preferences.budgetCeiling).toBeNull();
    expect(res.body.preferences.lowDataMode).toBe(false);
  });
});