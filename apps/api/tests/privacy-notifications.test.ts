/**
 * M6 privacy centre and notifications contract.
 *
 * The export test asserts absence as well as presence: a data export that leaks a password
 * hash or ID ciphertext is worse than no export at all.
 */
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { CONSENT_POLICY_VERSION } from '@iskole/shared';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { createTestUser } from './helpers';

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('consent history', () => {
  it('appends grants, is idempotent for the same version and closes on revoke', async () => {
    const learner = await createTestUser();
    const cookie = learner.cookie ?? '';

    const empty = await request(app).get('/api/privacy/consents').set('Cookie', cookie);
    expect(empty.status).toBe(200);
    expect(empty.body.consents).toEqual([]);

    const granted = await request(app)
      .post('/api/privacy/consents')
      .set('Cookie', cookie)
      .send({ purpose: 'AI_STUDY_PLAN', granted: true });
    expect(granted.status).toBe(201);
    expect(granted.body.consent.purpose).toBe('AI_STUDY_PLAN');
    expect(granted.body.consent.policyVersion).toBe(CONSENT_POLICY_VERSION);

    const replay = await request(app)
      .post('/api/privacy/consents')
      .set('Cookie', cookie)
      .send({ purpose: 'AI_STUDY_PLAN', granted: true });
    expect(replay.status).toBe(200);
    expect(replay.body.consent.id).toBe(granted.body.consent.id);

    const revoked = await request(app)
      .post('/api/privacy/consents')
      .set('Cookie', cookie)
      .send({ purpose: 'AI_STUDY_PLAN', granted: false });
    expect(revoked.status).toBe(200);
    expect(revoked.body.revoked).toBe(1);
    expect(revoked.body.active).toBe(false);

    const history = await request(app).get('/api/privacy/consents').set('Cookie', cookie);
    expect(history.body.consents).toHaveLength(1);
    expect(history.body.consents[0].revokedAt).toBeTruthy();

    const invalid = await request(app)
      .post('/api/privacy/consents')
      .set('Cookie', cookie)
      .send({ purpose: 'MARKETING', granted: true });
    expect(invalid.status).toBe(400);
  });

  it('is scoped to the signed-in learner and rejects anonymous reads', async () => {
    const first = await createTestUser();
    const second = await createTestUser();

    expect((await request(app).get('/api/privacy/consents')).status).toBe(401);

    await request(app)
      .post('/api/privacy/consents')
      .set('Cookie', first.cookie ?? '')
      .send({ purpose: 'TALENT_VISIBILITY', granted: true });

    const secondHistory = await request(app)
      .get('/api/privacy/consents')
      .set('Cookie', second.cookie ?? '');
    expect(secondHistory.body.consents).toEqual([]);
  });
});

describe('data export', () => {
  it('includes the learner own records but no password or ID material', async () => {
    const learner = await createTestUser();
    await prisma.consent.create({
      data: { userId: learner.id, purpose: 'ESSENTIAL', policyVersion: CONSENT_POLICY_VERSION },
    });
    await prisma.expense.create({
      data: { userId: learner.id, category: 'Food', amountCents: 1_550, remindMe: true },
    });
    await prisma.moneyPlan.create({ data: { userId: learner.id, paydayDay: 0 } });

    const res = await request(app)
      .get('/api/privacy/export')
      .set('Cookie', learner.cookie ?? '');

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['cache-control']).toBe('no-store');

    const payload = res.body as Record<string, unknown>;
    expect(payload.account).toMatchObject({ email: learner.email });
    expect(Array.isArray(payload.consents)).toBe(true);
    expect(payload.moneyPlan).toEqual({ paydayDay: 0 });

    const raw = JSON.stringify(payload);
    expect(raw).not.toContain('password');
    expect(raw).not.toContain('idNumber');
    expect(raw).not.toContain('session');
    expect(raw).not.toContain('securityEvent');
  });
});

describe('notifications', () => {
  async function makeNotification(userId: string, dedupeKey: string) {
    return prisma.notification.create({
      data: {
        userId,
        type: 'OFFER',
        title: 'Test notification',
        body: 'Nothing sensitive here.',
        href: '/offers',
        dedupeKey,
      },
    });
  }

  it('lists only the owner notifications and reports the unread count', async () => {
    const first = await createTestUser();
    const second = await createTestUser();
    await makeNotification(first.id, `n1-${Date.now()}`);
    await makeNotification(second.id, `n2-${Date.now()}`);

    const mine = await request(app).get('/api/notifications').set('Cookie', first.cookie ?? '');
    expect(mine.status).toBe(200);
    expect(mine.body.notifications).toHaveLength(1);
    expect(mine.body.unread).toBe(1);

    const other = await request(app).get('/api/notifications').set('Cookie', second.cookie ?? '');
    expect(other.body.notifications).toHaveLength(1);

    expect((await request(app).get('/api/notifications')).status).toBe(401);
  });

  it('marks read within the owner scope and returns 404 across users', async () => {
    const learner = await createTestUser();
    const other = await createTestUser();
    const notification = await makeNotification(learner.id, `read-${Date.now()}`);

    const crossUser = await request(app)
      .post(`/api/notifications/${notification.id}/read`)
      .set('Cookie', other.cookie ?? '');
    expect(crossUser.status).toBe(404);

    const marked = await request(app)
      .post(`/api/notifications/${notification.id}/read`)
      .set('Cookie', learner.cookie ?? '');
    expect(marked.status).toBe(200);
    expect(marked.body.notification.readAt).toBeTruthy();
    expect(marked.body.unread).toBe(0);

    // Repeating the call is safe and does not move the timestamp forward.
    const replay = await request(app)
      .post(`/api/notifications/${notification.id}/read`)
      .set('Cookie', learner.cookie ?? '');
    expect(replay.status).toBe(200);
    expect(replay.body.notification.readAt).toBe(marked.body.notification.readAt);
  });

  it('marks all read for one learner without touching another', async () => {
    const first = await createTestUser();
    const second = await createTestUser();
    await makeNotification(first.id, `all-a-${Date.now()}`);
    await makeNotification(first.id, `all-b-${Date.now()}`);
    await makeNotification(second.id, `all-c-${Date.now()}`);

    const res = await request(app)
      .post('/api/notifications/read-all')
      .set('Cookie', first.cookie ?? '');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ marked: 2, unread: 0 });

    expect(
      await prisma.notification.count({ where: { userId: first.id, readAt: null } }),
    ).toBe(0);
    expect(
      await prisma.notification.count({ where: { userId: second.id, readAt: null } }),
    ).toBe(1);
  });
});

describe('account deletion', () => {
  it('requires the typed confirmation and removes the account', async () => {
    const learner = await createTestUser();
    const cookie = learner.cookie ?? '';

    const missing = await request(app).delete('/api/privacy/account').set('Cookie', cookie).send({});
    expect(missing.status).toBe(400);

    const deleted = await request(app)
      .delete('/api/privacy/account')
      .set('Cookie', cookie)
      .send({ confirm: 'DELETE' });
    expect(deleted.status).toBe(204);
    expect(await prisma.user.findUnique({ where: { id: learner.id } })).toBeNull();
  });
});
