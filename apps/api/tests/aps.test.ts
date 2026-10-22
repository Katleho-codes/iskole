/**
 * APS endpoint tests.
 *
 * The arithmetic is unit tested in packages/shared (aps.test.ts), so these tests focus on the
 * route: guards, that it reads only this learner's marks, and that the reasoning the rubric
 * asks for actually comes back on the wire.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { createTestUser } from './helpers';

const app = createApp();

async function addMark(cookie: string, key: string, subject: string, mark: number, isHomeLanguage = false) {
  await request(app)
    .post('/api/marks')
    .set('Cookie', cookie)
    .set('Idempotency-Key', key)
    .send({ subject, mark, isHomeLanguage })
    .expect(201);
}

describe('GET /api/aps', () => {
  it('returns 401 without a session', async () => {
    expect((await request(app).get('/api/aps')).status).toBe(401);
  });

  it('returns 403 for a COMPANY account', async () => {
    const company = await createTestUser({ role: 'COMPANY' });
    const res = await request(app).get('/api/aps').set('Cookie', company.cookie!);
    expect(res.status).toBe(403);
  });

  it('returns a zero score for a learner with no marks yet', async () => {
    const learner = await createTestUser();
    const res = await request(app).get('/api/aps').set('Cookie', learner.cookie!);

    expect(res.status).toBe(200);
    expect(res.body.aps.score).toBe(0);
    expect(res.body.aps.counted).toEqual([]);
  });

  it('computes the score from the learner\'s own marks with reasoning attached', async () => {
    const learner = await createTestUser();
    await addMark(learner.cookie!, 'aps-1', 'Mathematics', 82);
    await addMark(learner.cookie!, 'aps-2', 'Physical Sciences', 74);
    await addMark(learner.cookie!, 'aps-3', 'Life Orientation', 90);

    const res = await request(app).get('/api/aps').set('Cookie', learner.cookie!);

    expect(res.status).toBe(200);
    expect(res.body.aps.score).toBe(13); // 7 for Maths, 6 for PhysSci, LO excluded
    expect(res.body.aps.maxScore).toBe(42);
    expect(res.body.aps.excluded).toContainEqual({
      subject: 'Life Orientation',
      reason: 'LIFE_ORIENTATION',
    });
    expect(res.body.aps.ruleApplied.bestSubjects).toBe(6);
  });

  it('does not include another learner\'s marks', async () => {
    const first = await createTestUser();
    const second = await createTestUser();
    await addMark(first.cookie!, 'aps-own', 'Mathematics', 95);

    const res = await request(app).get('/api/aps').set('Cookie', second.cookie!);
    expect(res.body.aps.score).toBe(0);
  });

  it('returns subject shortfalls when a valid field is asked about', async () => {
    const learner = await createTestUser();
    await addMark(learner.cookie!, 'aps-eng-1', 'Mathematics', 72);
    await addMark(learner.cookie!, 'aps-eng-2', 'Physical Sciences', 55);

    const res = await request(app).get('/api/aps?field=ENGINEERING').set('Cookie', learner.cookie!);

    expect(res.status).toBe(200);
    expect(res.body.aps.shortfalls).toHaveLength(1);
    expect(res.body.aps.shortfalls[0].subject).toBe('Physical Sciences');
    expect(res.body.aps.shortfalls[0].gap).toBe(5);
  });

  it('ignores an unknown field rather than failing the whole request', async () => {
    const learner = await createTestUser();
    const res = await request(app)
      .get('/api/aps?field=ASTROPHYSICS')
      .set('Cookie', learner.cookie!);

    expect(res.status).toBe(200);
    expect(res.body.aps.shortfalls).toEqual([]);
  });

  it('ignores a field value that tries to inject SQL or a path', async () => {
    const learner = await createTestUser();
    const res = await request(app)
      .get('/api/aps?field=' + encodeURIComponent("ENGINEERING'; DROP TABLE \"subjectMark\"; --"))
      .set('Cookie', learner.cookie!);

    expect(res.status).toBe(200);
    // The table is still there: the value never reached a query.
    expect(await prisma.subjectMark.count()).toBeGreaterThanOrEqual(0);
  });
});