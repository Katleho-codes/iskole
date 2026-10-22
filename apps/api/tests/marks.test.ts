/**
 * Subject mark tests, including the idempotency contract.
 *
 * The idempotency behaviour is the point of this file. A learner on a slow connection taps
 * save twice; the second request must not create a second mark, and must return the first
 * response rather than erroring.
 *
 * Idempotency is only as good as the store underneath it, so each test checks two things:
 * the HTTP contract (status, body, replay header) and the database row count.
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

describe('POST /api/marks guard matrix', () => {
  it('returns 401 without a session', async () => {
    const res = await request(app)
      .post('/api/marks')
      .set('Idempotency-Key', 'key-1')
      .send({ subject: 'Mathematics', mark: 70 });
    expect(res.status).toBe(401);
  });

  it('returns 403 for a COMPANY account', async () => {
    const company = await createTestUser({ role: 'COMPANY' });
    const res = await request(app)
      .post('/api/marks')
      .set('Cookie', company.cookie!)
      .set('Idempotency-Key', 'key-1')
      .send({ subject: 'Mathematics', mark: 70 });
    expect(res.status).toBe(403);
  });

  it('requires an Idempotency-Key header', async () => {
    const learner = await createTestUser();
    const res = await request(app)
      .post('/api/marks')
      .set('Cookie', learner.cookie!)
      .send({ subject: 'Mathematics', mark: 70 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Idempotency-Key/);
  });
});

describe('POST /api/marks validation', () => {
  it('returns 400 for a mark above 100', async () => {
    const learner = await createTestUser();
    const res = await request(app)
      .post('/api/marks')
      .set('Cookie', learner.cookie!)
      .set('Idempotency-Key', 'validate-1')
      .send({ subject: 'Mathematics', mark: 101 });

    expect(res.status).toBe(400);
    expect(res.body.issues[0].path).toBe('mark');
  });

  it('returns 400 for a negative mark', async () => {
    const learner = await createTestUser();
    const res = await request(app)
      .post('/api/marks')
      .set('Cookie', learner.cookie!)
      .set('Idempotency-Key', 'validate-2')
      .send({ subject: 'Mathematics', mark: -5 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an empty subject', async () => {
    const learner = await createTestUser();
    const res = await request(app)
      .post('/api/marks')
      .set('Cookie', learner.cookie!)
      .set('Idempotency-Key', 'validate-3')
      .send({ subject: '   ', mark: 70 });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown key in the body', async () => {
    const learner = await createTestUser();
    const res = await request(app)
      .post('/api/marks')
      .set('Cookie', learner.cookie!)
      .set('Idempotency-Key', 'validate-4')
      .send({ subject: 'Mathematics', mark: 70, userId: 'someone-else' });
    expect(res.status).toBe(400);
  });

  it('does not leave a failed request replayable', async () => {
    const learner = await createTestUser();
    await request(app)
      .post('/api/marks')
      .set('Cookie', learner.cookie!)
      .set('Idempotency-Key', 'failed-1')
      .send({ subject: 'Mathematics', mark: 999 })
      .expect(400);

    // Same key, corrected body: this must succeed, because nothing was stored for the failure.
    const res = await request(app)
      .post('/api/marks')
      .set('Cookie', learner.cookie!)
      .set('Idempotency-Key', 'failed-1')
      .send({ subject: 'Mathematics', mark: 70 });

    expect(res.status).toBe(201);
  });
});

describe('POST /api/marks idempotency', () => {
  it('creates one mark and replays the same response on a repeat', async () => {
    const learner = await createTestUser();
    const body = { subject: 'Mathematics', mark: 72 };

    const first = await request(app)
      .post('/api/marks')
      .set('Cookie', learner.cookie!)
      .set('Idempotency-Key', 'replay-1')
      .send(body);
    expect(first.status).toBe(201);
    expect(first.headers['idempotent-replay']).toBeUndefined();

    const second = await request(app)
      .post('/api/marks')
      .set('Cookie', learner.cookie!)
      .set('Idempotency-Key', 'replay-1')
      .send(body);

    expect(second.status).toBe(201);
    expect(second.headers['idempotent-replay']).toBe('true');
    expect(second.body).toEqual(first.body);

    const count = await prisma.subjectMark.count({ where: { userId: learner.id } });
    expect(count).toBe(1);
  });

  it('returns 422 when the same key carries a different body', async () => {
    const learner = await createTestUser();

    await request(app)
      .post('/api/marks')
      .set('Cookie', learner.cookie!)
      .set('Idempotency-Key', 'conflict-1')
      .send({ subject: 'Mathematics', mark: 72 })
      .expect(201);

    const res = await request(app)
      .post('/api/marks')
      .set('Cookie', learner.cookie!)
      .set('Idempotency-Key', 'conflict-1')
      .send({ subject: 'Physical Sciences', mark: 65 });

    expect(res.status).toBe(422);
  });

  it('treats the same key from two learners as two separate requests', async () => {
    const first = await createTestUser();
    const second = await createTestUser();
    const body = { subject: 'Mathematics', mark: 72 };

    const a = await request(app)
      .post('/api/marks')
      .set('Cookie', first.cookie!)
      .set('Idempotency-Key', 'shared-key')
      .send(body);
    const b = await request(app)
      .post('/api/marks')
      .set('Cookie', second.cookie!)
      .set('Idempotency-Key', 'shared-key')
      .send(body);

    // Both succeed and neither sees the other's response: keys are scoped per user.
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.headers['idempotent-replay']).toBeUndefined();
  });

  it('is stable regardless of JSON key order in the request', async () => {
    const learner = await createTestUser();

    await request(app)
      .post('/api/marks')
      .set('Cookie', learner.cookie!)
      .set('Idempotency-Key', 'order-1')
      .send({ subject: 'Mathematics', mark: 72 })
      .expect(201);

    // Same content, different key order. This is the same request and must replay, not 422.
    const res = await request(app)
      .post('/api/marks')
      .set('Cookie', learner.cookie!)
      .set('Idempotency-Key', 'order-1')
      .send({ mark: 72, subject: 'Mathematics' });

    expect(res.status).toBe(201);
    expect(res.headers['idempotent-replay']).toBe('true');
  });

  it('updates rather than duplicates when two different keys name the same subject', async () => {
    const learner = await createTestUser();

    await request(app)
      .post('/api/marks')
      .set('Cookie', learner.cookie!)
      .set('Idempotency-Key', 'correct-1')
      .send({ subject: 'Mathematics', mark: 62 })
      .expect(201);

    const res = await request(app)
      .post('/api/marks')
      .set('Cookie', learner.cookie!)
      .set('Idempotency-Key', 'correct-2')
      .send({ subject: 'Mathematics', mark: 68 });

    expect(res.status).toBe(201);
    expect(res.body.mark.mark).toBe(68);

    const marks = await prisma.subjectMark.findMany({ where: { userId: learner.id } });
    expect(marks).toHaveLength(1);
    expect(marks[0]?.mark).toBe(68);
  });

  // The double-tap case: two identical requests in flight at the same time, which is what a
  // slow connection actually produces. The claim row plus the unique index is what stops both
  // from creating a mark. Without the claim, both would pass a read-then-write check.
  it('creates one mark when the same request arrives twice at once', async () => {
    const learner = await createTestUser();
    const body = { subject: 'Life Sciences', mark: 74 };

    const send = () =>
      request(app)
        .post('/api/marks')
        .set('Cookie', learner.cookie!)
        .set('Idempotency-Key', 'race-1')
        .send(body);

    const [a, b] = await Promise.all([send(), send()]);

    // Both callers get a usable answer: one created it, one replayed it.
    expect([a.status, b.status].every((s) => s === 201)).toBe(true);
    const replays = [a, b].filter((r) => r.headers['idempotent-replay'] === 'true');
    expect(replays).toHaveLength(1);

    const count = await prisma.subjectMark.count({ where: { userId: learner.id } });
    expect(count).toBe(1);
  });
});

describe('GET /api/marks', () => {
  it('returns 401 without a session', async () => {
    expect((await request(app).get('/api/marks')).status).toBe(401);
  });

  it('returns only this learner\'s marks', async () => {
    const first = await createTestUser();
    const second = await createTestUser();

    await request(app)
      .post('/api/marks')
      .set('Cookie', first.cookie!)
      .set('Idempotency-Key', 'owner-1')
      .send({ subject: 'Mathematics', mark: 80 })
      .expect(201);

    const res = await request(app).get('/api/marks').set('Cookie', second.cookie!);
    expect(res.status).toBe(200);
    expect(res.body.marks).toEqual([]);
  });

  it('returns marks in a stable subject order', async () => {
    const learner = await createTestUser();
    for (const [index, subject] of ['Physical Sciences', 'Accounting', 'Mathematics'].entries()) {
      await request(app)
        .post('/api/marks')
        .set('Cookie', learner.cookie!)
        .set('Idempotency-Key', `order-${index}`)
        .send({ subject, mark: 70 })
        .expect(201);
    }

    const res = await request(app).get('/api/marks').set('Cookie', learner.cookie!);
    expect(res.body.marks.map((m: { subject: string }) => m.subject)).toEqual([
      'Accounting',
      'Mathematics',
      'Physical Sciences',
    ]);
  });
});