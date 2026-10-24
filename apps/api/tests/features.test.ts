/**
 * Integration tests for the features beyond the core journey: money, clinic bookings,
 * community, POPIA controls and study plans.
 *
 * Same rules as the rest of the API suite: real Express app, real iskole_test database, a
 * session obtained by actually signing in. The AI transport is replaced, so no test makes a
 * network call; the study-plan test deliberately makes it fail to exercise the deterministic
 * fallback that a learner would see if the model were unavailable.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { __setTransportForTests } from '../src/lib/ai/client';
import { prisma } from '../src/lib/prisma';
import { createTestUser } from './helpers';

const app = createApp();

function key(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

afterAll(() => {
  __setTransportForTests(null);
});

describe('expenses and budgets', () => {
  it('requires a session', async () => {
    const res = await request(app).get('/api/expenses');
    expect(res.status).toBe(401);
  });

  it('stores money in cents and returns rands', async () => {
    const { id, cookie } = await createTestUser();

    const created = await request(app)
      .post('/api/expenses')
      .set('Cookie', cookie ?? '')
      .set('Idempotency-Key', key('expense'))
      .send({ category: 'Transport', amount: 12.34, description: 'Taxi to campus' });

    expect(created.status).toBe(201);
    expect(created.body.expense.amount).toBe(12.34);

    const row = await prisma.expense.findFirst({ where: { userId: id } });
    expect(row?.amountCents).toBe(1234);

    const listed = await request(app).get('/api/expenses').set('Cookie', cookie ?? '');
    expect(listed.status).toBe(200);
    expect(listed.body.expenses).toHaveLength(1);
    expect(listed.body.expenses[0].amount).toBe(12.34);
  });

  it('replays a repeated expense with the same idempotency key', async () => {
    const { id, cookie } = await createTestUser();
    const idempotencyKey = key('expense-replay');
    const body = { category: 'Food', amount: 50 };

    const first = await request(app)
      .post('/api/expenses')
      .set('Cookie', cookie ?? '')
      .set('Idempotency-Key', idempotencyKey)
      .send(body);
    const second = await request(app)
      .post('/api/expenses')
      .set('Cookie', cookie ?? '')
      .set('Idempotency-Key', idempotencyKey)
      .send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.expense.id).toBe(first.body.expense.id);
    expect(await prisma.expense.count({ where: { userId: id } })).toBe(1);
  });

  it('keeps one budget per category and period', async () => {
    const { id, cookie } = await createTestUser();

    const first = await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie ?? '')
      .set('Idempotency-Key', key('budget'))
      .send({ category: 'Food', amount: 800, period: 'MONTHLY' });
    const second = await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie ?? '')
      .set('Idempotency-Key', key('budget'))
      .send({ category: 'Food', amount: 950, period: 'MONTHLY' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.budget.amount).toBe(950);

    const budgets = await prisma.budget.findMany({ where: { userId: id } });
    expect(budgets).toHaveLength(1);
    expect(budgets[0]?.amountCents).toBe(95000);
  });

  it('does not mix one learner’s expenses into another’s list', async () => {
    const first = await createTestUser();
    const second = await createTestUser();

    await request(app)
      .post('/api/expenses')
      .set('Cookie', first.cookie ?? '')
      .set('Idempotency-Key', key('expense-owner'))
      .send({ category: 'Books', amount: 300 });

    const res = await request(app).get('/api/expenses').set('Cookie', second.cookie ?? '');
    expect(res.status).toBe(200);
    expect(res.body.expenses).toEqual([]);
  });
});

describe('clinic', () => {
  async function makeSlot(options: { capacity: number; startsAt: Date }) {
    return prisma.clinicSlot.create({
      data: {
        startsAt: options.startsAt,
        endsAt: new Date(options.startsAt.getTime() + 60 * 60 * 1000),
        topic: `Funding clinic ${randomUUID()}`,
        capacity: options.capacity,
      },
    });
  }

  it('lists upcoming slots with places left', async () => {
    const slot = await makeSlot({ capacity: 2, startsAt: new Date(Date.now() + 86_400_000) });

    const res = await request(app).get('/api/clinic/slots');
    expect(res.status).toBe(200);
    expect(res.body.slots.some((item: { id: string; placesLeft: number }) => item.id === slot.id)).toBe(
      true,
    );
  });

  it('books a place once, then refuses duplicates and a full slot', async () => {
    const slot = await makeSlot({ capacity: 1, startsAt: new Date(Date.now() + 86_400_000) });
    const learner = await createTestUser();
    const other = await createTestUser();

    const idempotencyKey = key('booking');
    const first = await request(app)
      .post('/api/clinic/bookings')
      .set('Cookie', learner.cookie ?? '')
      .set('Idempotency-Key', idempotencyKey)
      .send({ slotId: slot.id, reason: 'FUNDING' });

    expect(first.status).toBe(201);
    expect(first.body.booking.slot.id).toBe(slot.id);

    // Same key: replay of the first booking, not a second row.
    const replay = await request(app)
      .post('/api/clinic/bookings')
      .set('Cookie', learner.cookie ?? '')
      .set('Idempotency-Key', idempotencyKey)
      .send({ slotId: slot.id, reason: 'FUNDING' });
    expect(replay.status).toBe(201);
    expect(replay.body.booking.id).toBe(first.body.booking.id);
    expect(await prisma.booking.count({ where: { slotId: slot.id } })).toBe(1);

    // New key, same learner: the unique (slot, learner) rule refuses it.
    const duplicate = await request(app)
      .post('/api/clinic/bookings')
      .set('Cookie', learner.cookie ?? '')
      .set('Idempotency-Key', key('booking'))
      .send({ slotId: slot.id, reason: 'FUNDING' });
    expect(duplicate.status).toBe(409);

    // Another learner: the slot is full.
    const full = await request(app)
      .post('/api/clinic/bookings')
      .set('Cookie', other.cookie ?? '')
      .set('Idempotency-Key', key('booking'))
      .send({ slotId: slot.id, reason: 'FUNDING' });
    expect(full.status).toBe(409);
  });

  it('refuses a slot that has already started', async () => {
    const slot = await makeSlot({ capacity: 3, startsAt: new Date(Date.now() - 60_000) });
    const learner = await createTestUser();

    const res = await request(app)
      .post('/api/clinic/bookings')
      .set('Cookie', learner.cookie ?? '')
      .set('Idempotency-Key', key('booking-past'))
      .send({ slotId: slot.id, reason: 'FUNDING' });

    expect(res.status).toBe(422);
  });
});

describe('community', () => {
  it('creates a community and stores messages with an author name only', async () => {
    const learner = await createTestUser();
    const name = `First years ${randomUUID()}`;

    const created = await request(app)
      .post('/api/communities')
      .set('Cookie', learner.cookie ?? '')
      .set('Idempotency-Key', key('community'))
      .send({ name, description: 'Questions about registration' });

    expect(created.status).toBe(201);
    const communityId = created.body.community.id as string;

    const posted = await request(app)
      .post('/api/messages')
      .set('Cookie', learner.cookie ?? '')
      .set('Idempotency-Key', key('message'))
      .send({ communityId, body: 'Where do I collect my student card?' });

    expect(posted.status).toBe(201);
    expect(posted.body.message.authorName).toBe('Test User');
    expect(posted.body.message).not.toHaveProperty('email');

    const listed = await request(app)
      .get(`/api/messages?communityId=${communityId}`)
      .set('Cookie', learner.cookie ?? '');
    expect(listed.status).toBe(200);
    expect(listed.body.messages).toHaveLength(1);
    expect(listed.body.messages[0].body).toBe('Where do I collect my student card?');

    const anonymous = await request(app).get(`/api/messages?communityId=${communityId}`);
    expect(anonymous.status).toBe(401);
  });

  it('rejects a duplicate community name', async () => {
    const learner = await createTestUser();
    const name = `Duplicates ${randomUUID()}`;

    const first = await request(app)
      .post('/api/communities')
      .set('Cookie', learner.cookie ?? '')
      .set('Idempotency-Key', key('community'))
      .send({ name });
    const second = await request(app)
      .post('/api/communities')
      .set('Cookie', learner.cookie ?? '')
      .set('Idempotency-Key', key('community'))
      .send({ name });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });

  it('records a report without copying the reported content', async () => {
    const learner = await createTestUser();

    const res = await request(app)
      .post('/api/reports')
      .set('Cookie', learner.cookie ?? '')
      .set('Idempotency-Key', key('report'))
      .send({
        targetType: 'MESSAGE',
        targetId: randomUUID(),
        reason: 'This message is harassing another learner.',
      });

    expect(res.status).toBe(201);
    expect(res.body.report.status).toBe('SUBMITTED');
    expect(res.body.report).not.toHaveProperty('reason');

    const stored = await prisma.report.findUnique({ where: { id: res.body.report.id } });
    expect(stored?.reason).toContain('harassing');
  });

  it('gates company search behind moderator approval and shows only opted-in learners', async () => {
    const visible = await createTestUser();
    const hidden = await createTestUser();
    const company = await createTestUser({ role: 'COMPANY' });

    await prisma.profile.create({
      data: {
        userId: visible.id,
        fullName: 'Visible Learner',
        province: 'GAUTENG',
        qualificationStatus: 'COMPLETED_SCHOOL',
        interests: 'Helping people',
        talentVisible: true,
        dateOfBirth: new Date('2000-01-01T00:00:00.000Z'),
      },
    });
    await prisma.profile.create({
      data: {
        userId: hidden.id,
        fullName: 'Hidden Learner',
        province: 'GAUTENG',
        talentVisible: false,
        dateOfBirth: new Date('2000-01-01T00:00:00.000Z'),
      },
    });
    await prisma.subjectMark.create({
      data: { userId: visible.id, subject: 'Mathematics', mark: 80 },
    });

    // A COMPANY role alone is not enough: without a moderator-created approval row the
    // search stays closed.
    const beforeApproval = await request(app)
      .get('/api/company/candidates')
      .set('Cookie', company.cookie ?? '');
    expect(beforeApproval.status).toBe(403);
    expect(beforeApproval.body.error).toContain('approval');

    const learnerDenied = await request(app)
      .get('/api/company/candidates')
      .set('Cookie', visible.cookie ?? '');
    expect(learnerDenied.status).toBe(403);

    // A learner cannot approve anyone, even themselves.
    const selfApproval = await request(app)
      .post(`/api/admin/companies/${company.id}/approve`)
      .set('Cookie', visible.cookie ?? '')
      .send({});
    expect(selfApproval.status).toBe(403);

    const moderator = await createTestUser({ role: 'MODERATOR' });

    // Only company accounts are valid targets.
    const wrongTarget = await request(app)
      .post(`/api/admin/companies/${visible.id}/approve`)
      .set('Cookie', moderator.cookie ?? '')
      .send({});
    expect(wrongTarget.status).toBe(422);

    const approval = await request(app)
      .post(`/api/admin/companies/${company.id}/approve`)
      .set('Cookie', moderator.cookie ?? '')
      .send({});
    expect(approval.status).toBe(200);
    expect(approval.body.company.approved).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: {
        actorId: moderator.id,
        action: 'COMPANY_APPROVED',
        entityId: company.id,
      },
    });
    expect(audit).not.toBeNull();

    const res = await request(app)
      .get('/api/company/candidates')
      .set('Cookie', company.cookie ?? '');
    expect(res.status).toBe(200);

    const names = res.body.candidates.map((candidate: { displayName: string }) => candidate.displayName);
    expect(names).toContain('Visible Learner');
    expect(names).not.toContain('Hidden Learner');

    const candidate = res.body.candidates.find(
      (item: { displayName: string }) => item.displayName === 'Visible Learner',
    );
    expect(candidate.apsScore).toBeGreaterThan(0);
    expect(candidate).not.toHaveProperty('email');
    expect(candidate).not.toHaveProperty('phone');
  });
});

describe('POPIA controls', () => {
  it('defaults talent visibility to off and changes it only on request', async () => {
    const learner = await createTestUser();

    // Visibility now requires a proven adult age. The default is still off before any
    // date of birth exists; opting in needs the profile field.
    const age = await request(app)
      .put('/api/profile')
      .set('Cookie', learner.cookie ?? '')
      .send({ dateOfBirth: '2000-01-01' });
    expect(age.status).toBe(200);

    const before = await request(app)
      .get('/api/privacy/talent-visibility')
      .set('Cookie', learner.cookie ?? '');
    expect(before.status).toBe(200);
    expect(before.body.talentVisibility.visible).toBe(false);

    const update = await request(app)
      .put('/api/privacy/talent-visibility')
      .set('Cookie', learner.cookie ?? '')
      .send({ visible: true });
    expect(update.status).toBe(200);
    expect(update.body.talentVisibility.visible).toBe(true);

    const after = await request(app)
      .get('/api/privacy/talent-visibility')
      .set('Cookie', learner.cookie ?? '');
    expect(after.body.talentVisibility.visible).toBe(true);
  });

  it('exports the learner’s own content and nothing secret', async () => {
    const learner = await createTestUser();
    await prisma.profile.create({
      data: { userId: learner.id, fullName: 'Export Learner', province: 'LIMPOPO' },
    });
    await prisma.subjectMark.create({
      data: { userId: learner.id, subject: 'Life Sciences', mark: 70 },
    });
    await prisma.expense.create({
      data: { userId: learner.id, category: 'Food', amountCents: 2550 },
    });

    const res = await request(app)
      .get('/api/privacy/export')
      .set('Cookie', learner.cookie ?? '');

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body.account.email).toBe(learner.email);
    expect(res.body.profile.fullName).toBe('Export Learner');
    expect(res.body.marks[0].subject).toBe('Life Sciences');
    expect(res.body.expenses[0].amount).toBe(25.5);
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('requires an explicit confirmation and then cascades the deletion', async () => {
    const learner = await createTestUser();
    await prisma.subjectMark.create({
      data: { userId: learner.id, subject: 'History', mark: 65 },
    });

    const refused = await request(app)
      .delete('/api/privacy/account')
      .set('Cookie', learner.cookie ?? '')
      .send({});
    expect(refused.status).toBe(400);

    const deleted = await request(app)
      .delete('/api/privacy/account')
      .set('Cookie', learner.cookie ?? '')
      .send({ confirm: 'DELETE' });
    expect(deleted.status).toBe(204);

    expect(await prisma.user.findUnique({ where: { id: learner.id } })).toBeNull();
    expect(await prisma.subjectMark.count({ where: { userId: learner.id } })).toBe(0);
  });
});

describe('study plans', () => {
  it('falls back to a deterministic plan when the AI is unavailable, then exports an approved calendar', async () => {
    __setTransportForTests(async () => new Response('provider down', { status: 503 }));

    const learner = await createTestUser();
    await prisma.subjectMark.create({
      data: { userId: learner.id, subject: 'Mathematics', mark: 42 },
    });

    const created = await request(app)
      .post('/api/study-plans')
      .set('Cookie', learner.cookie ?? '')
      .set('Idempotency-Key', key('plan'))
      .send({});

    expect(created.status).toBe(201);
    expect(created.body.studyPlan.approved).toBe(false);
    expect(created.body.studyPlan.blocks.length).toBeGreaterThan(0);

    const planId = created.body.studyPlan.id as string;

    const beforeApproval = await request(app)
      .get(`/api/study-plans/${planId}/calendar.ics`)
      .set('Cookie', learner.cookie ?? '');
    expect(beforeApproval.status).toBe(400);

    const approved = await request(app)
      .post(`/api/study-plans/${planId}/approve`)
      .set('Cookie', learner.cookie ?? '')
      .send({});
    expect(approved.status).toBe(200);
    expect(approved.body.studyPlan.approved).toBe(true);

    const calendar = await request(app)
      .get(`/api/study-plans/${planId}/calendar.ics`)
      .set('Cookie', learner.cookie ?? '');
    expect(calendar.status).toBe(200);
    expect(calendar.headers['content-type']).toContain('text/calendar');
    expect(calendar.text).toContain('BEGIN:VCALENDAR');
    expect(calendar.text).toContain('RRULE:FREQ=WEEKLY');

    // Another learner cannot approve or export it.
    const other = await createTestUser();
    const forbiddenApprove = await request(app)
      .post(`/api/study-plans/${planId}/approve`)
      .set('Cookie', other.cookie ?? '')
      .send({});
    expect(forbiddenApprove.status).toBe(404);
  });
});
